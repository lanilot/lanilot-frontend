// Users, sessions, invitations and roles. Accounts are global (one email, many companies);
// access is a membership in a company with a role: owner > dispatcher > viewer.
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {installOnboarding} from './onboarding.js';
import {tenantContext,slugFromHost,companyBySlug,companyById,uniqueSlug,asCompany,DEFAULT_COMPANY} from './tenancy.js';

export const roles=['owner','dispatcher','viewer'];
const SESSION_DAYS=30,INVITE_DAYS=7,COOKIE='lanilot_session';
const sha=v=>createHash('sha256').update(v).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
export function hashPassword(password){const salt=randomBytes(16);return `scrypt$${salt.toString('base64')}$${scryptSync(password,salt,64).toString('base64')}`}
export function verifyPassword(password,stored){
 const [kind,salt,hash]=String(stored||'').split('$');if(kind!=='scrypt'||!salt||!hash)return false;
 const expected=Buffer.from(hash,'base64'),actual=scryptSync(String(password),Buffer.from(salt,'base64'),expected.length);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
const validEmail=v=>typeof v==='string'&&v.length<=160&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const validPassword=v=>typeof v==='string'&&v.length>=8&&v.length<=200;
const cleanName=v=>typeof v==='string'&&v.trim().length>=1&&v.trim().length<=100?v.trim():null;
// Writes that change company configuration or access are reserved for owners.
const ownerOnly=(method,path)=>method!=='GET'&&/^\/api\/(settings|integrations|providers|telegram|users)(\/|$)/.test(path);

// Self sign-up creates a new company with its owner; LANILOT_SIGNUP=off disables it.
export function installAuth(db,{enabled=true,baseDomain='lanilot.com',setupToken=process.env.LANILOT_SETUP_TOKEN,signup=process.env.LANILOT_SIGNUP!=='off',seedCompany=()=>{},brandOf=()=>null}={}){
 const raw=db.raw;
 raw.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS memberships(user_id TEXT NOT NULL REFERENCES users(id),company_id TEXT NOT NULL REFERENCES companies(id),role TEXT NOT NULL CHECK(role IN ('owner','dispatcher','viewer')),created_at TEXT NOT NULL,PRIMARY KEY(user_id,company_id));
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),company_id TEXT NOT NULL REFERENCES companies(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS activity(day TEXT NOT NULL,company_id TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(day,company_id,user_id));
 CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),email TEXT NOT NULL COLLATE NOCASE,role TEXT NOT NULL,created_by TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,accepted_at TEXT);`);
 // One-time owner setup for a company without members: token from LANILOT_SETUP_TOKEN or printed at start.
 const members=companyId=>raw.prepare('SELECT count(*) n FROM memberships WHERE company_id=?').get(companyId).n;
 let setup=setupToken||null;
 if(enabled&&!setup&&!members(DEFAULT_COMPANY)){setup=token();console.log(`Lanilot: owner setup token for the first account: ${setup}`)}
 const attempts=new Map();
 const limited=(key,max=10,windowMs=15*60000)=>{const now=Date.now(),list=(attempts.get(key)||[]).filter(t=>now-t<windowMs);attempts.set(key,list);return list.length>=max};
 const fail=key=>attempts.set(key,[...(attempts.get(key)||[]),Date.now()]);

 const startSession=(res,req,userId,companyId)=>{
  const value=token(),now=new Date();raw.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(sha(value),userId,companyId,now.toISOString(),new Date(now.getTime()+SESSION_DAYS*86400000).toISOString());
  res.cookie(COOKIE,value,{httpOnly:true,sameSite:'lax',secure:req.secure,path:'/',maxAge:SESSION_DAYS*86400000});
 };
 const readCookie=req=>{const m=String(req.headers.cookie||'').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));return m?decodeURIComponent(m[1]):null};
 const sessionOf=req=>{
  const value=readCookie(req);if(!value||!req.company)return null;
  const s=raw.prepare('SELECT s.*,u.name,u.email,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.company_id=s.company_id WHERE s.id=? AND s.company_id=?').get(sha(value),req.company.id);
  if(!s||s.expires_at<new Date().toISOString())return null;return s;
 };
 const publicCompany=c=>c&&{id:c.id,slug:c.slug,name:c.name,status:c.status,brand:brandOf(c.id)};
 const inviteOf=value=>{const i=typeof value==='string'&&raw.prepare('SELECT * FROM invites WHERE id=?').get(sha(value));return i&&!i.accepted_at&&i.expires_at>new Date().toISOString()?i:null};
 const onAppHost=req=>slugFromHost(req.get('host'),baseDomain)==='app';
 const ownerCount=companyId=>raw.prepare("SELECT count(*) n FROM memberships WHERE company_id=? AND role='owner'").get(companyId).n;

 // Company from the host name; unknown subdomains get 404, suspended companies 403.
 const resolveTenant=(req,res,next)=>{
  if(!req.path.startsWith('/api/'))return next();
  const slug=slugFromHost(req.get('host'),baseDomain);
  // admin.<domain> serves only the platform admin API.
  if(slug==='admin'){if(req.path.startsWith('/api/admin/')){req.adminHost=true;return next()}return res.status(404).json({error:'Не найдено'})}
  let company=slug&&companyBySlug(db,slug);
  // The shared app host serves every company: an invitation link or the signed-in session names it.
  if(enabled&&slug==='app'){
   const invite=inviteOf(req.path.match(/^\/api\/auth\/invites\/([^/]+)/)?.[1]),value=!invite&&readCookie(req);
   const id=invite?.company_id??(value&&raw.prepare('SELECT company_id FROM sessions WHERE id=? AND expires_at>?').get(sha(value),new Date().toISOString())?.company_id);
   if(id)company=companyById(db,id)??company;
  }
  if(!company)return res.status(404).json({error:'Компания не найдена',code:'company_not_found'});
  if(company.status!=='active'&&req.path!=='/api/tenant')return res.status(403).json({error:'Доступ к кабинету компании приостановлен',code:'company_suspended'});
  req.company=company;next();
 };

 // New company with its owner; the profile starts from the sign-up answers, with or without the demo workspace.
 const createAccount=({name,company,email,password,demo,phone='',city='',profile={},operations})=>{
  const userId='usr-'+randomBytes(8).toString('hex'),companyId='co-'+randomBytes(8).toString('hex'),now=new Date().toISOString();
  raw.exec('BEGIN IMMEDIATE');try{
   raw.prepare('INSERT INTO companies(id,slug,name,demo,created_at) VALUES(?,?,?,?,?)').run(companyId,uniqueSlug(db,cleanName(company)),cleanName(company),demo?1:0,now);
   raw.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(userId,email.trim(),cleanName(name),hashPassword(password),now);
   raw.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(userId,companyId,'owner',now);raw.exec('COMMIT');
  }catch(e){raw.exec('ROLLBACK');throw e}
  seedCompany({id:companyId,demo:demo?1:0});
  asCompany(companyId,()=>{const s=JSON.parse(db.prepare("SELECT data FROM settings WHERE id='workspace'").get().data);s.company={...s.company,name:cleanName(company),contactName:cleanName(name),email:email.trim(),...(phone?{phone}:{}),...(city?{city}:{}),...profile};if(operations)s.operations=operations;db.prepare("UPDATE settings SET data=? WHERE id='workspace'").run(JSON.stringify(s))});
  return {userId,companyId};
 };
 const register=app=>{
  // Cross-site writes are refused: browsers send Origin on POST/PUT/PATCH/DELETE.
  app.use((req,res,next)=>{if(req.method==='GET'||req.method==='HEAD'||!req.path.startsWith('/api/'))return next();const origin=req.get('origin');if(origin){let host;try{host=new URL(origin).host}catch{host=null}if(host!==req.get('host'))return res.status(403).json({error:'Запрос с другого сайта отклонён'})}next()});
  // Daily activity (one row per user, company and day) feeds the platform analytics.
  const seen=new Map(),touch=s=>{const day=new Date().toISOString().slice(0,10),key=s.user_id+'|'+s.company_id;if(seen.get(key)===day)return;seen.set(key,day);raw.prepare('INSERT OR IGNORE INTO activity VALUES(?,?,?)').run(day,s.company_id,s.user_id)};
  app.use((req,res,next)=>{req.session=enabled?sessionOf(req):null;if(req.session)touch(req.session);next()});

  app.get('/api/tenant',(req,res)=>res.json({company:publicCompany(req.company),auth:{enabled,signup:enabled&&signup&&onAppHost(req),setupRequired:enabled&&req.company.id===DEFAULT_COMPANY&&!members(req.company.id)}}));
  app.get('/api/auth/me',(req,res)=>{
   if(!enabled)return res.json({user:null,role:'owner',company:publicCompany(req.company),authEnabled:false});
   if(!req.session)return res.status(401).json({error:'Войдите в кабинет',code:'unauthenticated'});
   res.json({user:{id:req.session.user_id,name:req.session.name,email:req.session.email},role:req.session.role,company:publicCompany(req.company),authEnabled:true});
  });
  app.post('/api/auth/setup',(req,res)=>{
   const {setupToken:given,name,email,password}=req.body??{};
   if(members(req.company.id))return res.status(409).json({error:'Владелец уже создан. Войдите в кабинет.'});
   if(!setup||req.company.id!==DEFAULT_COMPANY||typeof given!=='string'||given.length!==setup.length||!timingSafeEqual(Buffer.from(given),Buffer.from(setup)))return res.status(403).json({error:'Неверный код настройки'});
   if(!cleanName(name)||!validEmail(email)||!validPassword(password))return res.status(400).json({error:'Укажите имя, email и пароль от 8 символов'});
   if(raw.prepare('SELECT id FROM users WHERE email=?').get(email.trim()))return res.status(409).json({error:'Пользователь с таким email уже есть'});
   const id='usr-'+randomBytes(8).toString('hex'),now=new Date().toISOString();
   raw.exec('BEGIN IMMEDIATE');try{raw.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,email.trim(),cleanName(name),hashPassword(password),now);raw.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(id,req.company.id,'owner',now);raw.exec('COMMIT')}catch(e){raw.exec('ROLLBACK');throw e}
   setup=null;startSession(res,req,id,req.company.id);res.status(201).json({ok:true});
  });
  app.post('/api/auth/login',(req,res)=>{
   const {email,password}=req.body??{},key=req.ip+'|'+String(email).toLowerCase();
   if(limited(key))return res.status(429).json({error:'Слишком много попыток. Попробуйте через 15 минут.'});
   const user=validEmail(email)&&raw.prepare('SELECT * FROM users WHERE email=?').get(email.trim());
   // A company subdomain admits its members only; the app host opens this company or the user's first active one.
   const member=user&&(raw.prepare('SELECT company_id FROM memberships WHERE user_id=? AND company_id=?').get(user.id,req.company.id)
    ??(onAppHost(req)?raw.prepare("SELECT m.company_id FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? AND c.status='active' ORDER BY m.created_at LIMIT 1").get(user.id):null));
   if(!user||!verifyPassword(password,user.password_hash)||!member){fail(key);return res.status(401).json({error:'Неверный email или пароль'})}
   attempts.delete(key);startSession(res,req,user.id,member.company_id);res.json({ok:true});
  });
  installOnboarding(app,db,{enabled:enabled&&signup,onAppHost,limited,fail,createAccount,startSession,cleanName,validEmail,validPassword});
  app.post('/api/auth/register',(req,res)=>{
   if(!enabled||!signup||!onAppHost(req))return res.status(404).json({error:'Регистрация недоступна'});
   const key='signup|'+req.ip;if(limited(key,5,3600000))return res.status(429).json({error:'Слишком много регистраций. Попробуйте через час.'});
   const {name,company,email,password,demo=true}=req.body??{};
   if(!cleanName(name)||!cleanName(company)||!validEmail(email)||!validPassword(password)||typeof demo!=='boolean')return res.status(400).json({error:'Укажите имя, компанию, email и пароль от 8 символов'});
   if(raw.prepare('SELECT id FROM users WHERE email=?').get(email.trim()))return res.status(409).json({error:'Аккаунт с таким email уже есть. Войдите в кабинет.'});
   fail(key);const {userId,companyId}=createAccount({name,company,email,password,demo});
   startSession(res,req,userId,companyId);res.status(201).json({ok:true});
  });
  app.post('/api/auth/logout',(req,res)=>{const value=readCookie(req);if(value)raw.prepare('DELETE FROM sessions WHERE id=?').run(sha(value));res.clearCookie(COOKIE,{path:'/'});res.json({ok:true})});
  app.post('/api/auth/password',(req,res)=>{
   if(!req.session)return res.status(401).json({error:'Войдите в кабинет'});
   const {current,next}=req.body??{},user=raw.prepare('SELECT * FROM users WHERE id=?').get(req.session.user_id);
   if(!verifyPassword(current,user.password_hash))return res.status(400).json({error:'Текущий пароль указан неверно'});
   if(!validPassword(next))return res.status(400).json({error:'Новый пароль: от 8 символов'});
   raw.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next),user.id);
   raw.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(user.id,req.session.id);res.json({ok:true});
  });
  app.get('/api/auth/invites/:token',(req,res)=>{const i=inviteOf(req.params.token);if(!i||i.company_id!==req.company.id)return res.status(404).json({error:'Приглашение недействительно или истекло'});res.json({email:i.email,role:i.role,company:publicCompany(req.company),existingUser:!!raw.prepare('SELECT id FROM users WHERE email=?').get(i.email)})});
  app.post('/api/auth/invites/:token/accept',(req,res)=>{
   const i=inviteOf(req.params.token);if(!i||i.company_id!==req.company.id)return res.status(404).json({error:'Приглашение недействительно или истекло'});
   const {name,password}=req.body??{},now=new Date().toISOString();let user=raw.prepare('SELECT * FROM users WHERE email=?').get(i.email);
   if(user){if(!verifyPassword(password,user.password_hash))return res.status(401).json({error:'Неверный пароль от существующего аккаунта'})}
   else{if(!cleanName(name)||!validPassword(password))return res.status(400).json({error:'Укажите имя и пароль от 8 символов'});user={id:'usr-'+randomBytes(8).toString('hex')};raw.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id,i.email,cleanName(name),hashPassword(password),now)}
   raw.prepare('INSERT INTO memberships VALUES(?,?,?,?) ON CONFLICT(user_id,company_id) DO UPDATE SET role=excluded.role').run(user.id,i.company_id,i.role,now);
   raw.prepare('UPDATE invites SET accepted_at=? WHERE id=?').run(now,i.id);startSession(res,req,user.id,i.company_id);res.json({ok:true});
  });

  // Everything else under /api needs a session (when auth is on) and runs as the request's company.
  app.use('/api',(req,res,next)=>{
   if(enabled&&!req.session)return res.status(401).json({error:'Войдите в кабинет',code:'unauthenticated'});
   const role=enabled?req.session.role:'owner';
   if(role==='viewer'&&req.method!=='GET')return res.status(403).json({error:'Роль «Наблюдатель»: только просмотр',code:'forbidden'});
   if(role!=='owner'&&ownerOnly(req.method,req.originalUrl.split('?')[0]))return res.status(403).json({error:'Это действие доступно только владельцу',code:'forbidden'});
   tenantContext.run({companyId:req.company.id,userId:req.session?.user_id??null,role},next);
  });

  app.get('/api/users',(req,res)=>{
   if(tenantContext.getStore().role!=='owner')return res.status(403).json({error:'Это действие доступно только владельцу'});
   res.json({members:raw.prepare('SELECT u.id,u.name,u.email,m.role,m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY m.created_at').all(req.company.id),
    invites:raw.prepare('SELECT id,email,role,created_at,expires_at FROM invites WHERE company_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY created_at DESC').all(req.company.id,new Date().toISOString())});
  });
  app.post('/api/users/invites',(req,res)=>{
   const {email,role}=req.body??{};if(!validEmail(email)||!roles.includes(role))return res.status(400).json({error:'Укажите email и роль'});
   if(raw.prepare('SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.email=?').get(req.company.id,email.trim()))return res.status(409).json({error:'Этот пользователь уже в компании'});
   const value=token(),now=new Date();raw.prepare('INSERT INTO invites VALUES(?,?,?,?,?,?,?,NULL)').run(sha(value),req.company.id,email.trim(),role,req.session?.user_id??null,now.toISOString(),new Date(now.getTime()+INVITE_DAYS*86400000).toISOString());
   res.status(201).json({path:'/invite/'+value,email:email.trim(),role,expiresInDays:INVITE_DAYS});
  });
  app.delete('/api/users/invites/:id',(req,res)=>{const r=raw.prepare('DELETE FROM invites WHERE id=? AND company_id=? AND accepted_at IS NULL').run(req.params.id,req.company.id);if(!r.changes)return res.status(404).json({error:'Приглашение не найдено'});res.json({ok:true})});
  app.patch('/api/users/:id',(req,res)=>{
   const {role}=req.body??{},m=raw.prepare('SELECT * FROM memberships WHERE user_id=? AND company_id=?').get(req.params.id,req.company.id);
   if(!m)return res.status(404).json({error:'Пользователь не найден'});if(!roles.includes(role))return res.status(400).json({error:'Укажите роль'});
   if(m.role==='owner'&&role!=='owner'&&ownerCount(req.company.id)<=1)return res.status(409).json({error:'В компании должен остаться хотя бы один владелец'});
   raw.prepare('UPDATE memberships SET role=? WHERE user_id=? AND company_id=?').run(role,m.user_id,m.company_id);res.json({ok:true});
  });
  app.delete('/api/users/:id',(req,res)=>{
   const m=raw.prepare('SELECT * FROM memberships WHERE user_id=? AND company_id=?').get(req.params.id,req.company.id);if(!m)return res.status(404).json({error:'Пользователь не найден'});
   if(m.role==='owner'&&ownerCount(req.company.id)<=1)return res.status(409).json({error:'В компании должен остаться хотя бы один владелец'});
   raw.prepare('DELETE FROM memberships WHERE user_id=? AND company_id=?').run(m.user_id,m.company_id);raw.prepare('DELETE FROM sessions WHERE user_id=? AND company_id=?').run(m.user_id,m.company_id);res.json({ok:true});
  });
 };

 // Script/admin helper: invitation link for a company owner.
 const createInvite=(companyId,email,role='owner')=>{const value=token(),now=new Date();raw.prepare('INSERT INTO invites VALUES(?,?,?,?,?,?,?,NULL)').run(sha(value),companyId,email,role,null,now.toISOString(),new Date(now.getTime()+INVITE_DAYS*86400000).toISOString());return '/invite/'+value};
 return {resolveTenant,register,createInvite,get setupToken(){return setup}};
}
