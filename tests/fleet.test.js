import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
test('fleet CRUD validates data, preserves assignments on rename and blocks unavailable resources across trip actions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lanilot-fleet-'));let db,server;
 try{
 let app;({app,db}=createApp(join(dir,'test.sqlite'),{auth:false}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,m='GET',b)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 const initial=(await call('/state')).data;assert.equal(initial.drivers.length,8);assert.equal(initial.trucks.length,8);assert.equal(initial.drivers.find(d=>d.id==='DRV-501').availability,'vacation');assert.equal(initial.trucks.find(t=>t.id==='TRK-501').availability,'maintenance');
 const d={name:'Test Driver',phone:'555-0100',location:'Austin, TX',equipment:'Dry Van',availability:'available',notes:'Test'},t={id:'TEST-901',plate:'ABC-901',location:'Austin, TX',equipment:'Dry Van',availability:'available',notes:'Test'};
 for(const b of [{...d,name:' '},{...d,availability:'busy'},{...d,equipment:'Unknown'},{...d,notes:'a'.repeat(1001)}])assert.equal((await call('/drivers','POST',b)).status,400);
 for(const b of [{...t,id:' '},{...t,id:'bad/id'},{...t,equipment:'Any'},{...t,availability:'vacation'}])assert.equal((await call('/trucks','POST',b)).status,400);
 const driver=await call('/drivers','POST',d),truck=await call('/trucks','POST',t);assert.equal(driver.status,201);assert.equal(truck.status,201);
 assert.equal((await call('/drivers','POST',{...d,name:'test driver'})).status,409);assert.equal((await call('/trucks','POST',{...t,id:'test-901'})).status,409);
 assert.equal((await call('/drivers/missing','PUT',d)).status,404);
 const tripBody={loadId:'LD-2041',driver:d.name,truck:t.id,pickup:'2030-01-01',delivery:'2030-01-03',status:'planned'};
 await call('/drivers/'+driver.data.id,'PUT',{...d,availability:'off_duty'});assert.equal((await call('/trips','POST',tripBody)).status,409);
 await call('/drivers/'+driver.data.id,'PUT',d);await call('/trucks/'+t.id,'PUT',{...t,availability:'maintenance'});assert.equal((await call('/trips','POST',tripBody)).status,409);
 await call('/trucks/'+t.id,'PUT',t);const trip=await call('/trips','POST',tripBody);assert.equal(trip.status,201);
 assert.equal((await call('/drivers/'+driver.data.id,'PUT',{...d,availability:'vacation'})).status,409);assert.equal((await call('/trucks/'+t.id,'PUT',{...t,equipment:'Reefer'})).status,409);
 assert.equal((await call('/drivers/'+driver.data.id,'PUT',{...d,name:'Renamed Driver'})).status,200);assert.equal(db.prepare('SELECT driver FROM trips WHERE id=?').get(trip.data.id).driver,'Renamed Driver');
 assert.equal((await call('/trips','POST',{...tripBody,loadId:'LD-2049',driver:'Renamed Driver',truck:'TRK-402'})).status,409);
 await call('/trips/'+trip.data.id+'/cancel','POST',{reason:'Test cancellation',confirmed:true});
 assert.equal((await call('/drivers/'+driver.data.id,'PUT',{...d,name:'Renamed Driver',availability:'off_duty'})).status,200);assert.equal((await call('/trips/'+trip.data.id+'/restore','POST',{status:'planned',confirmed:true})).status,409);
 const vacation=initial.drivers.find(d=>d.id==='DRV-501');assert.equal((await call('/drivers/'+vacation.id,'PUT',{...vacation,name:'Taylor Updated',availability:'available'})).status,200);
 await new Promise(r=>server.close(r));server=null;db.close();({db}=createApp(join(dir,'test.sqlite'),{auth:false}));assert.equal(db.prepare('SELECT name FROM drivers WHERE id=?').get(vacation.id).name,'Taylor Updated');assert.equal(db.prepare('SELECT availability FROM drivers WHERE id=?').get(driver.data.id).availability,'off_duty');assert.equal(db.prepare('SELECT count(*) n FROM drivers').get().n,9);assert.equal(db.prepare('SELECT count(*) n FROM trucks').get().n,9);
 }finally{if(server)await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});
