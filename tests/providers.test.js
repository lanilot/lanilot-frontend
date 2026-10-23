import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {parseIdentifiers,checkFactoring} from '../server/factoring.js';
import {safeJson} from '../server/providers.js';

const json=(o,status=200)=>new Response(JSON.stringify(o),{status});
const publicDns=async()=>[{address:'8.8.8.8'}];
// Mocked provider APIs, shaped after the official docs (Samsara, Motive, Geotab, FMCSA QCMobile).
function fakeApis(calls,overrides={}){return async(url,options)=>{calls.push({url,options});const u=new URL(url);
 if(overrides[u.hostname])return overrides[u.hostname](u,options);
 if(u.pathname==='/fleet/vehicles/stats')return json({data:[{id:'1',name:'TRK-108',gps:{time:'2026-10-23T10:00:00Z',latitude:41.5,longitude:-87.5,headingDegrees:180,speedMilesPerHour:61.4}},{id:'2',name:'UNIT-77',gps:{time:'2026-10-23T10:00:00Z',latitude:40,longitude:-90,speedMilesPerHour:0}}],pagination:{hasNextPage:false}});
 if(u.pathname==='/fleet/hos/clocks')return json({data:[{driver:{id:'d1',name:'Alex Morgan'},currentVehicle:{id:'1'},currentDutyStatus:{hosStatusType:'driving'},clocks:{drive:{driveRemainingDurationMs:5*3600000},shift:{shiftRemainingDurationMs:7*3600000},cycle:{cycleRemainingDurationMs:40*3600000}}}],pagination:{hasNextPage:false}});
 if(u.pathname==='/v1/vehicle_locations')return json({vehicles:[{vehicle:{id:7,number:'DEMO-501',current_location:{lat:33.7,lon:-84.4,bearing:90,speed:55,located_at:'2026-10-23T10:01:00Z',description:'Atlanta, GA'},current_driver:{id:3,first_name:'Daniel',last_name:'Brooks'}}}],pagination:{per_page:100,page_no:1,total:1}});
 if(u.pathname==='/v1/available_time')return json({users:[{user:{id:3,duty_status:'on_duty',available_time:{drive:18000,shift:25200,cycle:144000}}}],pagination:{per_page:100,page_no:1,total:1}});
 if(u.pathname==='/apiv1'){const body=JSON.parse(options.body);if(body.method==='Authenticate')return json({result:{path:'ThisServer',credentials:{database:'db',userName:'u',sessionId:'s'}}});
  return json({result:{DeviceStatusInfo:[{device:{id:'b1'},latitude:35.1,longitude:-90,speed:96.56,bearing:45,isDriving:true,dateTime:'2026-10-23T10:00:00Z',driver:{id:'u1'}}],Device:[{id:'b1',name:'TRK-302'}],User:[{id:'u1',firstName:'Michael',lastName:'Davis'}]}[body.params.typeName]})}
 if(u.pathname.startsWith('/qc/services/carriers/docket-number/'))return json({content:[{carrier:{legalName:'ACME LOGISTICS LLC',dotNumber:1234567,allowedToOperate:'Y',brokerAuthorityStatus:'A',commonAuthorityStatus:'N',contractAuthorityStatus:'N'}}]});
 if(u.hostname==='api.factor.example')return json({result:{decision:'NO BUY'},creditLimit:0,daysToPay:null});
 return json({},404)}}
