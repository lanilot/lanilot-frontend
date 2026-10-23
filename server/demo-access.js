// "Get demo access" from the landing: every visitor gets a personal sandbox company with sample data,
// opened through a one-time link token (?access_demo_token=…) without a password. Sandboxes expire after SANDBOX_DAYS.
import {randomBytes,createHash} from 'node:crypto';

export const SANDBOX_DAYS=7,TOKEN_MINUTES=30;
const sha=v=>createHash('sha256').update(v).digest('hex');
const FLEET=['1','2-5','6-20','21-50','50+'];

export function installDemoAccess(app,db,{enabled,limited,fail,createAccount,startSession,onAppHost}){
 const raw=db.raw;
 raw.exec('CREATE TABLE IF NOT EXISTS demo_access_tokens(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,user_id TEXT NOT NULL,request_id TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT)');
 const cols=t=>raw.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name);
 if(!cols('companies').includes('sandbox'))raw.exec('ALTER TABLE companies ADD COLUMN sandbox INTEGER NOT NULL DEFAULT 0');
 if(cols('demo_requests').length){for(const [c,def] of [['kind',"TEXT NOT NULL DEFAULT 'demo'"],['company_id','TEXT']])if(!cols('demo_requests').includes(c))raw.exec(`ALTER TABLE demo_requests ADD COLUMN ${c} ${def}`)}

 // Landing form (proxied same-origin on the landing host): saves the request, creates the sandbox, returns the link token.
 app.post('/api/public/demo-access',(req,res)=>{
  if(!enabled)return res.status(404).json({error:'Not available'});
  const b=req.body??{},text=(v,max)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
  if(b.website)return res.status(201).json({ok:true}); // honeypot: bots fill hidden fields
  const key='demo-access|'+req.ip;if(limited(key,5,3600000))return res.status(429).json({error:'Too many requests. Please try again later.'});
  const r={name:text(b.name,100),email:text(b.email,160),company:text(b.company,120),phone:text(b.phone??'',40),fleetSize:text(b.fleetSize??'',10),message:text(b.message??'',1000),source:text(b.source??'',200)??'',lang:text(b.lang??'',8)??''};
  if(!r.name||!r.company||!r.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)||r.phone===null||r.message===null||r.fleetSize===null||r.fleetSize&&!FLEET.includes(r.fleetSize))return res.status(400).json({error:'Please enter your name, company and a valid work email.'});
  fail(key);
  const hex=randomBytes(5).toString('hex'),now=new Date(),ends=new Date(now.getTime()+SANDBOX_DAYS*86400000).toISOString();
  // The sandbox user has an internal address; the visitor's real email stays on the request and the company profile.
  const {userId,companyId}=createAccount({name:r.name,company:r.company,email:`sandbox-${hex}@sandbox.lanilot.invalid`,password:randomBytes(24).toString('base64url'),demo:true,phone:r.phone,slug:'demo-'+hex,profile:{email:r.email}});
  raw.prepare('UPDATE companies SET sandbox=1,trial_ends_at=? WHERE id=?').run(ends,companyId);
  const requestId='dr-'+randomBytes(8).toString('hex'),t=now.toISOString();
  raw.prepare('INSERT INTO demo_requests(id,name,email,company,phone,fleet_size,message,source,lang,created_at,updated_at,kind,company_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(requestId,r.name,r.email,r.company,r.phone,r.fleetSize,r.message,r.source,r.lang,t,t,'demo_access',companyId);
  const token=randomBytes(24).toString('base64url');
  raw.prepare('INSERT INTO demo_access_tokens VALUES(?,?,?,?,?,?,NULL)').run(sha(token),companyId,userId,requestId,t,new Date(now.getTime()+TOKEN_MINUTES*60000).toISOString());
  res.status(201).json({token,expiresAt:ends});
 });
 // The app exchanges the link token for a session in the sandbox (once).
 app.post('/api/auth/demo-access',(req,res)=>{
  if(!enabled||!onAppHost(req))return res.status(404).json({error:'Ссылка демо-доступа недействительна или уже использована'});
  const {token}=req.body??{},row=typeof token==='string'&&token.length<=100&&raw.prepare('SELECT * FROM demo_access_tokens WHERE id=?').get(sha(token));
  if(!row||row.used_at||row.expires_at<new Date().toISOString())return res.status(404).json({error:'Ссылка демо-доступа недействительна или уже использована'});
  const used=raw.prepare('UPDATE demo_access_tokens SET used_at=? WHERE id=? AND used_at IS NULL').run(new Date().toISOString(),row.id);
  if(!Number(used.changes))return res.status(404).json({error:'Ссылка демо-доступа недействительна или уже использована'});
  startSession(res,req,row.user_id,row.company_id);res.json({ok:true});
 });
}
