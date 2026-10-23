// Step-by-step sign-up. Every answered step is saved on a lead, so unfinished sign-ups show where people leave
// (see `npm run tenant -- funnel`). The account is created only on the last step; passwords are never stored on leads.
import {randomBytes,createHash} from 'node:crypto';
import {equipmentTypes} from './fleet.js';

const sha=v=>createHash('sha256').update(v).digest('hex');
export const onboardingSteps=['contact','company','fleet','work','account'];
export const onboardingOptions={
 role:['fleet','owner_operator','dispatch_service','broker'],
 fleetSize:['1','2-5','6-20','21-50','50+'],
 equipment:equipmentTypes,
 loadBoards:['DAT','Truckstop','123Loadboard','Direct brokers','Other'],
 eld:['samsara','motive','other','none'],
 goals:['find_loads','profit','team','brokers','documents']
};
const text=(v,max)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
const pick=(v,list)=>list.includes(v)?v:null;
const pickMany=(v,list)=>Array.isArray(v)&&v.length&&v.length<=list.length&&v.every(x=>list.includes(x))?[...new Set(v)]:null;

export function installOnboardingTables(raw){
 raw.exec(`CREATE TABLE IF NOT EXISTS signup_leads(id TEXT PRIMARY KEY,email TEXT,name TEXT,data TEXT NOT NULL DEFAULT '{}',step INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'in_progress',source TEXT NOT NULL DEFAULT '',lang TEXT NOT NULL DEFAULT '',company_id TEXT,user_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT);
 CREATE TABLE IF NOT EXISTS signup_events(id INTEGER PRIMARY KEY AUTOINCREMENT,lead_id TEXT NOT NULL REFERENCES signup_leads(id),event TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS signup_events_lead ON signup_events(lead_id,created_at);`);
}

