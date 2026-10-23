import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {estimateMiles} from '../server/lanes.js';
import {costsForDriver,defaultCosts,calculateProfit} from '../server/domain.js';

async function start(path){const {app,db}=createApp(path);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(p,m='GET',b)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${p}`,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 return {db,call,close:()=>new Promise(r=>server.close(r))}}

test('driver pay: company default is $0.75/mi and a driver rate overrides it',()=>{
 assert.equal(defaultCosts.driverPerMile,0.75);
 assert.equal(costsForDriver(defaultCosts,{pay_per_mile:0.8}).driverPerMile,0.8);
 assert.equal(costsForDriver(defaultCosts,{pay_per_mile:null}).driverPerMile,0.75);
 assert.equal(costsForDriver(defaultCosts,null).driverPerMile,0.75);
 assert.equal(calculateProfit(1000,100,0,costsForDriver(defaultCosts,{pay_per_mile:0.8})).driver,80);
});

test('fleet saves per-driver pay, rejects invalid values and finances use it',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lanilot-pay-'));const s=await start(join(dir,'t.sqlite'));
 try{
  const state=(await s.call('/state')).data;assert.equal(state.drivers.find(d=>d.name==='Alex Morgan').pay_per_mile,0.8);
  const f=state.finances.find(x=>x.tripId==='seed-trip-LD-2046');const l=state.loads.find(x=>x.id==='LD-2046');assert.equal(f.driver,Math.round((l.miles+l.deadhead)*0.8*100)/100);
  const base={name:'Pay Tester',phone:'',location:'',equipment:'Any',availability:'available',notes:''};
  for(const bad of [-1,0,6,'0.8'])assert.equal((await s.call('/drivers','POST',{...base,payPerMile:bad})).status,400);
  const created=await s.call('/drivers','POST',{...base,payPerMile:0.8});assert.equal(created.status,201);assert.equal(created.data.pay_per_mile,0.8);
  const cleared=await s.call('/drivers/'+created.data.id,'PUT',{...base,payPerMile:null});assert.equal(cleared.data.pay_per_mile,null);
  // A cleared demo rate is not re-seeded on restart.
  await s.call('/drivers/DRV-108','PUT',{...state.drivers.find(d=>d.id==='DRV-108'),payPerMile:null});await s.close();
  const again=await start(join(dir,'t.sqlite'));try{assert.equal((await again.call('/state')).data.drivers.find(d=>d.id==='DRV-108').pay_per_mile,null)}finally{await again.close();again.db.close()}
 }finally{s.db.close();rmSync(dir,{recursive:true,force:true})}
});

test('broker check finds by name, MC or DOT, records history and edits the DNU list',async()=>{
 const s=await start(':memory:');
 try{
  const state=(await s.call('/state')).data;
  assert.ok(state.brokers.find(b=>b.name==='Rapid Freight Partners').dnu);
  assert.equal(state.brokers.find(b=>b.name==='Midwest Haul Brokers').freightguard,1);
  // Real broker names from the board never carry negative demo flags.
  for(const b of state.brokers.filter(b=>!b.mc))assert.ok(!b.dnu&&!b.freightguard,b.name);
  for(const query of ['Rapid Freight Partners','5501','9101']){const r=await s.call('/brokers/check','POST',{query,type:'broker'});assert.equal(r.status,200);assert.equal(r.data.result?.name,'Rapid Freight Partners')}
  const missing=await s.call('/brokers/check','POST',{query:'Nobody Logistics',type:'broker'});assert.equal(missing.data.found,false);
  assert.equal((await s.call('/brokers/check','POST',{query:'x',type:'broker'})).status,400);
  assert.equal((await s.call('/brokers/check','POST',{query:'Blue Ridge',type:'other'})).status,400);
  assert.equal((await s.call('/brokers/check','POST',{query:'Blue Ridge',type:'carrier'})).data.result.factoring,'approved');
  assert.ok((await s.call('/state')).data.brokerChecks.length>=6);
  const id=state.brokers.find(b=>b.name==='C.H. Robinson').id;
  assert.equal((await s.call('/brokers/'+id,'PUT',{dnu:true})).status,400);
  const flagged=await s.call('/brokers/'+id,'PUT',{dnu:true,dnuReason:'Late payment'});assert.equal(flagged.data.dnu,true);
  const unflagged=await s.call('/brokers/'+id,'PUT',{dnu:false});assert.equal(unflagged.data.dnu,false);assert.equal(unflagged.data.dnu_reason,'');
  const added=await s.call('/brokers','POST',{name:'New Broker LLC',type:'broker',mc:'123456',dnu:false});assert.equal(added.status,201);
  assert.equal((await s.call('/brokers','POST',{name:'new broker llc',type:'broker'})).status,409);
 }finally{await s.close();s.db.close()}
});

test('dedicated lanes: create, validate, estimate miles, edit and delete',async()=>{
 const s=await start(':memory:');
 try{
  assert.equal((await s.call('/state')).data.lanes.length,3);
  const body={origin:'Chicago, IL',destination:'Atlanta, GA',equipment:'Reefer',broker:'Arrive Logistics',rate:2900,days:[2,4],startDate:'2026-01-05',endDate:'',contact:'',notes:'',active:true};
  for(const bad of [{...body,origin:''},{...body,destination:'Chicago, IL'},{...body,equipment:'Tank'},{...body,rate:0},{...body,days:[]},{...body,days:[8]},{...body,endDate:'2025-01-01'},{...body,active:'yes'}])assert.equal((await s.call('/lanes','POST',bad)).status,400);
  const created=await s.call('/lanes','POST',body);assert.equal(created.status,201);
  const lane=(await s.call('/state')).data.lanes.find(l=>l.id===created.data.id);assert.equal(lane.miles,estimateMiles('Chicago, IL','Atlanta, GA'));assert.deepEqual(lane.days,[2,4]);
  assert.ok(lane.miles>650&&lane.miles<800);
  assert.equal((await s.call('/lanes/'+lane.id,'PUT',{...body,miles:716,active:false})).status,200);
  const edited=(await s.call('/state')).data.lanes.find(l=>l.id===lane.id);assert.equal(edited.miles,716);assert.equal(edited.active,false);
  assert.equal((await s.call('/lanes/'+lane.id,'DELETE')).status,200);assert.equal((await s.call('/lanes/'+lane.id,'DELETE')).status,404);
 }finally{await s.close();s.db.close()}
});

test('ELD positions: every truck reported, in-transit truck moves along its trip',async()=>{
 const s=await start(':memory:');
 try{
  const {data}=await s.call('/eld/positions');const trucks=(await s.call('/state')).data.trucks;
  assert.equal(data.units.length,trucks.length);assert.equal(data.demo,true);
  for(const u of data.units){assert.ok(Number.isFinite(u.lat)&&Number.isFinite(u.lng));assert.ok(u.lat>24&&u.lat<50&&u.lng>-125&&u.lng<-66,u.truck)}
  const moving=data.units.find(u=>u.truck==='TRK-108');assert.equal(moving.loadId,'LD-2046');assert.ok(['driving','on_duty'].includes(moving.status));assert.ok(moving.progress>0&&moving.progress<1);
  assert.equal(data.units.find(u=>u.truck==='TRK-501').status,'maintenance');
 }finally{await s.close();s.db.close()}
});
