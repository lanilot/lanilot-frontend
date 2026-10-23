import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {matchingLoads} from '../server/radar.js';
test('radar matches exact route, equipment and inclusive minimum rate with deadhead',()=>{
 const loads=[{id:'a',origin:'Chicago, IL',destination:'Dallas, TX',equipment:'Dry Van',rate:2000,miles:900,deadhead:100},{id:'b',origin:'Chicago Heights, IL',destination:'Dallas, TX',equipment:'Dry Van',rate:5000,miles:1000,deadhead:0},{id:'c',origin:'Chicago, IL',destination:'Dallas, TX',equipment:'Reefer',rate:2500,miles:900,deadhead:100}];
 const radar={origin:' chicago, il ',destination:'DALLAS, TX',equipment:'Dry Van',min_rate:2000,rate_type:'total',enabled:true};
 assert.deepEqual(matchingLoads(radar,loads).map(l=>l.id),['a']);assert.deepEqual(matchingLoads({...radar,min_rate:2001},loads),[]);assert.deepEqual(matchingLoads({...radar,rate_type:'rpm',min_rate:2},loads).map(l=>l.id),['a']);assert.deepEqual(matchingLoads({...radar,rate_type:'rpm',min_rate:2.01},loads),[]);assert.deepEqual(matchingLoads({...radar,enabled:false},loads),[]);assert.deepEqual(matchingLoads({...radar,origin:'',destination:'',equipment:'',min_rate:0},loads).map(l=>l.id),['b','c','a']);
});
test('radar API creates, edits, toggles, checks results and preserves startup seed changes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lanilot-radar-'));let db,server;
 try{let app;({app,db}=createApp(join(dir,'test.sqlite')));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,m='GET',b)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 const state=(await call('/state')).data;assert.equal(state.radars.length,4);assert.equal(state.radars.find(r=>r.id==='seed-radar-chicago-van').matchIds.length,2);assert.equal(state.radars.find(r=>r.id==='seed-radar-cargo-van').matchIds.length,0);
 const body={name:'My Chicago → Dallas',origin:'Chicago, IL',destination:'Dallas, TX',equipment:'Dry Van',minRate:2400,rateType:'total',enabled:true};
 for(const invalid of [{...body,name:' '},{...body,minRate:-1},{...body,minRate:'2400'},{...body,equipment:'Unknown'},{...body,enabled:1},{...body,rateType:'other'},{...body,rateType:'rpm',minRate:1001}])assert.equal((await call('/radars','POST',invalid)).status,400);
 const created=await call('/radars','POST',body);assert.equal(created.status,201);const id=created.data.id;
 const results=await call('/radars/'+id+'/results');assert.equal(results.status,200);assert.deepEqual(results.data.loads.map(l=>l.id),['LD-2041']);assert.equal(results.data.demo,true);
 assert.equal((await call('/radars/'+id,'PUT',{...body,minRate:3000})).status,200);assert.equal((await call('/radars/'+id+'/results')).data.loads.length,0);
 assert.equal((await call('/radars/'+id,'PUT',{...body,rateType:'rpm',minRate:2.5})).status,200);assert.equal((await call('/radars/'+id+'/results')).data.loads.length,1);
 assert.equal((await call('/radars/'+id,'PATCH',{enabled:false})).status,200);assert.equal((await call('/radars/'+id+'/results')).data.enabled,false);assert.equal((await call('/radars/'+id+'/results')).data.loads.length,0);
 assert.equal((await call('/radars/'+id,'PATCH',{enabled:'true'})).status,400);assert.equal((await call('/radars/missing','PATCH',{enabled:true})).status,404);assert.equal((await call('/radars/missing/results')).status,404);assert.equal((await call('/radars/missing','PUT',body)).status,404);
 await call('/radars/seed-radar-chicago-van','PUT',{...body,name:'Edited seed',enabled:false,minRate:2100});
 await new Promise(r=>server.close(r));server=null;db.close();({db}=createApp(join(dir,'test.sqlite')));assert.equal(db.prepare('SELECT count(*) n FROM radars').get().n,5);const seeded=db.prepare("SELECT * FROM radars WHERE id='seed-radar-chicago-van'").get();assert.equal(seeded.name,'Edited seed');assert.equal(seeded.enabled,0);assert.equal(seeded.min_rate,2100);assert.equal(db.prepare('SELECT enabled FROM radars WHERE id=?').get(id).enabled,0);
 }finally{if(server)await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});
