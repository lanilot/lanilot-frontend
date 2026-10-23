import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
test('direct load planning uses custom dates, checks both resources and preserves broker status',async()=>{
 const {app,db}=createApp(':memory:',{auth:false});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 try{
 const initial=(await call('/state')).data;assert.equal(initial.drivers.length,8);assert.equal(initial.trucks.length,8);assert.ok(initial.offers.some(o=>o.load_id==='LD-2049'&&o.status==='accepted'));
 const body={loadId:'LD-2041',driver:'Jordan Miller',truck:'TRK-401',pickup:'2026-11-01',delivery:'2026-11-03',status:'planned'};
 assert.equal((await call('/trips',{...body,delivery:'2026-10-31'})).status,400);
 assert.equal((await call('/trips',{...body,pickup:'2026-02-30'})).status,400);
 assert.equal((await call('/trips',{...body,status:'nonsense'})).status,400);
 assert.equal((await call('/trips',{...body,status:'in_transit'})).status,409);
 assert.equal((await call('/trips',body)).status,201);assert.equal((await call('/trips',body)).status,409);
 const state=(await call('/state')).data,trip=state.trips.find(t=>t.load_id===body.loadId);assert.equal(trip.pickup,body.pickup);assert.equal(trip.load.delivery,body.delivery);assert.equal(trip.offer.status,'draft');
 const other={...body,loadId:'LD-2049'};
 assert.equal((await call('/trips',{...other,truck:'TRK-204'})).status,409);
 assert.equal((await call('/trips',{...other,driver:'Daniel Brooks'})).status,409);
 assert.equal((await call('/trips',{...other,pickup:'2026-11-04',delivery:'2026-11-06',status:'in_transit'})).status,201);
 assert.equal((await call('/state')).data.trips.find(t=>t.load_id==='LD-2049').status,'in_transit');
 }finally{await new Promise(r=>server.close(r));db.close()}
});

test('editing a seeded trip is atomic, checks resources excluding itself and survives startup seed',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'lanilot-trip-edit-'));let server,db;
 try{
 let app;({app,db}=createApp(join(dir,'test.sqlite'),{auth:false}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 const initial=(await call('/state')).data,t=initial.trips.find(t=>t.load_id==='LD-2044'),other=initial.trips.find(t=>t.load_id==='LD-2046');
 const path='/trips/'+t.id,original={driver:t.driver,truck:t.truck,pickup:t.pickup,delivery:t.delivery,status:t.status};
 assert.equal((await call(path,'PUT',original)).status,200,'same assignment is not a conflict');
 for(const invalid of [{pickup:'2026-02-30'},{delivery:'2026-01-01'},{driver:''},{truck:''},{status:'wrong'}])assert.equal((await call(path,'PUT',{...original,...invalid})).status,400);
 const overlap={...original,pickup:other.pickup,delivery:other.delivery};
 assert.equal((await call(path,'PUT',{...overlap,driver:other.driver.toUpperCase()})).status,409);
 assert.equal((await call(path,'PUT',{...overlap,truck:other.truck.toLowerCase()})).status,409);
 assert.deepEqual(db.prepare('SELECT driver,truck,pickup,delivery,status FROM trips WHERE id=?').get(t.id),Object.assign(Object.create(null),original));
 const updated={driver:'Casey Taylor',truck:'TRK-402',pickup:'2026-11-12',delivery:'2026-11-15',status:'in_transit'};
 assert.equal((await call(path,'PUT',updated)).status,200);
 const after=(await call('/state')).data;assert.equal(after.trips.length,initial.trips.length);assert.equal(after.offers.find(o=>o.id===t.offer_id).status,'accepted');assert.equal(after.loads.find(l=>l.id===t.load_id).pickup,t.load.pickup);assert.equal(after.trips.find(x=>x.id===t.id).load.pickup,updated.pickup);
 assert.equal((await call(path,'PUT',{...updated,status:'completed'})).status,200);
 assert.equal((await call(path,'PUT',updated)).status,200,'explicit editor can correct a status');
 const plan=await call('/trips','POST',{loadId:'LD-2043',driver:'Jordan Miller',truck:'TRK-401',pickup:'2026-12-01',delivery:'2026-12-02'});
 assert.equal(plan.status,201);assert.equal((await call('/trips/'+plan.data.id,'PUT',{...updated,status:'in_transit'})).status,409);
 assert.equal((await call('/trips/'+plan.data.id,'PUT',{...updated,status:'planned',pickup:'2026-12-01',delivery:'2026-12-02'})).status,200);
 assert.equal((await call('/trips/missing','PUT',updated)).status,404);
 await new Promise(r=>server.close(r));server=null;db.close();({db}=createApp(join(dir,'test.sqlite'),{auth:false}));
 const saved=db.prepare('SELECT driver,truck,pickup,delivery,status FROM trips WHERE id=?').get(t.id);assert.deepEqual({...saved},updated);
 }finally{if(server)await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});

test('cancellation requires confirmation and reason, frees resources and survives default seed',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'lanilot-cancel-'));let db,server;
 try{
 let app;({app,db}=createApp(join(dir,'test.sqlite'),{auth:false}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,m='GET',b)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 const initial=(await call('/state')).data,t=initial.trips.find(t=>t.load_id==='LD-2044'),url='/trips/'+t.id+'/cancel';
 const seeded=initial.trips.find(t=>t.load_id==='LD-2050');assert.equal(seeded.status,'cancelled');assert.ok(seeded.cancellation_reason&&seeded.cancelled_at);
 for(const body of [{reason:'Нет груза'},{reason:'Нет груза',confirmed:false},{reason:' ',confirmed:true},{reason:'ab',confirmed:true},{reason:'a'.repeat(1001),confirmed:true}])assert.equal((await call(url,'POST',body)).status,400);
 assert.equal(db.prepare('SELECT status FROM trips WHERE id=?').get(t.id).status,'planned');
 const request={loadId:'LD-2049',driver:t.driver,truck:t.truck,pickup:t.pickup,delivery:t.delivery};
 assert.equal((await call('/trips','POST',request)).status,409);
 assert.equal((await call(url,'POST',{reason:'  Брокер отменил погрузку  ',confirmed:true})).status,200);
 const saved=db.prepare('SELECT * FROM trips WHERE id=?').get(t.id);assert.equal(saved.status,'cancelled');assert.equal(saved.cancellation_reason,'Брокер отменил погрузку');assert.ok(saved.cancelled_at);assert.equal(saved.driver,t.driver);assert.equal(saved.truck,t.truck);
 assert.equal((await call(url,'POST',{reason:'Другая причина',confirmed:true})).status,200);assert.equal(db.prepare('SELECT cancellation_reason FROM trips WHERE id=?').get(t.id).cancellation_reason,saved.cancellation_reason);
 assert.equal((await call('/trips','POST',request)).status,201,'cancelled trip no longer reserves resources');
 assert.equal((await call('/trips/'+t.id,'PUT',{...request,status:'planned'})).status,409);
 assert.equal((await call('/trips/'+t.id,'PATCH',{status:'in_transit'})).status,409);
 const completed=initial.trips.find(t=>t.status==='completed');assert.equal((await call('/trips/'+completed.id+'/cancel','POST',{reason:'Нельзя отменять',confirmed:true})).status,409);
 assert.equal((await call('/trips/missing/cancel','POST',{reason:'Нет рейса',confirmed:true})).status,404);
 assert.equal(db.prepare('SELECT status FROM offers WHERE id=?').get(t.offer_id).status,'accepted');
 await new Promise(r=>server.close(r));server=null;db.close();({db}=createApp(join(dir,'test.sqlite'),{auth:false}));const reopened=db.prepare('SELECT * FROM trips WHERE id=?').get(t.id);assert.equal(reopened.status,'cancelled');assert.equal(reopened.cancellation_reason,saved.cancellation_reason);assert.equal(reopened.cancelled_at,saved.cancelled_at);
 }finally{if(server)await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});

