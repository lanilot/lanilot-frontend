import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../server/app.js';
import {slugFromHost,asCompany} from '../server/tenancy.js';
import {onboardingFunnel} from '../server/onboarding.js';

// Real HTTP with a Host header (fetch cannot set it) and cookies, like a browser on <slug>.lanilot.com.
function call(port,method,path,{host='app.lanilot.com',body,cookie,origin}={}){
 return new Promise((resolve,reject)=>{
  const data=body?JSON.stringify(body):null;
  const r=http.request({host:'127.0.0.1',port,method,path:'/api'+path,headers:{Host:host,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},res=>{
   let buf='';res.on('data',c=>buf+=c);res.on('end',()=>resolve({status:res.statusCode,data:buf?JSON.parse(buf):null,cookie:(res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ')}));
  });r.on('error',reject);if(data)r.write(data);r.end();
 });
}
async function start(options){const out=createApp(':memory:',{baseDomain:'lanilot.com',...options});const server=out.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return {...out,port:server.address().port,close:()=>new Promise(r=>server.close(r))}}
const addCompany=(s,id,slug,{demo=0,status='active'}={})=>{s.db.raw.prepare('INSERT INTO companies(id,slug,name,status,demo,created_at) VALUES(?,?,?,?,?,?)').run(id,slug,slug.toUpperCase(),status,demo,new Date().toISOString());s.seedCompany({id,demo})};

test('host names map to company slugs',()=>{
 assert.equal(slugFromHost('acme.lanilot.com','lanilot.com'),'acme');
 assert.equal(slugFromHost('ACME.lanilot.com:443','lanilot.com'),'acme');
 assert.equal(slugFromHost('app.lanilot.com','lanilot.com'),'app');
 assert.equal(slugFromHost('lanilot.com','lanilot.com'),'app');
 assert.equal(slugFromHost('localhost:5180','lanilot.com'),'app');
 assert.equal(slugFromHost('127.0.0.1:3001','lanilot.com'),'app');
 assert.equal(slugFromHost('acme.localhost:5180','lanilot.com'),'acme');
 assert.equal(slugFromHost('a.b.lanilot.com','lanilot.com'),null);
});

test('companies are isolated: data, identical demo IDs and writes never cross',async()=>{
 const s=await start({auth:false});
 try{
  addCompany(s,'co-acme','acme',{demo:1});addCompany(s,'co-empty','empty');
  const a=(await call(s.port,'GET','/state')).data,b=(await call(s.port,'GET','/state',{host:'acme.lanilot.com'})).data,e=(await call(s.port,'GET','/state',{host:'empty.lanilot.com'})).data;
  assert.equal(a.loads.length,14);assert.equal(b.loads.length,14);assert.equal(e.loads.length,0);assert.equal(e.trips.length,0);assert.equal(e.lanes.length,0);
  // Same load ID in two companies: an offer in acme does not touch the primary company's offer.
  const before=a.offers.find(o=>o.load_id==='LD-2041');
  const offer=await call(s.port,'POST','/offers',{host:'acme.lanilot.com',body:{loadId:'LD-2041',rate:9999}});assert.equal(offer.status,201);
  const a2=(await call(s.port,'GET','/state')).data;assert.deepEqual(a2.offers.find(o=>o.load_id==='LD-2041'),before);assert.ok(!a2.offers.some(o=>o.rate===9999));
  const lane=await call(s.port,'POST','/lanes',{host:'empty.lanilot.com',body:{origin:'Chicago, IL',destination:'Dallas, TX',equipment:'Dry Van',broker:'X',rate:2000,days:[1],startDate:'2026-01-05',active:true}});assert.equal(lane.status,201);
  assert.equal((await call(s.port,'GET','/state',{host:'empty.lanilot.com'})).data.lanes.length,1);assert.equal((await call(s.port,'GET','/state')).data.lanes.length,3);
  // A row of another company is invisible even by ID.
  assert.equal((await call(s.port,'DELETE','/lanes/'+lane.data.id)).status,404);
  assert.equal(asCompany('co-empty',()=>s.db.prepare('SELECT count(*) n FROM lanes').get().n),1);
  // Each company has its own settings.
  const settings=(await call(s.port,'GET','/state',{host:'acme.lanilot.com'})).data.settings;
  assert.equal((await call(s.port,'PUT','/settings',{host:'acme.lanilot.com',body:{...settings,company:{...settings.company,name:'Acme Trucking'}}})).status,200);
  assert.equal((await call(s.port,'GET','/state')).data.settings.company.name,'Lanilot Cargo');
 }finally{await s.close();s.db.close()}
});

test('unknown and suspended companies are refused; without a request company nothing is visible',async()=>{
 const s=await start({setupToken:'setup-code-123'});
 try{
  assert.equal((await call(s.port,'GET','/state',{host:'nobody.lanilot.com'})).status,404);
  addCompany(s,'co-off','off',{status:'suspended'});
  assert.equal((await call(s.port,'GET','/auth/me',{host:'off.lanilot.com'})).status,403);
  assert.equal((await call(s.port,'GET','/tenant',{host:'off.lanilot.com'})).data.company.status,'suspended');
  // Auth on: code outside a request sees no company rows (fail closed).
  assert.equal(s.db.prepare('SELECT count(*) n FROM loads').get().n,0);
  assert.throws(()=>s.db.prepare("INSERT INTO lanes(id,origin,destination,equipment,broker,rate,days,start_date,created_at,updated_at) VALUES('x','A','B','Dry Van','X',1,'1','2026-01-01','','')").run());
 }finally{await s.close();s.db.close()}
});

test('owner setup, login, invitations and roles are enforced on the server',async()=>{
 const s=await start({setupToken:'setup-code-123'});
 try{
  const p=s.port;
  assert.equal((await call(p,'GET','/state')).status,401);
  assert.equal((await call(p,'GET','/tenant')).data.auth.setupRequired,true);
  assert.equal((await call(p,'POST','/auth/setup',{body:{setupToken:'wrong-code-123',name:'Owner',email:'owner@acme.test',password:'longpassword'}})).status,403);
  assert.equal((await call(p,'POST','/auth/setup',{body:{setupToken:'setup-code-123',name:'Owner',email:'owner@acme.test',password:'short'}})).status,400);
  const setup=await call(p,'POST','/auth/setup',{body:{setupToken:'setup-code-123',name:'Owner',email:'owner@acme.test',password:'longpassword'}});assert.equal(setup.status,201);
  const owner=setup.cookie;assert.match(owner,/lanilot_session=/);
  assert.equal((await call(p,'POST','/auth/setup',{body:{setupToken:'setup-code-123',name:'X',email:'x@acme.test',password:'longpassword'}})).status,409);
  const me=await call(p,'GET','/auth/me',{cookie:owner});assert.equal(me.data.role,'owner');assert.equal(me.data.user.email,'owner@acme.test');
  assert.equal((await call(p,'GET','/state',{cookie:owner})).status,200);
  // Invite a dispatcher and a viewer.
  const inv=await call(p,'POST','/users/invites',{cookie:owner,body:{email:'disp@acme.test',role:'dispatcher'}});assert.equal(inv.status,201);
  const inviteToken=inv.data.path.split('/').pop();
  assert.equal((await call(p,'GET','/auth/invites/'+inviteToken)).data.email,'disp@acme.test');
  assert.equal((await call(p,'POST','/auth/invites/'+inviteToken+'/accept',{body:{name:'D',password:'short'}})).status,400);
  const disp=await call(p,'POST','/auth/invites/'+inviteToken+'/accept',{body:{name:'Dana Dispatch',password:'dispatcherpass'}});assert.equal(disp.status,200);
  assert.equal((await call(p,'POST','/auth/invites/'+inviteToken+'/accept',{body:{name:'Again',password:'dispatcherpass'}})).status,404);
  const dc=disp.cookie;
  assert.equal((await call(p,'POST','/lanes',{cookie:dc,body:{origin:'Chicago, IL',destination:'Dallas, TX',equipment:'Dry Van',broker:'X',rate:2000,days:[1],startDate:'2026-01-05',active:true}})).status,201);
  const settings=(await call(p,'GET','/state',{cookie:dc})).data.settings;
  assert.equal((await call(p,'PUT','/settings',{cookie:dc,body:settings})).status,403);
  assert.equal((await call(p,'GET','/users',{cookie:dc})).status,403);
  assert.equal((await call(p,'POST','/users/invites',{cookie:dc,body:{email:'v@acme.test',role:'viewer'}})).status,403);
  const vinv=await call(p,'POST','/users/invites',{cookie:owner,body:{email:'view@acme.test',role:'viewer'}});
  const viewer=(await call(p,'POST','/auth/invites/'+vinv.data.path.split('/').pop()+'/accept',{body:{name:'Vic View',password:'viewerpass1'}})).cookie;
  assert.equal((await call(p,'GET','/state',{cookie:viewer})).status,200);
  assert.equal((await call(p,'POST','/lanes',{cookie:viewer,body:{}})).status,403);
  // Members list, role change, last-owner protection.
  const users=(await call(p,'GET','/users',{cookie:owner})).data;assert.equal(users.members.length,3);
  const ownerId=users.members.find(m=>m.role==='owner').id,dispId=users.members.find(m=>m.role==='dispatcher').id;
  assert.equal((await call(p,'PATCH','/users/'+ownerId,{cookie:owner,body:{role:'viewer'}})).status,409);
  assert.equal((await call(p,'DELETE','/users/'+ownerId,{cookie:owner})).status,409);
  assert.equal((await call(p,'PATCH','/users/'+dispId,{cookie:owner,body:{role:'viewer'}})).status,200);
  assert.equal((await call(p,'POST','/lanes',{cookie:dc,body:{}})).status,403);
  assert.equal((await call(p,'DELETE','/users/'+dispId,{cookie:owner})).status,200);
  assert.equal((await call(p,'GET','/state',{cookie:dc})).status,401);
  // Login: wrong password, success, rate limit, logout.
  assert.equal((await call(p,'POST','/auth/login',{body:{email:'owner@acme.test',password:'wrongpassword'}})).status,401);
  const login=await call(p,'POST','/auth/login',{body:{email:'OWNER@acme.test',password:'longpassword'}});assert.equal(login.status,200);
  for(let i=0;i<10;i++)await call(p,'POST','/auth/login',{body:{email:'view@acme.test',password:'nope-nope-1'}});
  assert.equal((await call(p,'POST','/auth/login',{body:{email:'view@acme.test',password:'viewerpass1'}})).status,429);
  assert.equal((await call(p,'POST','/auth/logout',{cookie:login.cookie})).status,200);
  assert.equal((await call(p,'GET','/state',{cookie:login.cookie})).status,401);
  // Cross-site writes are refused.
  assert.equal((await call(p,'POST','/lanes',{cookie:owner,origin:'https://evil.example',body:{}})).status,403);
  // A session of one company is not valid on another company's subdomain.
  addCompany(s,'co-other','other');
  assert.equal((await call(p,'GET','/state',{cookie:owner,host:'other.lanilot.com'})).status,401);
  assert.equal((await call(p,'POST','/auth/login',{host:'other.lanilot.com',body:{email:'owner@acme.test',password:'longpassword'}})).status,401);
  // Password change.
  assert.equal((await call(p,'POST','/auth/password',{cookie:owner,body:{current:'bad',next:'newpassword1'}})).status,400);
  assert.equal((await call(p,'POST','/auth/password',{cookie:owner,body:{current:'longpassword',next:'newpassword1'}})).status,200);
  assert.equal((await call(p,'POST','/auth/login',{body:{email:'owner@acme.test',password:'newpassword1'}})).status,200);
 }finally{await s.close();s.db.close()}
});

test('sign-up creates an isolated company; the app host opens the signed-in company',async()=>{
 const s=await start({setupToken:'setup-code-123'});
 try{
  const p=s.port,body={name:'Sam Signup',company:'Acme Trucking LLC',email:'sam@acme.test',password:'samsignup1'};
  assert.equal((await call(p,'GET','/tenant')).data.auth.signup,true);
  assert.equal((await call(p,'POST','/auth/register',{body:{...body,password:'short'}})).status,400);
  assert.equal((await call(p,'POST','/auth/register',{host:'acme.lanilot.com',body})).status,404);
  const reg=await call(p,'POST','/auth/register',{body});assert.equal(reg.status,201);
  const sam=reg.cookie,tenant=(await call(p,'GET','/tenant',{cookie:sam})).data;
  assert.equal(tenant.company.slug,'acme-trucking-llc');assert.equal(tenant.company.name,'Acme Trucking LLC');
  const state=(await call(p,'GET','/state',{cookie:sam})).data;assert.equal(state.loads.length,14);assert.equal(state.settings.company.name,'Acme Trucking LLC');assert.equal(state.settings.company.email,'sam@acme.test');
  assert.equal((await call(p,'GET','/auth/me',{cookie:sam})).data.role,'owner');
  assert.equal((await call(p,'POST','/auth/register',{body:{...body,email:'SAM@acme.test'}})).status,409);
  // Writes stay in the new company; the primary company is untouched.
  assert.equal((await call(p,'POST','/lanes',{cookie:sam,body:{origin:'Chicago, IL',destination:'Dallas, TX',equipment:'Dry Van',broker:'X',rate:2000,days:[1],startDate:'2026-01-05',active:true}})).status,201);
  assert.equal(asCompany('workspace',()=>s.db.prepare('SELECT count(*) n FROM lanes').get().n),3);
  // The same session works on the company's own subdomain, not on another one.
  assert.equal((await call(p,'GET','/state',{cookie:sam,host:'acme-trucking-llc.lanilot.com'})).status,200);
  // An empty company without demo data; slugs never repeat.
  const empty=await call(p,'POST','/auth/register',{body:{...body,email:'eve@acme.test',demo:false}});assert.equal(empty.status,201);
  assert.equal((await call(p,'GET','/tenant',{cookie:empty.cookie})).data.company.slug,'acme-trucking-llc-2');
  assert.equal((await call(p,'GET','/state',{cookie:empty.cookie})).data.loads.length,0);
  // Login on the app host opens the user's company; invitations from it are accepted on the app host too.
  const login=await call(p,'POST','/auth/login',{body:{email:'sam@acme.test',password:'samsignup1'}});assert.equal(login.status,200);
  assert.equal((await call(p,'GET','/tenant',{cookie:login.cookie})).data.company.slug,'acme-trucking-llc');
  const inv=await call(p,'POST','/users/invites',{cookie:sam,body:{email:'dan@acme.test',role:'dispatcher'}}),token=inv.data.path.split('/').pop();
  assert.equal((await call(p,'GET','/auth/invites/'+token)).data.company.name,'Acme Trucking LLC');
  const dan=await call(p,'POST','/auth/invites/'+token+'/accept',{body:{name:'Dan',password:'danpassword'}});assert.equal(dan.status,200);
  assert.equal((await call(p,'GET','/auth/me',{cookie:dan.cookie})).data.company.slug,'acme-trucking-llc');
  // A forged or expired cookie falls back to the primary company and stays signed out.
  assert.equal((await call(p,'GET','/state',{cookie:'lanilot_session=forged'})).status,401);
  for(let i=0;i<5;i++)await call(p,'POST','/auth/register',{body:{...body,email:`x${i}@acme.test`}});
  assert.equal((await call(p,'POST','/auth/register',{body:{...body,email:'late@acme.test'}})).status,429);
 }finally{await s.close();s.db.close()}
});

test('sign-up can be turned off',async()=>{
 const s=await start({signup:false});
 try{assert.equal((await call(s.port,'GET','/tenant')).data.auth.signup,false);assert.equal((await call(s.port,'POST','/auth/register',{body:{name:'A',company:'B Co',email:'a@b.test',password:'longpassword'}})).status,404)}finally{await s.close();s.db.close()}
});

test('step-by-step onboarding saves each step, records the funnel and creates the account at the end',async()=>{
 const s=await start({});
 try{
  const p=s.port;
  assert.equal((await call(p,'POST','/onboarding',{host:'acme.lanilot.com',body:{}})).status,404);
  const a=await call(p,'POST','/onboarding',{body:{source:'google / spring',lang:'en'}});assert.equal(a.status,201);assert.equal(a.data.step,0);
  const t=a.data.token,put=(step,body)=>call(p,'PUT',`/onboarding/${t}/${step}`,{body});
  assert.deepEqual(a.data.options.fleetSize,['1','2-5','6-20','21-50','50+']);
  // Steps go in order and are validated.
  assert.equal((await put('fleet',{fleetSize:'1',equipment:['Reefer']})).status,409);
  assert.equal((await put('contact',{name:'Rita',email:'not-an-email'})).status,400);
  assert.equal((await put('contact',{name:'Rita Road',email:'rita@road.test',phone:'+1 555 0101'})).data.step,1);
  assert.equal((await put('company',{company:'Road Runner LLC',role:'pilot'})).status,400);
  assert.equal((await put('company',{company:'Road Runner LLC',role:'fleet',mc:'MC-123456',city:'Dallas, TX'})).data.step,2);
  assert.equal((await put('fleet',{fleetSize:'6-20',equipment:['Reefer','Tank']})).status,400);
  assert.equal((await put('fleet',{fleetSize:'6-20',equipment:['Reefer','Dry Van']})).data.step,3);
  assert.equal((await call(p,'POST',`/onboarding/${t}/complete`,{body:{password:'roadrunner1'}})).status,409);
  // Resume returns the saved answers; going back and changing a step keeps progress.
  const resumed=(await call(p,'GET','/onboarding/'+t)).data;assert.equal(resumed.step,3);assert.equal(resumed.data.company.mc,'123456');
  assert.equal((await put('contact',{name:'Rita Road',email:'rita@road.test',phone:''})).data.step,3);
  assert.equal((await put('work',{loadBoards:['DAT','Direct brokers'],eld:'samsara',goals:['profit']})).data.step,4);
  assert.equal((await call(p,'POST',`/onboarding/${t}/complete`,{body:{password:'short'}})).status,400);
  const done=await call(p,'POST',`/onboarding/${t}/complete`,{body:{password:'roadrunner1',demo:false}});assert.equal(done.status,201);
  const tenant=(await call(p,'GET','/tenant',{cookie:done.cookie})).data;assert.equal(tenant.company.name,'Road Runner LLC');
  const settings=(await call(p,'GET','/state',{cookie:done.cookie})).data.settings.company;assert.equal(settings.city,'Dallas, TX');assert.equal(settings.mc,'123456');assert.equal(settings.businessType,'fleet');
  const ops=(await call(p,'GET','/state',{cookie:done.cookie})).data.settings.operations;assert.equal(ops.fleetSize,'6-20');assert.deepEqual(ops.equipment,['Reefer','Dry Van']);assert.equal(ops.eld,'samsara');assert.equal(settings.contactName,'Rita Road');
  assert.equal((await call(p,'GET','/onboarding/'+t)).status,404);
  assert.equal((await call(p,'POST','/auth/login',{body:{email:'rita@road.test',password:'roadrunner1'}})).status,200);
  // A second lead that stops after the contact step shows up as unfinished.
  const b=(await call(p,'POST','/onboarding',{body:{}})).data.token;
  assert.equal((await call(p,'PUT',`/onboarding/${b}/contact`,{body:{name:'Rita',email:'rita@road.test'}})).status,409);
  assert.equal((await call(p,'PUT',`/onboarding/${b}/contact`,{body:{name:'Max',email:'max@haul.test'}})).status,200);
  const f=onboardingFunnel(s.db.raw);assert.equal(f.started,2);assert.deepEqual(f.steps.map(x=>x.reached),[2,1,1,1,1]);
  assert.equal(f.unfinished.length,1);assert.equal(f.unfinished[0].email,'max@haul.test');assert.equal(f.unfinished[0].step,1);
  // Passwords never reach the lead record.
  assert.ok(!s.db.raw.prepare('SELECT data FROM signup_leads').all().some(r=>r.data.includes('roadrunner1')));
 }finally{await s.close();s.db.close()}
});

test('employee cards: owner-only, validated, documents sealed at rest, invitation created for new people',async()=>{
 const s=await start({setupToken:'setup-code-123'});
 try{
  const p=s.port,owner=(await call(p,'POST','/auth/setup',{body:{setupToken:'setup-code-123',name:'Owner',email:'owner@acme.test',password:'longpassword'}})).cookie;
  const person={lastName:'Karimov',firstName:'Aziz',middleName:'Bakhtiyorovich',birthDate:'1994-05-12',gender:'male',citizenship:'Uzbekistan',documentType:'passport',documentNumber:'aa 1234567',documentIssued:'2020-01-10',documentExpires:'2030-01-09',taxId:'31205940123456',email:'aziz@acme.test',phone:'+998 90 123 45 67',position:'Dispatcher',role:'dispatcher'};
  for(const bad of [{...person,lastName:''},{...person,birthDate:'2020-01-01'},{...person,citizenship:''},{...person,documentType:'visa'},{...person,documentNumber:'#'},{...person,documentExpires:'2019-01-01'},{...person,role:'admin'}])assert.equal((await call(p,'POST','/users/staff',{cookie:owner,body:bad})).status,400);
  const created=await call(p,'POST','/users/staff',{cookie:owner,body:person});assert.equal(created.status,201);assert.match(created.data.path,/^\/invite\//);
  assert.equal((await call(p,'POST','/users/staff',{cookie:owner,body:person})).status,409);
  const list=(await call(p,'GET','/users/staff',{cookie:owner})).data;assert.equal(list.length,1);assert.equal(list[0].document,'•••• 4567');
  const card=(await call(p,'GET','/users/staff/'+created.data.id,{cookie:owner})).data;assert.equal(card.documentNumber,'AA 1234567');assert.equal(card.middleName,'Bakhtiyorovich');
  assert.equal((await call(p,'GET','/users')).status,401);
  // The invitation works; the new dispatcher cannot read employee cards.
  const disp=(await call(p,'POST','/auth/invites/'+created.data.path.split('/').pop()+'/accept',{body:{name:'Aziz',password:'azizpassword'}})).cookie;
  assert.equal((await call(p,'GET','/users/staff',{cookie:disp})).status,403);assert.equal((await call(p,'GET','/users/staff/'+created.data.id,{cookie:disp})).status,403);
  assert.equal((await call(p,'PUT','/users/staff/'+created.data.id,{cookie:disp,body:person})).status,403);
  // Edit keeps the email; a card for an existing member creates no invitation.
  assert.equal((await call(p,'PUT','/users/staff/'+created.data.id,{cookie:owner,body:{...card,email:'other@acme.test'}})).status,400);
  assert.equal((await call(p,'PUT','/users/staff/'+created.data.id,{cookie:owner,body:{...card,position:'Senior dispatcher'}})).status,200);
  const own=await call(p,'POST','/users/staff',{cookie:owner,body:{...person,email:'owner@acme.test',documentNumber:'AB7654321',role:undefined}});assert.equal(own.status,201);assert.equal(own.data.path,null);
  // Sealed at rest: no document number or tax ID in the stored row.
  const raw=JSON.stringify(s.db.raw.prepare('SELECT * FROM t_staff').all());assert.ok(!raw.includes('1234567')&&!raw.includes('31205940123456')&&!raw.includes('Uzbekistan'));
  assert.equal((await call(p,'DELETE','/users/staff/'+own.data.id,{cookie:owner})).status,200);
 }finally{await s.close();s.db.close()}
});
