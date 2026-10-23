import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server/app.js';

test('default startup seed is populated, additive and preserves edits after reopening',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lanilot-seed-')),file=path.join(dir,'test.sqlite');let db;
 try{
  ({db}=createApp(file));
  const counts=()=>Object.fromEntries(['loads','offers','trips','messages'].map(t=>[t,db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n]));
  const original=counts();assert.deepEqual(original,{loads:14,offers:10,trips:6,messages:30});
  db.prepare("UPDATE offers SET draft=?,status='cancelled' WHERE id='seed-offer-LD-2042'").run('A user-edited draft that must remain unchanged');
  db.prepare("UPDATE trips SET status='delivered' WHERE id='seed-trip-LD-2046'").run();
  db.prepare("UPDATE messages SET body='Edited seeded message',read_at='2026-10-22T00:00:00Z' WHERE id='seed-message-LD-2041-1'").run();
  db.close();({db}=createApp(file));assert.deepEqual(counts(),original);
  assert.equal(db.prepare("SELECT draft FROM offers WHERE id='seed-offer-LD-2042'").get().draft,'A user-edited draft that must remain unchanged');
  assert.equal(db.prepare("SELECT status FROM offers WHERE id='seed-offer-LD-2042'").get().status,'cancelled');
  assert.equal(db.prepare("SELECT status FROM trips WHERE id='seed-trip-LD-2046'").get().status,'delivered');
  const message=db.prepare("SELECT * FROM messages WHERE id='seed-message-LD-2041-1'").get();assert.equal(message.body,'Edited seeded message');assert.ok(message.read_at);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true})}
});

test('chat validates messages, deduplicates retries and keeps simulated replies separate from booking',async()=>{
 const {app,db}=createApp();const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const call=async(p,m='GET',body)=>{const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 try{
  const endpoint='/loads/LD-2045/messages',payload={body:'Can you confirm the pickup appointment?',clientId:'test-request-message-001',sender:'broker'};
  assert.equal((await call(endpoint,'POST',{...payload,body:' '})).status,400);
  assert.equal((await call(endpoint,'POST',{...payload,body:'x'.repeat(5001)})).status,400);
  assert.equal((await call('/loads/UNKNOWN/messages','POST',payload)).status,404);
  const created=await call(endpoint,'POST',payload);assert.equal(created.status,201);assert.equal(created.data.sender,'dispatcher');
  const retry=await call(endpoint,'POST',payload);assert.equal(retry.status,200);assert.equal(retry.data.id,created.data.id);
  assert.equal((await call(endpoint,'POST',{...payload,body:'Changed body'})).status,409);
  assert.equal((await call('/loads/LD-2041/messages','POST',payload)).status,409);
  assert.equal((await call('/loads/LD-2045/demo-reply','POST',{clientId:payload.clientId})).status,409);
  const reply=await call('/loads/LD-2045/demo-reply','POST',{clientId:'test-broker-reply-001'});assert.equal(reply.status,201);assert.equal(reply.data.sender,'broker');assert.equal(reply.data.read_at,null);
  const replyRetry=await call('/loads/LD-2045/demo-reply','POST',{clientId:'test-broker-reply-001'});assert.equal(replyRetry.status,200);assert.equal(replyRetry.data.id,reply.data.id);
  await call('/loads/LD-2045/read','POST',{});
  const current=await call('/state');assert.equal(current.data.messages.filter(m=>m.load_id==='LD-2045'&&m.sender==='broker'&&!m.read_at).length,0);
  assert.equal(current.data.offers.some(o=>o.load_id==='LD-2045'),false);
 }finally{await new Promise(r=>server.close(r));db.close()}
});

test('every demo load has coordinates and a cached road route, unknown IDs return 404',async()=>{
 const {app,db}=createApp();const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 try{
  const state=await(await fetch(base+'/state')).json();
  for(const l of state.loads){assert.equal(l.originCoordinates.length,2);assert.equal(l.destinationCoordinates.length,2);const response=await fetch(base+'/loads/'+l.id+'/route');assert.equal(response.status,200);const route=await response.json();assert.equal(route.kind,'road');assert.equal(route.geometry.type,'LineString');assert.ok(route.geometry.coordinates.length>2);assert.ok(route.distanceMeters>0);assert.equal(route.truckValidated,false)}
  assert.equal((await fetch(base+'/loads/NOT-FOUND/route')).status,404);
  const altered={...state.loads[0],destination:'Nashville, TN'};db.prepare('UPDATE loads SET data=? WHERE id=?').run(JSON.stringify(altered),altered.id);const fallback=await(await fetch(base+'/loads/'+altered.id+'/route')).json();assert.equal(fallback.kind,'direct');assert.equal(fallback.geometry.coordinates.length,2);
 }finally{await new Promise(r=>server.close(r));db.close()}
});
