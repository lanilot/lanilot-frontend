// Sign in with Google / Apple (OpenID Connect, authorization code flow) on the app host.
// Existing accounts sign in by provider identity or verified email; new people continue in the step-by-step sign-up
// with name and email filled in and no password. Providers turn on when their keys are set in the server environment:
//   Google: LANILOT_GOOGLE_CLIENT_ID, LANILOT_GOOGLE_CLIENT_SECRET
//   Apple:  LANILOT_APPLE_CLIENT_ID (Services ID), LANILOT_APPLE_TEAM_ID, LANILOT_APPLE_KEY_ID, LANILOT_APPLE_PRIVATE_KEY (.p8, \n allowed)
// Redirect URI to register with the provider: https://app.<domain>/api/auth/oauth/<google|apple>/callback
import {randomBytes,createHash,createPublicKey,createPrivateKey,verify,sign} from 'node:crypto';
import express from 'express';
import {companyBySlug,hostInfo} from './tenancy.js';
import {dashReady} from './provision.js';

const COOKIE='lanilot_oauth',STATE_MINUTES=10;
const sha=v=>createHash('sha256').update(v).digest('hex');
const b64u=s=>Buffer.from(s,'base64url');
const PROVIDERS={
 google:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',jwks:'https://www.googleapis.com/oauth2/v3/certs',issuers:['https://accounts.google.com','accounts.google.com'],scope:'openid email profile',
  configured:env=>!!(env.LANILOT_GOOGLE_CLIENT_ID&&env.LANILOT_GOOGLE_CLIENT_SECRET),clientId:env=>env.LANILOT_GOOGLE_CLIENT_ID,secret:env=>env.LANILOT_GOOGLE_CLIENT_SECRET},
 apple:{authorize:'https://appleid.apple.com/auth/authorize',token:'https://appleid.apple.com/auth/token',jwks:'https://appleid.apple.com/auth/keys',issuers:['https://appleid.apple.com'],scope:'name email',formPost:true,
  configured:env=>!!(env.LANILOT_APPLE_CLIENT_ID&&env.LANILOT_APPLE_TEAM_ID&&env.LANILOT_APPLE_KEY_ID&&env.LANILOT_APPLE_PRIVATE_KEY),clientId:env=>env.LANILOT_APPLE_CLIENT_ID,
  // Apple's client secret is a short-lived ES256 JWT signed with the team key.
  secret:env=>{const now=Math.floor(Date.now()/1000),enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),data=`${enc({alg:'ES256',kid:env.LANILOT_APPLE_KEY_ID})}.${enc({iss:env.LANILOT_APPLE_TEAM_ID,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:env.LANILOT_APPLE_CLIENT_ID})}`;
   return data+'.'+sign('sha256',Buffer.from(data),{key:createPrivateKey(env.LANILOT_APPLE_PRIVATE_KEY.replace(/\\n/g,'\n')),dsaEncoding:'ieee-p1363'}).toString('base64url')}}
};
export const configuredProviders=env=>Object.keys(PROVIDERS).filter(p=>PROVIDERS[p].configured(env));