async function start(env,request){const {app,db}=createApp(':memory:',{auth:false,integrationOptions:{env,request,resolve:publicDns}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;const call=async(p,m='GET',b)=>{const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()}};
 return {db,call,close:()=>new Promise(r=>server.close(r))}}

test('without keys ELD and broker checks stay in demo mode and make no outside calls',async()=>{const calls=[];const s=await start({},fakeApis(calls));
 try{const eld=(await s.call('/eld/positions')).data;assert.equal(eld.demo,true);assert.deepEqual(eld.providers,[]);
  const chk=(await s.call('/brokers/check','POST',{query:'Rapid Freight Partners',type:'broker'})).data;assert.equal(chk.demo,true);assert.equal(chk.sources.factoring,'demo');assert.equal(chk.result.dnu,true);
  const providers=(await s.call('/state')).data.providers;assert.ok(providers.every(p=>!p.configured));assert.equal((await s.call('/providers/eld-samsara/check','POST')).status,400);assert.equal((await s.call('/providers/nope/check','POST')).status,404);
  assert.equal(calls.length,0)}finally{await s.close();s.db.close()}});

test('live ELD merges Samsara, Motive and Geotab, matches trucks and keeps unmatched vehicles',async()=>{const calls=[];
 const env={LANILOT_SAMSARA_TOKEN:'samsara-secret',LANILOT_MOTIVE_API_KEY:'motive-secret',LANILOT_GEOTAB_USERNAME:'u',LANILOT_GEOTAB_PASSWORD:'geotab-secret',LANILOT_GEOTAB_DATABASE:'db'};
 const s=await start(env,fakeApis(calls));
 try{const eld=(await s.call('/eld/positions')).data;assert.equal(eld.demo,false);assert.equal(eld.provider,'Samsara + Motive + Geotab');
  const by=Object.fromEntries(eld.units.map(u=>[u.truck,u]));
  assert.equal(by['TRK-108'].matched,true);assert.equal(by['TRK-108'].driver,'Alex Morgan');assert.equal(by['TRK-108'].status,'driving');assert.equal(by['TRK-108'].hos.driveLeftMinutes,300);assert.equal(by['TRK-108'].loadId,'LD-2046');
  assert.equal(by['UNIT-77'].matched,false);
  assert.equal(by['TRK-501'].matched,true);assert.equal(by['TRK-501'].provider,'motive');assert.equal(by['TRK-501'].hos.cycleLeftHours,40);// matched by plate DEMO-501
  assert.equal(by['TRK-302'].driver,'Michael Davis');assert.equal(by['TRK-302'].speed,60);assert.equal(by['TRK-302'].hos,null);
  const samsaraCall=calls.find(c=>c.url.includes('api.samsara.com'));assert.equal(samsaraCall.options.headers.Authorization,'Bearer samsara-secret');assert.equal(samsaraCall.options.redirect,'manual');
  assert.equal(calls.find(c=>c.url.includes('api.gomotive.com')).options.headers['X-Api-Key'],'motive-secret');
  // cached for ~30 s: a second request makes no new calls
  const before=calls.length;await s.call('/eld/positions');assert.equal(calls.length,before);
  const state=JSON.stringify((await s.call('/state')).data);for(const secret of ['samsara-secret','motive-secret','geotab-secret'])assert.ok(!state.includes(secret));
  assert.equal((await s.call('/providers/eld-samsara/check','POST')).data.status,'connected');
 }finally{await s.close();s.db.close()}});

test('one failing ELD provider is reported without hiding the others',async()=>{const calls=[];
 const s=await start({LANILOT_SAMSARA_TOKEN:'x',LANILOT_MOTIVE_API_KEY:'bad'},fakeApis(calls,{'api.gomotive.com':()=>json({error:'unauthorized'},401)}));
 try{const eld=(await s.call('/eld/positions')).data;const motive=eld.providers.find(p=>p.id==='motive');assert.equal(motive.ok,false);assert.match(motive.error,/отклонил доступ/);assert.equal(eld.providers.find(p=>p.id==='samsara').count,2);assert.equal(eld.units.length,2);
  const check=(await s.call('/providers/eld-motive/check','POST')).data;assert.equal(check.status,'error');assert.equal((await s.call('/state')).data.providers.find(p=>p.id==='eld-motive').status,'error');
 }finally{await s.close();s.db.close()}});

test('broker check uses FMCSA authority and the configured factoring API, and saves the result',async()=>{const calls=[];
 const env={LANILOT_FMCSA_WEBKEY:'fmcsa-key',LANILOT_FACTORING_PROVIDER:'otr',LANILOT_FACTORING_OTR_URL:'https://api.factor.example/credit?mc={mc}',LANILOT_FACTORING_OTR_API_KEY:'factor-key',LANILOT_FACTORING_OTR_KEY_HEADER:'X-Partner-Key',LANILOT_FACTORING_OTR_FIELD_STATUS:'result.decision'};
 const s=await start(env,fakeApis(calls));
 try{const r=(await s.call('/brokers/check','POST',{query:'MC-445566',type:'broker'})).data;
  assert.equal(r.sources.factoring,'live');assert.equal(r.sources.fmcsa,'live');assert.equal(r.provider,'OTR Solutions');assert.equal(r.fmcsa.legalName,'ACME LOGISTICS LLC');assert.equal(r.fmcsa.brokerAuthority,'active');
  assert.equal(r.result.name,'ACME LOGISTICS LLC');assert.equal(r.result.factoring,'declined');assert.equal(r.result.authority,'active');assert.equal(r.result.mc,'MC-445566');
  const factorCall=calls.find(c=>c.url.startsWith('https://api.factor.example'));assert.equal(new URL(factorCall.url).searchParams.get('mc'),'445566');assert.equal(factorCall.options.headers['X-Partner-Key'],'factor-key');
  assert.ok(calls.find(c=>c.url.includes('/carriers/docket-number/445566')&&c.url.includes('webKey=fmcsa-key')));
  const state=(await s.call('/state')).data;assert.equal(state.factoringProvider,'OTR Solutions');assert.ok(state.brokers.some(b=>b.name==='ACME LOGISTICS LLC'&&b.factoring==='declined'));
  assert.ok(!JSON.stringify(state).includes('factor-key')&&!JSON.stringify(state).includes('api.factor.example'));
  assert.equal(state.providers.find(p=>p.id==='factoring-otr').active,true);
  assert.match((await s.call('/providers/factoring-otr/check','POST')).data.result,/TEST_MC/);
 }finally{await s.close();s.db.close()}});

test('provider HTTP client refuses plain HTTP, embedded credentials and private addresses',async()=>{
 const context={env:{},request:async()=>json({}),resolve:publicDns};
 await assert.rejects(safeJson(context,'http://api.samsara.com/x'),/HTTPS/);
 await assert.rejects(safeJson(context,'https://user:pass@api.samsara.com/x'),/HTTPS/);
 await assert.rejects(safeJson({...context,resolve:async()=>[{address:'10.0.0.5'}]},'https://api.factor.example/x'),/внутреннюю/);
 await assert.rejects(checkFactoring({...context,env:{LANILOT_FACTORING_RTS_URL:'https://api.factor.example/c?mc={mc}'}},'rts',{mc:'',dot:'',name:'x'}),/MC или DOT/);
});

test('MC / DOT parsing for broker queries',()=>{
 assert.deepEqual(parseIdentifiers('MC-123456'),{mc:'123456',dot:'',name:''});
 assert.deepEqual(parseIdentifiers('USDOT 1234567'),{mc:'',dot:'1234567',name:''});
 assert.equal(parseIdentifiers('445566').mc,'445566');
 assert.deepEqual(parseIdentifiers('Rapid',{name:'Rapid Freight Partners',mc:'MC-DEMO-5501',dot:''}),{mc:'',dot:'',name:'Rapid Freight Partners'});
});
