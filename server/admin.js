// Platform admin (admin.<domain>): companies, users, subscriptions and product analytics across all tenants.
// Separate accounts list (platform_admins), separate cookie and sessions; never reachable from a company host.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {verifyPassword} from './auth.js';
import {onboardingFunnel,onboardingSteps} from './onboarding.js';
import {PLANS,TRIAL_DAYS,trialEnd,companyMrr} from './plans.js';
import {DEFAULT_COMPANY} from './tenancy.js';

const COOKIE='lanilot_admin',SESSION_HOURS=12;
const sha=v=>createHash('sha256').update(v).digest('hex');
const DAY=86400000,dayOf=t=>new Date(t).toISOString().slice(0,10);

export const requestStatuses=['new','contacted','scheduled','won','lost'];
export function installAdminTables(raw){
 raw.exec(`CREATE TABLE IF NOT EXISTS demo_requests(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,company TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',fleet_size TEXT NOT NULL DEFAULT '',message TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',lang TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'new',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS platform_admins(user_id TEXT PRIMARY KEY REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL);`);
 const cols=raw.prepare('PRAGMA table_info(companies)').all().map(c=>c.name);
 for(const [col,def] of [['sandbox','INTEGER NOT NULL DEFAULT 0'],['internal','INTEGER NOT NULL DEFAULT 0'],['trial_ends_at','TEXT'],['notes',"TEXT NOT NULL DEFAULT ''"],['plan_changed_at','TEXT']])if(!cols.includes(col))raw.exec(`ALTER TABLE companies ADD COLUMN ${col} ${def}`);
 // The primary workspace and the demo company are ours, not customers: kept out of the metrics.
 raw.prepare("UPDATE companies SET internal=1 WHERE id IN (?, 'co-demo') AND internal=0").run(DEFAULT_COMPANY);
}

