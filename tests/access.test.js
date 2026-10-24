import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createApp} from '../server/app.js';

function call(port,method,path,{host='app.lanilot.com',body,cookie,origin,form}={}){
 return new Promise((resolve,reject)=>{const data=form?new URLSearchParams(form).toString():body?JSON.stringify(body):null;
  const r=http.request({host:'127.0.0.1',port,method,path:'/api'+path,headers:{Host:host,'Content-Type':form?'application/x-www-form-urlencoded':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},res=>{let buf='';res.on('data',c=>buf+=c);res.on('end',()=>{let parsed=null;try{parsed=buf?JSON.parse(buf):null}catch{}resolve({status:res.statusCode,data:parsed,location:res.headers.location,cookie:(res.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ')})})});
  r.on('error',reject);if(data)r.write(data);r.end()});
}
async function start(options={}){const out=createApp(':memory:',{baseDomain:'lanilot.com',...options});const server=out.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return {...out,port:server.address().port,close:()=>new Promise(r=>server.close(r))}}

test('demo access: form creates a personal sandbox, the one-time link signs in, the sandbox expires',async()=>{
 const s=await start();
 try{
  const p=s.port,form={name:'Dana Brooks',email:'dana@brooks.test',company:'Brooks Logistics',fleetSize:'2-5',source:'google',lang:'en'};
  assert.equal((await call(p,'POST','/public/demo-access',{host:'lanilot.com',body:{...form,email:'bad'}})).status,400);
  assert.equal((await call(p,'POST','/public/demo-access',{host:'lanilot.com',origin:'https://evil.test',body:form})).status,403);
  const made=await call(p,'POST','/public/demo-access',{host:'lanilot.com',origin:'https://lanilot.com',body:form});assert.equal(made.status,201);assert.ok(made.data.token);
  // The link works once, on the app host only.
  assert.equal((await call(p,'POST','/auth/demo-access',{host:'acme.lanilot.com',body:{token:made.data.token}})).status,404);
  const signed=await call(p,'POST','/auth/demo-access',{body:{token:made.data.token}});assert.equal(signed.status,200);
  assert.equal((await call(p,'POST','/auth/demo-access',{body:{token:made.data.token}})).status,404);
  const c=signed.cookie,me=(await call(p,'GET','/auth/me',{cookie:c})).data;
  assert.equal(me.company.name,'Brooks Logistics');assert.equal(me.company.sandbox,true);assert.match(me.company.slug,/^demo-[0-9a-f]{10}$/);assert.equal(me.role,'owner');
  const state=(await call(p,'GET','/state',{cookie:c})).data;assert.equal(state.loads.length,14);assert.equal(state.settings.company.email,'dana@brooks.test');
  // Two visitors never share a sandbox.
  const other=await call(p,'POST','/public/demo-access',{host:'lanilot.com',body:{...form,email:'eli@x.test'}});const oc=(await call(p,'POST','/auth/demo-access',{body:{token:other.data.token}})).cookie;
  assert.notEqual((await call(p,'GET','/auth/me',{cookie:oc})).data.company.id,me.company.id);
  // Expired sandbox: workspace closed, sign-up still possible.
  s.db.raw.prepare('UPDATE companies SET trial_ends_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',me.company.id);
  assert.equal((await call(p,'GET','/state',{cookie:c})).data.code,'sandbox_expired');
  assert.equal((await call(p,'GET','/tenant',{cookie:c})).data.company.status,'expired');
  // Requests and sandboxes reach the admin; sandboxes are not counted as sign-ups.
  const rows=s.db.raw.prepare("SELECT kind,company_id FROM demo_requests").all();assert.equal(rows.length,2);assert.ok(rows.every(r=>r.kind==='demo_access'&&r.company_id));
  assert.equal(s.db.raw.prepare('SELECT count(*) n FROM companies WHERE sandbox=1').get().n,2);
 }finally{await s.close();s.db.close()}
});

test('Google sign-in: verified identity signs in, new people continue the sign-up without a password',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'k1',alg:'RS256',use:'sig'};
 const env={LANILOT_GOOGLE_CLIENT_ID:'client-123',LANILOT_GOOGLE_CLIENT_SECRET:'secret'};
 let claims=null;
 const idToken=c=>{const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),data=`${enc({alg:'RS256',kid:'k1'})}.${enc(c)}`;return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')};
 const fetch=async(url,init)=>{
  if(url.includes('certs'))return new Response(JSON.stringify({keys:[jwk]}),{status:200});
  if(url.includes('oauth2.googleapis.com/token')){assert.equal(new URLSearchParams(init.body).get('client_secret'),'secret');return new Response(JSON.stringify({id_token:idToken(claims)}),{status:200})}
  throw Error('unexpected '+url);
 };
 const s=await start({oauthOptions:{env,fetch}});
 try{
  const p=s.port;
  assert.deepEqual((await call(p,'GET','/tenant')).data.auth.providers,['google']);
  assert.deepEqual((await call(p,'GET','/tenant',{host:'acme.lanilot.com'})).status,404);
  const flow=async extra=>{
   const st=await call(p,'GET','/auth/oauth/google/start');assert.equal(st.status,302);const u=new URL(st.location);
   assert.equal(u.origin+u.pathname,'https://accounts.google.com/o/oauth2/v2/auth');assert.equal(u.searchParams.get('client_id'),'client-123');
   claims={iss:'https://accounts.google.com',aud:'client-123',sub:'g-42',email:'Ann@Road.test',email_verified:true,name:'Ann Road',exp:Math.floor(Date.now()/1000)+600,nonce:u.searchParams.get('nonce'),...extra};
   return call(p,'GET',`/auth/oauth/google/callback?code=c&state=${u.searchParams.get('state')}`,{cookie:st.cookie});
  };
  assert.equal((await call(p,'GET','/auth/oauth/apple/start')).location,'/login?oauth_error=unavailable');
  // Wrong nonce, unverified email, forged state are refused.
  assert.equal((await flow({nonce:'x'})).location,'/login?oauth_error=failed');
  assert.equal((await flow({email_verified:false})).location,'/login?oauth_error=failed');
  const st=await call(p,'GET','/auth/oauth/google/start');assert.equal((await call(p,'GET','/auth/oauth/google/callback?code=c&state=forged',{cookie:st.cookie})).location,'/login?oauth_error=expired');
  // New person → sign-up with contact filled in, no password.
  const first=await flow();assert.match(first.location,/^\/signup\?onboarding=/);const lead=decodeURIComponent(first.location.split('=')[1]);
  const view=(await call(p,'GET','/onboarding/'+lead)).data;assert.equal(view.step,1);assert.equal(view.oauth.email,'ann@road.test');assert.equal(view.data.contact.name,'Ann Road');
  assert.equal((await call(p,'PUT',`/onboarding/${lead}/contact`,{body:{name:'Ann Road',email:'other@x.test'}})).data.data.contact.email,'ann@road.test');
  await call(p,'PUT',`/onboarding/${lead}/company`,{body:{company:'Road Co',role:'fleet'}});await call(p,'PUT',`/onboarding/${lead}/fleet`,{body:{fleetSize:'1',equipment:['Reefer']}});await call(p,'PUT',`/onboarding/${lead}/work`,{body:{loadBoards:['DAT'],eld:'none',goals:['profit']}});
  const done=await call(p,'POST',`/onboarding/${lead}/complete`,{body:{demo:false}});assert.equal(done.status,201);
  assert.equal((await call(p,'GET','/auth/me',{cookie:done.cookie})).data.user.email,'ann@road.test');
  // Next time the same Google account signs straight in.
  const again=await flow();assert.equal(again.location,'/');assert.equal((await call(p,'GET','/auth/me',{cookie:again.cookie})).data.company.name,'Road Co');
  // An existing password account is linked by its verified email.
  await call(p,'POST','/auth/register',{body:{name:'Bob',company:'Bob Haul',email:'bob@haul.test',password:'bobpassword1'}});
  const bob=await flow({sub:'g-77',email:'bob@haul.test',name:'Bob'});assert.equal(bob.location,'/');assert.equal((await call(p,'GET','/auth/me',{cookie:bob.cookie})).data.user.email,'bob@haul.test');
 }finally{await s.close();s.db.close()}
});

test('platform tables created late are not converted to company tables on restart',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'lanilot-restart-')),file=join(dir,'t.sqlite'),env={LANILOT_GOOGLE_CLIENT_ID:'a',LANILOT_GOOGLE_CLIENT_SECRET:'b'};
 try{
  for(let i=0;i<2;i++){const s=await start({oauthOptions:{env}}).catch(e=>{throw e});s.db.close();await s.close()}
  const run=async()=>{const out=createApp(file,{baseDomain:'lanilot.com',oauthOptions:{env}});const server=out.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const res=await call(server.address().port,'GET','/auth/oauth/google/start');await new Promise(r=>server.close(r));const tables=out.db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('t_oauth_states','t_user_identities','t_demo_access_tokens')").all();out.db.close();return {status:res.status,tables}};
  assert.equal((await run()).status,302);const second=await run();assert.equal(second.status,302);assert.deepEqual(second.tables,[]);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('company subdomain: owner changes it, the old one redirects, taken and reserved names are refused',async()=>{
 const s=await start();
 try{
  const p=s.port,reg=await call(p,'POST','/auth/register',{body:{name:'Ola',company:'ABC LLC',email:'ola@abc.test',password:'olapassword1'}}),o=reg.cookie;
  await call(p,'POST','/auth/register',{body:{name:'Zed',company:'Zed Haul',email:'zed@zed.test',password:'zedpassword1'}});
  assert.equal((await call(p,'GET','/tenant',{cookie:o})).data.company.slug,'abc-llc');
  for(const [slug,code] of [['ab',400],['-abc',400],['abc--d',400],['UPPER case',400],['admin',400],['demo-123',400],['zed-haul',400]])assert.equal((await call(p,'PUT','/settings/subdomain',{cookie:o,body:{slug}})).status,code,slug);
  const ch=await call(p,'PUT','/settings/subdomain',{cookie:o,body:{slug:'abc-kkc'}});assert.equal(ch.status,200);assert.equal(ch.data.previous,'abc-llc');
  assert.equal((await call(p,'GET','/tenant',{host:'abc-kkc.lanilot.com'})).data.company.name,'ABC LLC');
  // The old address redirects pages and API, keeping the path.
  const r=await call(p,'GET','/tenant',{host:'abc-llc.lanilot.com'});assert.equal(r.status,301);assert.equal(r.location,'http://abc-kkc.lanilot.com/api/tenant');
  assert.equal((await call(p,'POST','/auth/login',{host:'abc-llc.lanilot.com',body:{}})).status,308);
  // Nobody else can take the old address; the company can take it back.
  const zed=(await call(p,'POST','/auth/login',{body:{email:'zed@zed.test',password:'zedpassword1'}})).cookie;
  assert.equal((await call(p,'PUT','/settings/subdomain',{cookie:zed,body:{slug:'abc-llc'}})).status,400);
  assert.equal((await call(p,'PUT','/settings/subdomain',{cookie:o,body:{slug:'abc-llc'}})).status,200);
  assert.equal((await call(p,'GET','/tenant',{host:'abc-llc.lanilot.com'})).status,200);
  assert.equal((await call(p,'GET','/tenant',{host:'abc-kkc.lanilot.com'})).status,301);
  // A new sign-up never gets a former address; dispatchers and demo sandboxes cannot change it.
  assert.equal((await call(p,'POST','/auth/register',{body:{name:'K',company:'ABC KKC',email:'k@k.test',password:'kpassword12'}})).status,201);
  assert.equal(s.db.raw.prepare("SELECT slug FROM companies WHERE name='ABC KKC'").get().slug,'abc-kkc-2');
  const inv=await call(p,'POST','/users/invites',{cookie:o,body:{email:'d@abc.test',role:'dispatcher'}});const d=(await call(p,'POST','/auth/invites/'+inv.data.path.split('/').pop()+'/accept',{body:{name:'D',password:'dpassword12'}})).cookie;
  assert.equal((await call(p,'PUT','/settings/subdomain',{cookie:d,body:{slug:'abc-new'}})).status,403);
  const demo=await call(p,'POST','/public/demo-access',{host:'lanilot.com',body:{name:'V',email:'v@v.test',company:'V Co'}});const dc=(await call(p,'POST','/auth/demo-access',{body:{token:demo.data.token}})).cookie;
  assert.equal((await call(p,'PUT','/settings/subdomain',{cookie:dc,body:{slug:'v-company'}})).status,403);
  assert.equal((await call(p,'GET','/state',{cookie:o})).data.workspace.editableSlug,true);
 }finally{await s.close();s.db.close()}
});

test('company site and dashboard hosts: <slug> is the public site, dash.<slug> and app. the dashboard',async()=>{
 const s=await start();
 try{
  const p=s.port,reg=await call(p,'POST','/auth/register',{body:{name:'Ola',company:'ABC LLC',email:'ola@abc.test',password:'olapassword1'}});
  const site=(await call(p,'GET','/tenant',{host:'abc-llc.lanilot.com'})).data;assert.equal(site.host.kind,'site');assert.equal(site.host.dash,'http://dash.abc-llc.lanilot.com');assert.equal(site.host.site,'http://abc-llc.lanilot.com');
  assert.ok(site.company.brand.landing);assert.equal(site.company.brand.landing.lanes.length,2);assert.equal(site.company.brand.landing.trucks,8);assert.ok(!JSON.stringify(site.company.brand.landing.lanes).includes('rate'));
  const dash=(await call(p,'GET','/tenant',{host:'dash.abc-llc.lanilot.com'})).data;assert.equal(dash.host.kind,'dash');assert.equal(dash.company.slug,'abc-llc');
  const login=await call(p,'POST','/auth/login',{host:'dash.abc-llc.lanilot.com',body:{email:'ola@abc.test',password:'olapassword1'}});assert.equal(login.status,200);
  assert.equal((await call(p,'GET','/state',{host:'dash.abc-llc.lanilot.com',cookie:login.cookie})).status,200);
  assert.equal((await call(p,'GET','/tenant',{cookie:reg.cookie})).data.host.kind,'app');
  // A changed address moves the dashboard host too.
  await call(p,'PUT','/settings/subdomain',{cookie:reg.cookie,body:{slug:'abc-kkc'}});
  const moved=await call(p,'GET','/tenant',{host:'dash.abc-llc.lanilot.com'});assert.equal(moved.status,301);assert.equal(moved.location,'http://dash.abc-kkc.lanilot.com/api/tenant');
  assert.equal((await call(p,'GET','/state',{cookie:reg.cookie})).data.workspace.urls.dash,'http://dash.abc-kkc.lanilot.com');
 }finally{await s.close();s.db.close()}
});
