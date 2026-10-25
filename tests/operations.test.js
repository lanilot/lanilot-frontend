import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server/app.js';
import {scoreEmail} from '../server/operations.js';

async function start(path){const {app}=createApp(path,{auth:false});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,m='GET',b)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 return {call,close:()=>new Promise(r=>server.close(r))}}

test('email guard: lookalike, free mail, high rate and outside links raise the risk; a real broker stays clean',()=>{
 const mail=(sender_name,sender_email,body,rate=2000,miles=700,reply_to='')=>scoreEmail({sender_name,sender_email,reply_to,subject:'Load',body,rate,miles},3);
 assert.equal(mail('C.H. Robinson','loads@chrobinson-freight.com','Book now https://chrobinson-freight.com/login',4900).risk,'high');
 assert.equal(mail('TQL','tql.desk@gmail.com','Verify https://bit.ly/x').risk,'high');
 const clean=mail('Echo Global','carriers@echo.com','Reefer, $2,000 all-in.');assert.equal(clean.risk,'low');assert.deepEqual(clean.reasons,[]);
 assert.ok(mail('Coyote Logistics','ops@coyote.com','Sign here',2000,700,'x@outlook.com').reasons.some(r=>r.code==='reply_to'));
});

test('fuel overuse alerts, safety expirations, broker updates and the updater role',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lanilot-ops-')),path=join(dir,'t.sqlite');const s=await start(path);
 try{
  const state=(await s.call('/state')).data;
  const alerts=state.fuel.transactions.filter(t=>t.flags.length);
  assert.ok(alerts.some(t=>t.truck==='TRK-302'&&t.flags.includes('tank')&&t.flags.includes('overuse')));
  assert.ok(alerts.some(t=>t.flags.includes('non_fuel')));
  assert.ok(state.fuel.trucks.find(t=>t.truck==='TRK-156').low);assert.ok(!state.fuel.trucks.find(t=>t.truck==='TRK-108').low);
  assert.equal((await s.call('/fuel/'+alerts[0].id,'PATCH',{reviewed:true})).status,200);
  assert.ok((await s.call('/state')).data.fuel.transactions.find(t=>t.id===alerts[0].id).reviewed);
  assert.ok(state.safety.documents.some(d=>d.state==='expired')&&state.safety.documents.some(d=>d.state==='soon'));
  assert.equal((await s.call('/updates','POST',{tripId:'seed-trip-LD-2046',kind:'eta',body:'On schedule',channels:[]})).status,400);
  assert.equal((await s.call('/updates','POST',{tripId:'seed-trip-LD-2046',kind:'eta',body:'On schedule',channels:['email','teams']})).status,201);
  assert.equal((await s.call('/state')).data.brokerUpdates.filter(u=>u.trip_id==='seed-trip-LD-2046').length,3);
  assert.equal((await s.call('/inbox/seed-mail-1','PATCH',{status:'blocked'})).status,200);
 }finally{await s.close()}
 // Older databases get the updater role added to the memberships CHECK.
 const raw=new DatabaseSync(path);raw.exec("INSERT INTO users VALUES('u1','u@x.com','U','h','2026-01-01')");raw.exec("INSERT INTO memberships VALUES('u1','workspace','updater','2026-01-01')");raw.close();
 rmSync(dir,{recursive:true,force:true});
});