export function installOAuth(app,db,{enabled,env=process.env,fetch:fetchImpl=fetch,onAppHost,startSession,createSignupLead,baseDomain='lanilot.com'}){
 const raw=db.raw,jwksCache=new Map();
 raw.exec(`CREATE TABLE IF NOT EXISTS user_identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),email TEXT,created_at TEXT NOT NULL,PRIMARY KEY(provider,subject));
 CREATE TABLE IF NOT EXISTS oauth_states(id TEXT PRIMARY KEY,provider TEXT NOT NULL,nonce TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS session_handoffs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,company_id TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT);`);
 if(!raw.prepare('PRAGMA table_info(oauth_states)').all().some(c=>c.name==='return_slug'))raw.exec('ALTER TABLE oauth_states ADD COLUMN return_slug TEXT');
 // Providers know only app.<domain>; a company host signs in there and comes back with a one-time handoff token.
 const dashUrl=(req,slug)=>{const h=hostInfo(req.get('host'),baseDomain);return `${req.protocol}://dash.${slug}.${h.base??baseDomain}${h.port}`};
 const dashBack=(req,res,slug,code)=>res.redirect(303,`${dashUrl(req,slug)}/login?oauth_error=${code}`);
 const handoff=(req,res,user,company)=>{const t=randomBytes(24).toString('base64url'),now=Date.now();raw.prepare('INSERT INTO session_handoffs VALUES(?,?,?,?,?,NULL)').run(sha(t),user,company.id,new Date(now).toISOString(),new Date(now+120000).toISOString());res.redirect(303,`${dashUrl(req,company.slug)}/?handoff=${encodeURIComponent(t)}`)};
 // Signed in on the app host: send the user to their company's own dashboard host (once its HTTPS is ready).
 app.post('/api/auth/handoff/create',(req,res)=>{
  if(!req.session||!onAppHost(req))return res.status(401).json({error:'Войдите в кабинет'});
  const company=req.company,h=hostInfo(req.get('host'),baseDomain);if(!company||company.slug==='app'||!h.base)return res.json({url:null});
  if(!dashReady(company.slug,env))return res.json({url:null,pending:true});
  const t=randomBytes(24).toString('base64url'),now=Date.now();raw.prepare('INSERT INTO session_handoffs VALUES(?,?,?,?,?,NULL)').run(sha(t),req.session.user_id,company.id,new Date(now).toISOString(),new Date(now+120000).toISOString());
  res.json({url:`${dashUrl(req,company.slug)}/?handoff=${encodeURIComponent(t)}`});
 });
 app.post('/api/auth/handoff',(req,res)=>{
  const {token}=req.body??{},row=typeof token==='string'&&token.length<=100&&raw.prepare('SELECT * FROM session_handoffs WHERE id=?').get(sha(token));
  if(!row||row.used_at||row.expires_at<new Date().toISOString()||row.company_id!==req.company?.id)return res.status(404).json({error:'Ссылка входа недействительна. Войдите ещё раз.'});
  if(!Number(raw.prepare('UPDATE session_handoffs SET used_at=? WHERE id=? AND used_at IS NULL').run(new Date().toISOString(),row.id).changes))return res.status(404).json({error:'Ссылка входа недействительна. Войдите ещё раз.'});
  startSession(res,req,row.user_id,row.company_id);res.json({ok:true});
 });
 const readCookie=req=>{const m=String(req.headers.cookie||'').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));return m?decodeURIComponent(m[1]):null};
 const back=(res,code)=>res.redirect(303,'/login?oauth_error='+code);
 const redirectUri=(req,p)=>`${req.protocol}://${req.get('host')}/api/auth/oauth/${p}/callback`;
 const jwks=async url=>{const c=jwksCache.get(url);if(c&&Date.now()-c.at<3600000)return c.keys;const r=await fetchImpl(url);if(!r.ok)throw Error('jwks');const keys=(await r.json()).keys;jwksCache.set(url,{at:Date.now(),keys});return keys};
 const verifyIdToken=async(idToken,p,clientId,nonce)=>{
  const [h,pl,sig]=String(idToken).split('.');if(!sig)throw Error('format');const header=JSON.parse(b64u(h)),claims=JSON.parse(b64u(pl));
  if(header.alg!=='RS256')throw Error('alg');const jwk=(await jwks(p.jwks)).find(k=>k.kid===header.kid);if(!jwk)throw Error('kid');
  if(!verify('RSA-SHA256',Buffer.from(h+'.'+pl),createPublicKey({key:jwk,format:'jwk'}),b64u(sig)))throw Error('signature');
  const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(!p.issuers.includes(claims.iss)||!aud.includes(clientId)||!(claims.exp*1000>Date.now())||claims.nonce!==nonce)throw Error('claims');
  if(!(claims.email_verified===true||claims.email_verified==='true')||!claims.email)throw Error('email');
  return claims;
 };

 app.get('/api/auth/oauth/:provider/start',(req,res)=>{
  const p=PROVIDERS[req.params.provider];if(!enabled||!p||!p.configured(env)||!onAppHost(req))return back(res,'unavailable');
  const state=randomBytes(24).toString('base64url'),nonce=randomBytes(16).toString('base64url');
  raw.prepare("DELETE FROM oauth_states WHERE created_at<?").run(new Date(Date.now()-STATE_MINUTES*60000).toISOString());
  const to=String(req.query.to||''),target=to&&companyBySlug(db,to),returnSlug=target&&target.status==='active'&&to!=='app'?to:null;
  raw.prepare('INSERT INTO oauth_states(id,provider,nonce,created_at,return_slug) VALUES(?,?,?,?,?)').run(sha(state),req.params.provider,nonce,new Date().toISOString(),returnSlug);
  // Apple returns with a cross-site form POST, so its cookie must be SameSite=None (HTTPS only).
  res.cookie(COOKIE,state,{httpOnly:true,secure:req.secure,sameSite:p.formPost&&req.secure?'none':'lax',path:'/api/auth/oauth',maxAge:STATE_MINUTES*60000});
  const q=new URLSearchParams({client_id:p.clientId(env),redirect_uri:redirectUri(req,req.params.provider),response_type:'code',scope:p.scope,state,nonce,...(p.formPost?{response_mode:'form_post'}:{prompt:'select_account'})});
  res.redirect(302,`${p.authorize}?${q}`);
 });
 const callback=async(req,res)=>{
  const name=req.params.provider,p=PROVIDERS[name];if(!enabled||!p||!p.configured(env)||!onAppHost(req))return back(res,'unavailable');
  const input=req.method==='POST'?req.body??{}:req.query,state=String(input.state||''),cookie=readCookie(req);
  res.clearCookie(COOKIE,{path:'/api/auth/oauth'});
  if(input.error)return back(res,'cancelled');
  const saved=state&&cookie===state&&raw.prepare('SELECT * FROM oauth_states WHERE id=? AND provider=?').get(sha(state),name);
  if(!saved||saved.created_at<new Date(Date.now()-STATE_MINUTES*60000).toISOString())return back(res,'expired');
  raw.prepare('DELETE FROM oauth_states WHERE id=?').run(saved.id);
  let claims;
  try{
   const r=await fetchImpl(p.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',code:String(input.code||''),redirect_uri:redirectUri(req,name),client_id:p.clientId(env),client_secret:p.secret(env)})});
   const tokens=await r.json();if(!r.ok||!tokens.id_token)throw Error('token');
   claims=await verifyIdToken(tokens.id_token,p,p.clientId(env),saved.nonce);
  }catch{return back(res,'failed')}
  const email=String(claims.email).toLowerCase(),now=new Date().toISOString();
  // Apple sends the name only on the first sign-in, as a JSON form field.
  let fullName=claims.name||[claims.given_name,claims.family_name].filter(Boolean).join(' ');
  if(!fullName&&input.user){try{const u=JSON.parse(input.user);fullName=[u.name?.firstName,u.name?.lastName].filter(Boolean).join(' ')}catch{}}
  let user=raw.prepare('SELECT u.* FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.provider=? AND i.subject=?').get(name,String(claims.sub));
  if(!user){user=raw.prepare('SELECT * FROM users WHERE email=?').get(email);if(user)raw.prepare('INSERT OR IGNORE INTO user_identities VALUES(?,?,?,?,?)').run(name,String(claims.sub),user.id,email,now)}
  // Started from a company host: only its members get back in, via the one-time handoff.
  if(saved.return_slug){
   const company=companyBySlug(db,saved.return_slug);if(!company||company.status!=='active')return back(res,'unavailable');
   if(!user)return dashBack(req,res,company.slug,'no_account');
   if(!raw.prepare('SELECT 1 FROM memberships WHERE user_id=? AND company_id=?').get(user.id,company.id))return dashBack(req,res,company.slug,'no_access');
   return handoff(req,res,user.id,company);
  }
  if(user){
   const m=raw.prepare("SELECT m.company_id FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? AND c.status='active' ORDER BY m.created_at LIMIT 1").get(user.id);
   if(!m)return back(res,'no_company');
   startSession(res,req,user.id,m.company_id);return res.redirect(303,'/');
  }
  // New person: step-by-step sign-up with the verified contact filled in.
  const token=createSignupLead({name:fullName||email.split('@')[0],email,oauth:{provider:name,subject:String(claims.sub),email}});
  res.redirect(303,'/signup?onboarding='+encodeURIComponent(token));
 };
 app.get('/api/auth/oauth/:provider/callback',callback);
 app.post('/api/auth/oauth/:provider/callback',express.urlencoded({extended:false,limit:'20kb'}),callback);
}