test('restore confirms status, checks each resource, preserves history and survives startup seed',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'lanilot-restore-'));let db,server;
 try{
 let app;({app,db}=createApp(join(dir,'test.sqlite'),{auth:false}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,m='GET',b)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 const state=(await call('/state')).data,trip=state.trips.find(t=>t.load_id==='LD-2051'),blocker=state.trips.find(t=>t.load_id==='LD-2046'),url='/trips/'+trip.id+'/restore';
 assert.equal(trip.status,'cancelled');assert.ok(trip.history.some(h=>h.action==='cancelled'));
 for(const b of [{status:'planned'},{confirmed:true},{status:'cancelled',confirmed:true},{status:'wrong',confirmed:true}])assert.equal((await call(url,'POST',b)).status,400);
 assert.equal((await call(url,'POST',{status:'planned',confirmed:true})).status,409);
 db.prepare('UPDATE trips SET driver=? WHERE id=?').run('Other driver',blocker.id);
 assert.equal((await call(url,'POST',{status:'in_transit',confirmed:true})).status,409,'truck still occupied');
 db.prepare('UPDATE trips SET driver=?,truck=? WHERE id=?').run(blocker.driver,'OTHER-TRUCK',blocker.id);
 assert.equal((await call(url,'POST',{status:'planned',confirmed:true})).status,409,'driver still occupied');
 assert.equal(db.prepare('SELECT status FROM trips WHERE id=?').get(trip.id).status,'cancelled');assert.equal(db.prepare('SELECT count(*) n FROM trip_history WHERE trip_id=?').get(trip.id).n,1);
 db.prepare('UPDATE trips SET driver=? WHERE id=?').run('Other driver',blocker.id);
 assert.equal((await call(url,'POST',{status:'in_transit',confirmed:true})).status,200);
 const restored=(await call('/state')).data.trips.find(t=>t.id===trip.id);assert.equal(restored.status,'in_transit');assert.ok(restored.restored_at);assert.equal(restored.cancellation_reason,trip.cancellation_reason);assert.equal(restored.history.length,2);assert.equal(restored.history[1].status,'in_transit');assert.equal(restored.driver,trip.driver);assert.equal(restored.truck,trip.truck);
 assert.equal((await call(url,'POST',{status:'planned',confirmed:true})).status,409,'active trip cannot be restored twice');
 assert.equal((await call('/trips/missing/restore','POST',{status:'planned',confirmed:true})).status,404);
 const p=await call('/trips','POST',{loadId:'LD-2043',driver:'Temporary driver',truck:'TEMP',pickup:'2026-12-10',delivery:'2026-12-11'});assert.equal(p.status,201);
 await call('/trips/'+p.data.id+'/cancel','POST',{reason:'Тестовая отмена',confirmed:true});
 assert.equal((await call('/trips/'+p.data.id+'/restore','POST',{status:'in_transit',confirmed:true})).status,409);
 assert.equal((await call('/trips/'+p.data.id+'/restore','POST',{status:'planned',confirmed:true})).status,200);
 await new Promise(r=>server.close(r));server=null;db.close();({db}=createApp(join(dir,'test.sqlite'),{auth:false}));const saved=db.prepare('SELECT * FROM trips WHERE id=?').get(trip.id);assert.equal(saved.status,'in_transit');assert.equal(saved.restored_at,restored.restored_at);assert.equal(db.prepare('SELECT count(*) n FROM trip_history WHERE trip_id=?').get(trip.id).n,2);
 }finally{if(server)await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});
