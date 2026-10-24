import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../server/app.js';
import {hostInfo} from '../server/tenancy.js';
import {grantProduct,revokeProduct,hasProduct} from '../server/products.js';
import {hashPassword} from '../server/auth.js';

function call(port,method,path,{host='app.lanilot.com',body,cookie}={}){
 return new Promise((resolve,reject)=>{
  const data=body?JSON.stringify(body):null;
  const r=http.request({host:'127.0.0.1',port,method,path:'/api'+path,headers:{Host:host,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},res=>{
   let buf='';res.on('data',c=>buf+=c);res.on('end',()=>resolve({status:res.statusCode,data:buf?JSON.parse(buf):null,cookie:(res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ')}));
  });r.on('error',reject);if(data)r.write(data);r.end();
 });
}
async function start(){const out=createApp(':memory:',{baseDomain:'lanilot.com',setupToken:'setup-code-123'});const server=out.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return {...out,port:server.address().port,close:()=>new Promise(r=>server.close(r))}}
const handoffOf=url=>{const u=new URL(url);return {host:u.host,token:u.searchParams.get('handoff')}};

test('product hosts are parsed for every product',()=>{
 assert.deepEqual(hostInfo('erp.acme.lanilot.com','lanilot.com'),{slug:'acme',kind:'product',product:'erp',base:'lanilot.com',port:''});
 assert.equal(hostInfo('dash.acme.lanilot.com','lanilot.com').kind,'dash');
 assert.equal(hostInfo('dash.acme.lanilot.com','lanilot.com').product,'dash');
 assert.equal(hostInfo('crm.acme.localhost:5180','lanilot.com').slug,'acme');
 assert.equal(hostInfo('shop.acme.lanilot.com','lanilot.com').slug,null);
});

test('after sign-in the user picks a product; access is per company and inherited by its members',async()=>{
 const s=await start();
 try{
  const p=s.port,reg=await call(p,'POST','/auth/register',{body:{name:'Olga Owner',company:'Acme Freight',email:'olga@acme.test',password:'olgaowner1'}});assert.equal(reg.status,201);
  const owner=reg.cookie,list=await call(p,'GET','/products',{cookie:owner});
  assert.equal(list.status,200);assert.equal(list.data.chosen,null);assert.equal(list.data.canBuy,true);
  const by=Object.fromEntries(list.data.products.map(x=>[x.id,x]));assert.equal(by.dash.access,true);assert.equal(by.erp.access,false);assert.equal(by.erp.live,false);
  const slug=(await call(p,'GET','/auth/me',{cookie:owner})).data.company.slug,company=s.db.raw.prepare('SELECT id FROM companies WHERE slug=?').get(slug).id;
  // A product the company has not bought: the owner may request it, nobody can enter it.
  const locked=await call(p,'POST','/products/choose',{cookie:owner,body:{product:'erp'}});assert.equal(locked.status,403);assert.equal(locked.data.code,'no_access');assert.equal(locked.data.canBuy,true);
  assert.equal((await call(p,'POST','/products/request',{cookie:owner,body:{product:'erp',plan:'gold'}})).status,400);
  assert.equal((await call(p,'POST','/products/request',{cookie:owner,body:{product:'erp',plan:'pro'}})).status,201);
  assert.equal((await call(p,'GET','/products',{cookie:owner})).data.products.find(x=>x.id==='erp').requested,true);
  assert.equal((await call(p,'POST','/products/request',{cookie:owner,body:{product:'dash',plan:'pro'}})).status,409);
  // Choosing the dashboard on the app host hands the session over to dash.<company>, already with the product chosen.
  const go=await call(p,'POST','/products/choose',{cookie:owner,body:{product:'dash'}});assert.equal(go.status,200);
  const h=handoffOf(go.data.url);assert.equal(h.host,`dash.${slug}.lanilot.com`);
  const there=await call(p,'POST','/auth/handoff',{host:h.host,body:{token:h.token}});assert.equal(there.status,200);
  const onDash=await call(p,'GET','/products',{host:h.host,cookie:there.cookie});assert.equal(onDash.data.chosen,'dash');assert.equal(onDash.data.current,'dash');
  assert.equal((await call(p,'GET','/state',{host:h.host,cookie:there.cookie})).status,200);
  // Staff see products but cannot buy them.
  const invite=new URL(s.access.createInvite(company,'dina@acme.test','dispatcher'),'http://x').pathname.split('/').pop();
  const staff=await call(p,'POST',`/auth/invites/${invite}/accept`,{host:h.host,body:{name:'Dina Dispatch',password:'dinadispatch1'}});assert.equal(staff.status,200);
  const staffList=await call(p,'GET','/products',{host:h.host,cookie:staff.cookie});assert.equal(staffList.data.canBuy,false);assert.equal(staffList.data.owner.email,'olga@acme.test');
  assert.equal((await call(p,'POST','/products/request',{host:h.host,cookie:staff.cookie,body:{product:'crm',plan:'pro'}})).status,403);
  const staffLocked=await call(p,'POST','/products/choose',{host:h.host,cookie:staff.cookie,body:{product:'crm'}});assert.equal(staffLocked.data.canBuy,false);
  // Without the dispatch product the dashboard data is closed to the whole company.
  revokeProduct(s.db,company,'dash');
  for(const cookie of [there.cookie,staff.cookie]){const r=await call(p,'GET','/state',{host:h.host,cookie});assert.equal(r.status,403);assert.equal(r.data.code,'product_locked')}
  assert.equal((await call(p,'GET','/products',{host:h.host,cookie:staff.cookie})).status,200);
  // Turned on (by the platform admin): the owner moves to erp.<company>; requests for it are closed.
  grantProduct(s.db,company,'dash');grantProduct(s.db,company,'erp');assert.ok(hasProduct(s.db,company,'erp'));
  assert.equal(s.db.raw.prepare("SELECT status FROM product_requests WHERE company_id=? AND product='erp' ORDER BY created_at DESC").get(company).status,'done');
  const erp=await call(p,'POST','/products/choose',{host:h.host,cookie:there.cookie,body:{product:'erp'}});const e=handoffOf(erp.data.url);assert.equal(e.host,`erp.${slug}.lanilot.com`);
  const inErp=await call(p,'POST','/auth/handoff',{host:e.host,body:{token:e.token}});assert.equal(inErp.status,200);
  assert.equal((await call(p,'GET','/products',{host:e.host,cookie:inErp.cookie})).data.current,'erp');
  // Switching product clears the choice for this sign-in.
  await call(p,'POST','/products/reset',{host:e.host,cookie:inErp.cookie});assert.equal((await call(p,'GET','/products',{host:e.host,cookie:inErp.cookie})).data.chosen,null);
 }finally{await s.close();s.db.close()}
});

test('companies from before products keep the dispatch dashboard',async()=>{
 const s=await start();
 try{assert.ok(hasProduct(s.db,'workspace','dash'))}finally{await s.close();s.db.close()}
});

test('platform admin turns products on and off and sees requests',async()=>{
 const s=await start();
 try{
  const p=s.port,reg=await call(p,'POST','/auth/register',{body:{name:'Olga Owner',company:'Acme Freight',email:'olga@acme.test',password:'olgaowner1'}});
  const company=s.db.raw.prepare("SELECT id FROM companies WHERE name='Acme Freight'").get().id;
  await call(p,'POST','/products/request',{cookie:reg.cookie,body:{product:'crm',plan:'starter'}});
  s.db.raw.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('usr-root','root@lanilot.test','Root',hashPassword('rootpassword1'),new Date().toISOString());s.db.raw.prepare('INSERT INTO platform_admins VALUES(?,?)').run('usr-root',new Date().toISOString());
  const a=(await call(p,'POST','/admin/login',{host:'admin.lanilot.com',body:{email:'root@lanilot.test',password:'rootpassword1'}})).cookie,admin={host:'admin.lanilot.com',cookie:a};
  assert.equal((await call(p,'GET','/admin/me',admin)).data.newProductRequests,1);
  const before=await call(p,'GET','/admin/companies/'+company,admin);assert.deepEqual(before.data.products,['dash']);assert.equal(before.data.productRequests[0].product,'crm');
  assert.equal((await call(p,'PUT',`/admin/companies/${company}/products/crm`,{...admin,body:{enabled:'yes'}})).status,400);
  assert.equal((await call(p,'PUT',`/admin/companies/${company}/products/shop`,{...admin,body:{enabled:true}})).status,400);
  assert.deepEqual((await call(p,'PUT',`/admin/companies/${company}/products/crm`,{...admin,body:{enabled:true}})).data.products.sort(),['crm','dash']);
  assert.equal((await call(p,'GET','/admin/me',admin)).data.newProductRequests,0);
  assert.deepEqual((await call(p,'PUT',`/admin/companies/${company}/products/dash`,{...admin,body:{enabled:false}})).data.products,['crm']);
  // The company app cannot reach the admin endpoint.
  assert.equal((await call(p,'PUT',`/admin/companies/${company}/products/erp`,{cookie:reg.cookie,body:{enabled:true}})).status,404);
 }finally{await s.close();s.db.close()}
});
