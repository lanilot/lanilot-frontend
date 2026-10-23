import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../server/app.js';
import {hashPassword} from '../server/auth.js';

function call(port,method,path,{host='admin.lanilot.com',body,cookie,origin}={}){
 return new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):null;
  const r=http.request({host:'127.0.0.1',port,method,path:'/api'+path,headers:{Host:host,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},res=>{let buf='';res.on('data',c=>buf+=c);res.on('end',()=>resolve({status:res.statusCode,data:buf?JSON.parse(buf):null,cookie:(res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ')}))});
  r.on('error',reject);if(data)r.write(data);r.end()});
}
async function start(){const out=createApp(':memory:',{baseDomain:'lanilot.com'});const server=out.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return {...out,port:server.address().port,close:()=>new Promise(r=>server.close(r))}}
const grant=(s,email,password)=>{const id='usr-admin-'+email;s.db.raw.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,email,'Admin',hashPassword(password),new Date().toISOString());s.db.raw.prepare('INSERT INTO platform_admins VALUES(?,?)').run(id,new Date().toISOString())};

test('platform admin: separate host and accounts; company users and other hosts are refused',async()=>{
 const s=await start();
 try{
  const p=s.port;grant(s,'root@lanilot.test','rootpassword1');
  const reg=await call(p,'POST','/auth/register',{host:'app.lanilot.com',body:{name:'Cara Carrier',company:'Cara Haul',email:'cara@haul.test',password:'carapassword'}});assert.equal(reg.status,201);
  // The admin API exists only on admin.<domain>; the app API does not exist there.
  assert.equal((await call(p,'GET','/admin/me',{host:'app.lanilot.com'})).status,404);
  assert.equal((await call(p,'GET','/state')).status,404);
  assert.equal((await call(p,'GET','/admin/overview')).status,401);
  // A company owner is not a platform admin.
  assert.equal((await call(p,'POST','/admin/login',{body:{email:'cara@haul.test',password:'carapassword'}})).status,401);
  assert.equal((await call(p,'GET','/admin/overview',{cookie:reg.cookie.replace('lanilot_session','lanilot_admin')})).status,401);
  const login=await call(p,'POST','/admin/login',{body:{email:'root@lanilot.test',password:'rootpassword1'}});assert.equal(login.status,200);const a=login.cookie;
  assert.equal((await call(p,'GET','/admin/me',{cookie:a})).data.user.email,'root@lanilot.test');
  // The admin cookie does not open the company workspace.
  assert.equal((await call(p,'GET','/state',{host:'app.lanilot.com',cookie:a})).status,401);
  assert.equal((await call(p,'POST','/admin/logout',{cookie:a,origin:'https://evil.test'})).status,403);
  // Overview: the new company counts, internal ones (workspace, demo) do not; activity is tracked.
  await call(p,'GET','/state',{host:'app.lanilot.com',cookie:reg.cookie});
  const o=(await call(p,'GET','/admin/overview?days=30',{cookie:a})).data;
  assert.equal(o.metrics.signups.value,1);assert.equal(o.metrics.activeUsers.value,1);assert.equal(o.metrics.activeCompanies.value,1);assert.equal(o.totals.companies,1);assert.equal(o.dates.length,30);assert.equal(o.series.signups.current.at(-1),1);
  // Companies: list, detail, plan change with MRR, suspension logs everyone out.
  const list=(await call(p,'GET','/admin/companies',{cookie:a})).data;assert.equal(list.length,1);assert.equal(list[0].owner.email,'cara@haul.test');assert.equal(list[0].loads,14);
  assert.equal((await call(p,'GET','/admin/companies?internal=1',{cookie:a})).data.length,2);
  const id=list[0].id,detail=(await call(p,'GET','/admin/companies/'+id,{cookie:a})).data;assert.equal(detail.members[0].email,'cara@haul.test');assert.equal(detail.activity.users.at(-1),1);
  for(const bad of [{plan:'gold'},{status:'gone'},{trialEndsAt:'tomorrow'}])assert.equal((await call(p,'PATCH','/admin/companies/'+id,{cookie:a,body:bad})).status,400);
  assert.equal((await call(p,'PATCH','/admin/companies/'+id,{cookie:a,body:{plan:'pro',notes:'Called on Monday'}})).data.mrr,149);
  assert.equal((await call(p,'GET','/admin/subscriptions',{cookie:a})).data.mrr,149);
  assert.equal((await call(p,'PATCH','/admin/companies/workspace',{cookie:a,body:{status:'suspended'}})).status,409);
  assert.equal((await call(p,'PATCH','/admin/companies/'+id,{cookie:a,body:{status:'suspended'}})).status,200);
  assert.equal((await call(p,'GET','/state',{host:'app.lanilot.com',cookie:reg.cookie})).status,401);
  assert.equal((await call(p,'POST','/auth/login',{host:'cara-haul.lanilot.com',body:{email:'cara@haul.test',password:'carapassword'}})).status,403);
  assert.ok((await call(p,'GET','/admin/users',{cookie:a})).data.some(u=>u.email==='cara@haul.test'&&u.companies[0].name==='Cara Haul'));
  assert.equal((await call(p,'GET','/admin/funnel?days=7',{cookie:a})).status,200);
  // Login is rate limited.
  for(let i=0;i<8;i++)await call(p,'POST','/admin/login',{body:{email:'root@lanilot.test',password:'wrong-password'}});
  assert.equal((await call(p,'POST','/admin/login',{body:{email:'root@lanilot.test',password:'rootpassword1'}})).status,429);
 }finally{await s.close();s.db.close()}
});

test('Book a demo requests: validated, honeypot, same-origin only, managed in the admin',async()=>{
 const s=await start();
 try{
  const p=s.port,host='lanilot.com';grant(s,'root@lanilot.test','rootpassword1');
  const body={name:'Jamie Rivera',email:'jamie@rivera.test',company:'Rivera Freight',phone:'+1 214 555 0142',fleetSize:'6-20',message:'Reefer fleet',source:'linkedin',lang:'en'};
  assert.equal((await call(p,'POST','/public/demo-request',{host,body:{...body,email:'nope'}})).status,400);
  assert.equal((await call(p,'POST','/public/demo-request',{host,body:{...body,fleetSize:'1000'}})).status,400);
  assert.equal((await call(p,'POST','/public/demo-request',{host,origin:'https://evil.test',body})).status,403);
  assert.equal((await call(p,'POST','/public/demo-request',{host,body:{...body,website:'http://spam'}})).status,201);
  assert.equal((await call(p,'POST','/public/demo-request',{host,origin:'https://lanilot.com',body})).status,201);
  const a=(await call(p,'POST','/admin/login',{body:{email:'root@lanilot.test',password:'rootpassword1'}})).cookie;
  const d=(await call(p,'GET','/admin/requests',{cookie:a})).data;assert.equal(d.requests.length,1);assert.equal(d.counts.new,1);assert.equal(d.requests[0].source,'linkedin');
  assert.equal((await call(p,'GET','/admin/me',{cookie:a})).data.newRequests,1);
  assert.equal((await call(p,'GET','/admin/overview?days=7',{cookie:a})).data.metrics.demoRequests.value,1);
  const r=d.requests[0];
  assert.equal((await call(p,'PATCH','/admin/requests/'+r.id,{cookie:a,body:{status:'maybe'}})).status,400);
  assert.equal((await call(p,'PATCH','/admin/requests/'+r.id,{cookie:a,body:{status:'scheduled',notes:'Demo Tue 10am'}})).data.status,'scheduled');
  assert.equal((await call(p,'GET','/admin/requests?status=scheduled',{cookie:a})).data.requests[0].notes,'Demo Tue 10am');
  assert.equal((await call(p,'GET','/admin/requests',{host:'app.lanilot.com',cookie:a})).status,404);
  for(let i=0;i<5;i++)await call(p,'POST','/public/demo-request',{host,body});
  assert.equal((await call(p,'POST','/public/demo-request',{host,body})).status,429);
 }finally{await s.close();s.db.close()}
});