export function registerAdmin(app,db){
 const raw=db.raw;installAdminTables(raw);
 const attempts=new Map();
 const readCookie=req=>{const m=String(req.headers.cookie||'').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));return m?decodeURIComponent(m[1]):null};
 const adminOf=req=>{const v=readCookie(req);if(!v)return null;return raw.prepare('SELECT s.*,u.name,u.email FROM admin_sessions s JOIN users u ON u.id=s.user_id JOIN platform_admins a ON a.user_id=s.user_id WHERE s.id=? AND s.expires_at>?').get(sha(v),new Date().toISOString())??null};
 const table=name=>!!raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const countIn=(name,companyId)=>table(name)?raw.prepare(`SELECT count(*) n FROM ${name} WHERE company_id=?`).get(companyId).n:0;
 const days=req=>[7,30,90,365].includes(Number(req.query.days))?Number(req.query.days):30;

 // "Book a demo" from the public landing (proxied same-origin): stored as a request for the sales team.
 const demoAttempts=new Map();
 app.post('/api/public/demo-request',(req,res)=>{
  const origin=req.get('origin');if(origin){let host;try{host=new URL(origin).host}catch{host=null}if(host!==req.get('host'))return res.status(403).json({error:'Запрос с другого сайта отклонён'})}
  const b=req.body??{},text=(v,max)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
  if(b.website)return res.status(201).json({ok:true}); // honeypot: bots fill hidden fields
  const key=req.ip,now=Date.now(),list=(demoAttempts.get(key)||[]).filter(t=>now-t<3600000);demoAttempts.set(key,list);
  if(list.length>=5)return res.status(429).json({error:'Too many requests. Please try again later.'});
  const r={name:text(b.name,100),email:text(b.email,160),company:text(b.company,120),phone:text(b.phone??'',40),fleetSize:text(b.fleetSize??'',10),message:text(b.message??'',1000),source:text(b.source??'',200)??'',lang:text(b.lang??'',8)??''};
  if(!r.name||!r.company||!r.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)||r.phone===null||r.message===null||r.fleetSize===null||r.fleetSize&&!['1','2-5','6-20','21-50','50+'].includes(r.fleetSize))return res.status(400).json({error:'Please enter your name, company and a valid work email.'});
  list.push(now);const t=new Date().toISOString();
  raw.prepare('INSERT INTO demo_requests(id,name,email,company,phone,fleet_size,message,source,lang,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('dr-'+randomBytes(8).toString('hex'),r.name,r.email,r.company,r.phone,r.fleetSize,r.message,r.source,r.lang,t,t);
  res.status(201).json({ok:true});
 });
 app.use('/api/admin',(req,res,next)=>{
  if(!req.adminHost)return res.status(404).json({error:'Не найдено'});
  if(!['GET','HEAD'].includes(req.method)){const origin=req.get('origin');if(origin){let host;try{host=new URL(origin).host}catch{host=null}if(host!==req.get('host'))return res.status(403).json({error:'Запрос с другого сайта отклонён'})}}
  if(req.path==='/login'||req.path==='/logout')return next();
  req.admin=adminOf(req);if(!req.admin)return res.status(401).json({error:'Войдите в админ-панель',code:'unauthenticated'});next();
 });
 app.post('/api/admin/login',(req,res)=>{
  const {email,password}=req.body??{},key=req.ip,now=Date.now(),list=(attempts.get(key)||[]).filter(t=>now-t<15*60000);attempts.set(key,list);
  if(list.length>=8)return res.status(429).json({error:'Слишком много попыток. Попробуйте через 15 минут.'});
  const user=typeof email==='string'&&raw.prepare('SELECT u.* FROM users u JOIN platform_admins a ON a.user_id=u.id WHERE u.email=?').get(email.trim());
  if(!user||!verifyPassword(password,user.password_hash)){list.push(now);return res.status(401).json({error:'Неверный email или пароль'})}
  attempts.delete(key);const value=randomBytes(32).toString('base64url'),t=new Date();
  raw.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(sha(value),user.id,t.toISOString(),new Date(t.getTime()+SESSION_HOURS*3600000).toISOString());
  res.cookie(COOKIE,value,{httpOnly:true,sameSite:'strict',secure:req.secure,path:'/',maxAge:SESSION_HOURS*3600000});res.json({ok:true});
 });
 app.post('/api/admin/logout',(req,res)=>{const v=readCookie(req);if(v)raw.prepare('DELETE FROM admin_sessions WHERE id=?').run(sha(v));res.clearCookie(COOKIE,{path:'/'});res.json({ok:true})});
 app.get('/api/admin/me',(req,res)=>res.json({user:{name:req.admin.name,email:req.admin.email},plans:PLANS,trialDays:TRIAL_DAYS,newRequests:raw.prepare("SELECT count(*) n FROM demo_requests WHERE status='new'").get().n}));
 app.get('/api/admin/requests',(req,res)=>{const status=requestStatuses.includes(req.query.status)?req.query.status:null;res.json({counts:Object.fromEntries(raw.prepare('SELECT status,count(*) n FROM demo_requests GROUP BY status').all().map(r=>[r.status,r.n])),requests:raw.prepare(`SELECT * FROM demo_requests ${status?'WHERE status=?':''} ORDER BY created_at DESC LIMIT 500`).all(...(status?[status]:[]))})});
 app.patch('/api/admin/requests/:id',(req,res)=>{
  const r=raw.prepare('SELECT * FROM demo_requests WHERE id=?').get(req.params.id);if(!r)return res.status(404).json({error:'Заявка не найдена'});
  const {status,notes}=req.body??{};if(status!==undefined&&!requestStatuses.includes(status))return res.status(400).json({error:'Неизвестный статус'});if(notes!==undefined&&(typeof notes!=='string'||notes.length>2000))return res.status(400).json({error:'Заметка: до 2000 символов'});
  raw.prepare('UPDATE demo_requests SET status=?,notes=?,updated_at=? WHERE id=?').run(status??r.status,notes??r.notes,new Date().toISOString(),r.id);res.json(raw.prepare('SELECT * FROM demo_requests WHERE id=?').get(r.id));
 });

 // Overview: KPIs for the period vs the previous one, daily series, funnel, sources and plans.
 app.get('/api/admin/overview',(req,res)=>{
  const n=days(req),end=Date.now(),from=dayOf(end-(n-1)*DAY),prevFrom=dayOf(end-(2*n-1)*DAY),list=Array.from({length:n},(_,i)=>dayOf(end-(n-1-i)*DAY));
  const range=(sql,a,b)=>raw.prepare(sql).get(a,b).n;
  const kpi=(sql)=>({value:range(sql,from,'9999'),previous:range(sql,prevFrom,from)});
  const metric={
   signups:kpi("SELECT count(*) n FROM companies WHERE internal=0 AND sandbox=0 AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<?"),
   leads:kpi("SELECT count(*) n FROM signup_leads WHERE substr(created_at,1,10)>=? AND substr(created_at,1,10)<?"),
   activeUsers:kpi("SELECT count(DISTINCT a.user_id) n FROM activity a JOIN companies c ON c.id=a.company_id WHERE c.internal=0 AND a.day>=? AND a.day<?"),
   activeCompanies:kpi("SELECT count(DISTINCT a.company_id) n FROM activity a JOIN companies c ON c.id=a.company_id WHERE c.internal=0 AND a.day>=? AND a.day<?"),
   demoRequests:kpi("SELECT count(*) n FROM demo_requests WHERE substr(created_at,1,10)>=? AND substr(created_at,1,10)<?")
  };
  const completed=kpi("SELECT count(*) n FROM signup_leads WHERE status='completed' AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<?");
  metric.conversion={value:metric.leads.value?completed.value/metric.leads.value:null,previous:metric.leads.previous?completed.previous/metric.leads.previous:null};
  const series=(sql,shift=0)=>{const rows=Object.fromEntries(raw.prepare(sql).all(dayOf(end-(n-1+shift)*DAY),dayOf(end-shift*DAY+DAY)).map(r=>[r.day,r.n]));return list.map((d,i)=>rows[dayOf(Date.parse(d)-shift*DAY)]??0)};
  const sql={
   signups:"SELECT substr(created_at,1,10) day,count(*) n FROM companies WHERE internal=0 AND sandbox=0 AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<? GROUP BY day",
   leads:"SELECT substr(created_at,1,10) day,count(*) n FROM signup_leads WHERE substr(created_at,1,10)>=? AND substr(created_at,1,10)<? GROUP BY day",
   activeUsers:"SELECT a.day,count(DISTINCT a.user_id) n FROM activity a JOIN companies c ON c.id=a.company_id WHERE c.internal=0 AND a.day>=? AND a.day<? GROUP BY a.day",
   activeCompanies:"SELECT a.day,count(DISTINCT a.company_id) n FROM activity a JOIN companies c ON c.id=a.company_id WHERE c.internal=0 AND a.day>=? AND a.day<? GROUP BY a.day",
   demoRequests:"SELECT substr(created_at,1,10) day,count(*) n FROM demo_requests WHERE substr(created_at,1,10)>=? AND substr(created_at,1,10)<? GROUP BY day"
  };
  const companies=raw.prepare('SELECT * FROM companies WHERE internal=0 AND sandbox=0').all();
  const plans=Object.entries(PLANS).map(([id,p])=>{const list=companies.filter(c=>c.plan===id&&c.status==='active');return {id,name:p.name,price:p.price,companies:list.length,mrr:list.reduce((s,c)=>s+companyMrr(c),0)}});
  const sources=raw.prepare("SELECT CASE WHEN source='' THEN '(direct)' ELSE source END source,count(*) started,sum(status='completed') completed FROM signup_leads WHERE substr(created_at,1,10)>=? GROUP BY 1 ORDER BY started DESC LIMIT 8").all(from);
  res.json({days:n,dates:list,metrics:metric,series:Object.fromEntries(Object.entries(sql).map(([k,q])=>[k,{current:series(q),previous:series(q,n)}])),
   totals:{companies:companies.length,active:companies.filter(c=>c.status==='active').length,suspended:companies.filter(c=>c.status==='suspended').length,users:raw.prepare('SELECT count(DISTINCT m.user_id) n FROM memberships m JOIN companies c ON c.id=m.company_id WHERE c.internal=0 AND c.sandbox=0').get().n,sandboxes:raw.prepare('SELECT count(*) n FROM companies WHERE sandbox=1').get().n,mrr:companies.reduce((s,c)=>s+companyMrr(c),0),trials:companies.filter(c=>c.plan==='trial'&&c.status==='active').length},
   funnel:onboardingFunnel(raw,{days:n}),plans,sources});
 });

 const companyRow=c=>({id:c.id,slug:c.slug,name:c.name,status:c.status,plan:c.plan,internal:!!c.internal,sandbox:!!c.sandbox,createdAt:c.created_at,trialEndsAt:c.plan==='trial'?trialEnd(c):null,mrr:companyMrr(c),notes:c.notes,
  users:raw.prepare('SELECT count(*) n FROM memberships WHERE company_id=?').get(c.id).n,
  owner:raw.prepare("SELECT u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND m.role='owner' ORDER BY m.created_at LIMIT 1").get(c.id)??null,
  lastActive:raw.prepare('SELECT max(day) d FROM activity WHERE company_id=?').get(c.id).d,
  activeDays30:raw.prepare('SELECT count(DISTINCT day) n FROM activity WHERE company_id=? AND day>=?').get(c.id,dayOf(Date.now()-29*DAY)).n,
  trucks:countIn('t_trucks',c.id),loads:countIn('t_loads',c.id),trips:countIn('t_trips',c.id)});
 app.get('/api/admin/companies',(req,res)=>{
  const q=String(req.query.q||'').trim().toLowerCase();
  let list=raw.prepare('SELECT * FROM companies ORDER BY created_at DESC').all().map(companyRow);
  if(q)list=list.filter(c=>[c.name,c.slug,c.owner?.email,c.owner?.name].some(v=>v?.toLowerCase().includes(q)));
  if(req.query.status)list=list.filter(c=>c.status===req.query.status);
  if(req.query.plan)list=list.filter(c=>c.plan===req.query.plan);
  if(req.query.internal!=='1')list=list.filter(c=>!c.internal);
  if(req.query.sandbox==='0')list=list.filter(c=>!c.sandbox);
  res.json(list);
 });
 app.get('/api/admin/companies/:id',(req,res)=>{
  const c=raw.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Компания не найдена'});
  const settings=table('t_settings')?raw.prepare("SELECT data FROM t_settings WHERE company_id=? AND id='workspace'").get(c.id):null,s=settings?JSON.parse(settings.data):{};
  const lead=raw.prepare('SELECT data,source,created_at,completed_at FROM signup_leads WHERE company_id=?').get(c.id);
  const list=Array.from({length:30},(_,i)=>dayOf(Date.now()-(29-i)*DAY)),rows=Object.fromEntries(raw.prepare('SELECT day,count(DISTINCT user_id) n FROM activity WHERE company_id=? AND day>=? GROUP BY day').all(c.id,list[0]).map(r=>[r.day,r.n]));
  res.json({...companyRow(c),profile:s.company??null,operations:s.operations??null,
   members:raw.prepare('SELECT u.id,u.name,u.email,m.role,m.created_at,(SELECT max(day) FROM activity a WHERE a.user_id=u.id AND a.company_id=m.company_id) last_active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY m.created_at').all(c.id),
   signup:lead?{source:lead.source,startedAt:lead.created_at,completedAt:lead.completed_at,answers:JSON.parse(lead.data)}:null,
   activity:{dates:list,users:list.map(d=>rows[d]??0)}});
 });
 app.patch('/api/admin/companies/:id',(req,res)=>{
  const c=raw.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Компания не найдена'});
  const {plan,status,trialEndsAt,notes}=req.body??{};
  if(plan!==undefined&&!PLANS[plan])return res.status(400).json({error:'Неизвестный тариф'});
  if(status!==undefined&&!['active','suspended'].includes(status))return res.status(400).json({error:'Неизвестный статус'});
  if(status==='suspended'&&c.id===DEFAULT_COMPANY)return res.status(409).json({error:'Основную компанию платформы приостановить нельзя'});
  if(trialEndsAt!==undefined&&trialEndsAt!==null&&!(typeof trialEndsAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(trialEndsAt)&&!Number.isNaN(Date.parse(trialEndsAt))))return res.status(400).json({error:'Дата окончания пробного периода: ГГГГ-ММ-ДД'});
  if(notes!==undefined&&(typeof notes!=='string'||notes.length>2000))return res.status(400).json({error:'Заметка: до 2000 символов'});
  const now=new Date().toISOString();
  raw.prepare('UPDATE companies SET plan=?,status=?,trial_ends_at=?,notes=?,plan_changed_at=? WHERE id=?').run(plan??c.plan,status??c.status,trialEndsAt===undefined?c.trial_ends_at:trialEndsAt&&trialEndsAt+'T23:59:59.000Z',notes??c.notes,plan&&plan!==c.plan?now:c.plan_changed_at,c.id);
  if(status==='suspended')raw.prepare('DELETE FROM sessions WHERE company_id=?').run(c.id);
  res.json(companyRow(raw.prepare('SELECT * FROM companies WHERE id=?').get(c.id)));
 });
 app.get('/api/admin/users',(req,res)=>{
  const q=String(req.query.q||'').trim().toLowerCase();
  let list=raw.prepare('SELECT u.id,u.name,u.email,u.created_at,(SELECT max(day) FROM activity a WHERE a.user_id=u.id) last_active,(SELECT count(*) FROM platform_admins p WHERE p.user_id=u.id) admin FROM users u ORDER BY u.created_at DESC').all()
   .map(u=>({...u,admin:!!u.admin,companies:raw.prepare('SELECT c.id,c.name,c.slug,m.role FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=?').all(u.id)}));
  if(q)list=list.filter(u=>[u.name,u.email,...u.companies.map(c=>c.name)].some(v=>v.toLowerCase().includes(q)));
  res.json(list);
 });
 app.get('/api/admin/subscriptions',(req,res)=>{
  const companies=raw.prepare('SELECT * FROM companies WHERE internal=0 AND sandbox=0').all(),soon=Date.now()+7*DAY;
  res.json({plans:Object.entries(PLANS).map(([id,p])=>({id,...p,companies:companies.filter(c=>c.plan===id&&c.status==='active').length,mrr:companies.filter(c=>c.plan===id).reduce((s,c)=>s+companyMrr(c),0)})),
   mrr:companies.reduce((s,c)=>s+companyMrr(c),0),
   trials:companies.filter(c=>c.plan==='trial'&&c.status==='active').map(companyRow).sort((a,b)=>a.trialEndsAt.localeCompare(b.trialEndsAt)).map(c=>({...c,expired:Date.parse(c.trialEndsAt)<Date.now(),endingSoon:Date.parse(c.trialEndsAt)<soon})),
   paying:companies.filter(c=>companyMrr(c)>0).map(companyRow)});
 });
 app.get('/api/admin/funnel',(req,res)=>{
  const n=days(req),from=dayOf(Date.now()-(n-1)*DAY),f=onboardingFunnel(raw,{days:n});
  const leads=raw.prepare("SELECT email,name,step,status,source,lang,created_at,updated_at FROM signup_leads WHERE substr(created_at,1,10)>=? ORDER BY updated_at DESC LIMIT 200").all(from);
  const time=onboardingSteps.slice(0,-1).map(step=>{const r=raw.prepare("SELECT avg((julianday(e.created_at)-julianday(l.created_at))*86400) s FROM signup_events e JOIN signup_leads l ON l.id=e.lead_id WHERE e.event=? AND substr(l.created_at,1,10)>=?").get(step+'_completed',from);return {step,seconds:r.s}});
  res.json({...f,steps:f.steps,time,leads});
 });
}