export function installOnboarding(app,db,{enabled,onAppHost,limited,fail,createAccount,startSession,cleanName,validEmail,validPassword}){
 const raw=db.raw;installOnboardingTables(raw);
 const now=()=>new Date().toISOString();
 const event=(id,name)=>raw.prepare('INSERT INTO signup_events(lead_id,event,created_at) VALUES(?,?,?)').run(id,name,now());
 const leadOf=token=>typeof token==='string'&&token.length>=20&&token.length<=100?raw.prepare("SELECT * FROM signup_leads WHERE id=?").get(sha(token)):null;
 const emailTaken=email=>!!raw.prepare('SELECT id FROM users WHERE email=?').get(email);
 const view=l=>({step:l.step,status:l.status,data:JSON.parse(l.data),options:onboardingOptions});
 // Answers of one step, validated; an Error carries the message shown under the form.
 const validateStep=(step,b={})=>{
  if(step==='contact'){const name=cleanName(b.name),phone=text(b.phone??'',40);if(!name||!validEmail(b.email)||phone===null)throw Error('Укажите имя и рабочий email');if(emailTaken(b.email.trim()))throw Object.assign(Error('Аккаунт с таким email уже есть. Войдите в кабинет.'),{status:409});return {name,email:b.email.trim(),phone}}
  if(step==='company'){const company=cleanName(b.company),role=pick(b.role,onboardingOptions.role),mc=text(b.mc??'',12),city=text(b.city??'',100);if(!company||!role)throw Error('Укажите название компании и чем вы занимаетесь');if(mc===null||mc&&!/^\d{1,10}$/.test(mc.replace(/^MC-?/i,'')))throw Error('MC или DOT: только цифры');if(city===null)throw Error('Проверьте город');return {company,role,mc:mc.replace(/^MC-?/i,''),city}}
  if(step==='fleet'){const fleetSize=pick(b.fleetSize,onboardingOptions.fleetSize),equipment=pickMany(b.equipment,onboardingOptions.equipment);if(!fleetSize||!equipment)throw Error('Выберите размер автопарка и типы техники');return {fleetSize,equipment}}
  if(step==='work'){const loadBoards=pickMany(b.loadBoards,onboardingOptions.loadBoards),eld=pick(b.eld,onboardingOptions.eld),goals=pickMany(b.goals,onboardingOptions.goals);if(!loadBoards||!eld||!goals)throw Error('Отметьте источники грузов, ELD и хотя бы одну цель');return {loadBoards,eld,goals}}
  throw Error('Неизвестный шаг');
 };
 const guard=(req,res)=>{if(!enabled||!onAppHost(req)){res.status(404).json({error:'Регистрация недоступна'});return false}return true};

 app.post('/api/onboarding',(req,res)=>{
  if(!guard(req,res))return;const key='onboarding|'+req.ip;if(limited(key,30,3600000))return res.status(429).json({error:'Слишком много регистраций. Попробуйте через час.'});fail(key);
  const token=randomBytes(24).toString('base64url'),id=sha(token),t=now();
  raw.prepare('INSERT INTO signup_leads(id,source,lang,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,text(req.body?.source??'',200)??'',text(req.body?.lang??'',8)??'',t,t);
  event(id,'started');res.status(201).json({token,...view(raw.prepare('SELECT * FROM signup_leads WHERE id=?').get(id))});
 });
 app.get('/api/onboarding/:token',(req,res)=>{if(!guard(req,res))return;const l=leadOf(req.params.token);if(!l||l.status!=='in_progress')return res.status(404).json({error:'Регистрация не найдена'});res.json(view(l))});
 app.put('/api/onboarding/:token/:step',(req,res)=>{
  if(!guard(req,res))return;const l=leadOf(req.params.token);if(!l||l.status!=='in_progress')return res.status(404).json({error:'Регистрация не найдена'});
  const index=onboardingSteps.indexOf(req.params.step);if(index<0||index>=onboardingSteps.length-1)return res.status(404).json({error:'Неизвестный шаг'});
  if(index>l.step)return res.status(409).json({error:'Сначала заполните предыдущий шаг'});
  let answers;try{answers=validateStep(req.params.step,req.body??{})}catch(e){return res.status(e.status||400).json({error:e.message})}
  const data={...JSON.parse(l.data),[req.params.step]:answers},step=Math.max(l.step,index+1);
  raw.prepare('UPDATE signup_leads SET data=?,step=?,email=COALESCE(?,email),name=COALESCE(?,name),updated_at=? WHERE id=?').run(JSON.stringify(data),step,answers.email??null,answers.name??null,now(),l.id);
  event(l.id,`${req.params.step}_completed`);res.json(view(raw.prepare('SELECT * FROM signup_leads WHERE id=?').get(l.id)));
 });
 app.post('/api/onboarding/:token/complete',(req,res)=>{
  if(!guard(req,res))return;const l=leadOf(req.params.token);if(!l||l.status!=='in_progress')return res.status(404).json({error:'Регистрация не найдена'});
  if(l.step<onboardingSteps.length-1)return res.status(409).json({error:'Сначала заполните предыдущий шаг'});
  const {password,demo=true}=req.body??{};if(!validPassword(password)||typeof demo!=='boolean')return res.status(400).json({error:'Пароль: от 8 символов'});
  const key='signup|'+req.ip;if(limited(key,5,3600000))return res.status(429).json({error:'Слишком много регистраций. Попробуйте через час.'});
  const d=JSON.parse(l.data);if(emailTaken(d.contact.email))return res.status(409).json({error:'Аккаунт с таким email уже есть. Войдите в кабинет.'});
  fail(key);const {userId,companyId}=createAccount({name:d.contact.name,email:d.contact.email,phone:d.contact.phone,company:d.company.company,city:d.company.city,password,demo});
  const t=now();raw.prepare("UPDATE signup_leads SET status='completed',step=?,company_id=?,user_id=?,data=?,updated_at=?,completed_at=? WHERE id=?").run(onboardingSteps.length,companyId,userId,JSON.stringify({...d,account:{demo}}),t,t,l.id);
  event(l.id,'account_created');startSession(res,req,userId,companyId);res.status(201).json({ok:true});
 });
}

// Funnel for the platform owner: how many sign-ups reached each step.
export function onboardingFunnel(raw,{days=30}={}){
 installOnboardingTables(raw);
 const since=new Date(Date.now()-days*86400000).toISOString();
 const started=raw.prepare('SELECT count(*) n FROM signup_leads WHERE created_at>=?').get(since).n;
 const steps=onboardingSteps.map((name,i)=>({name,reached:raw.prepare('SELECT count(*) n FROM signup_leads WHERE created_at>=? AND step>=?').get(since,i+1).n}));
 const unfinished=raw.prepare("SELECT email,name,step,source,updated_at FROM signup_leads WHERE created_at>=? AND status='in_progress' AND step>0 ORDER BY updated_at DESC LIMIT 20").all(since);
 return {days,started,steps,unfinished};
}
