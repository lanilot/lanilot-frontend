import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
test('settings validate atomically, apply to new calculations and survive startup without changing saved offers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lanilot-settings-'));let db,server;
 try{
 let app;({app,db}=createApp(join(dir,'test.sqlite'),{auth:false}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,m='GET',b)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 const initial=(await call('/state')).data;assert.equal(initial.settings.company.name,'Lanilot Cargo');assert.deepEqual(initial.defaultCosts,initial.settings.costs);assert.ok(initial.timezones.includes('America/Chicago'));
 for(const invalid of [{...initial.settings,company:{...initial.settings.company,name:' '}},{...initial.settings,company:{...initial.settings.company,email:'invalid'}},{...initial.settings,company:{...initial.settings.company,timezone:'Invalid'}},{...initial.settings,costs:{...initial.settings.costs,mpg:0}},{...initial.settings,costs:{...initial.settings.costs,tolls:-1}},{...initial.settings,costs:{...initial.settings.costs,factoringPercent:101}},{...initial.settings,costs:{...initial.settings.costs,fuelPrice:'4'}},{}])assert.equal((await call('/settings','PUT',invalid)).status,400);
 assert.deepEqual((await call('/state')).data.settings,initial.settings);
 const updated={company:{...initial.settings.company,name:'  Example Cargo  ',timezone:'Asia/Tashkent'},costs:{...initial.settings.costs,fuelPrice:4.25,mpg:7.2,driverPerMile:.7}};
 const result=await call('/settings','PUT',updated);assert.equal(result.status,200);assert.equal(result.data.company.name,'Example Cargo');
 const state=(await call('/state')).data;assert.deepEqual(state.defaultCosts,updated.costs);assert.deepEqual(state.offers,initial.offers);assert.deepEqual(state.trips,initial.trips);
 const offer=await call('/offers','POST',{loadId:'LD-2041',rate:2500});assert.equal(offer.status,201);assert.deepEqual(offer.data.costs,updated.costs);
 await new Promise(r=>server.close(r));server=null;db.close();({db}=createApp(join(dir,'test.sqlite'),{auth:false}));const saved=JSON.parse(db.prepare("SELECT data FROM settings WHERE id='workspace'").get().data);assert.deepEqual(saved,result.data);assert.equal(db.prepare('SELECT count(*) n FROM settings').get().n,1);
 }finally{if(server)await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});
