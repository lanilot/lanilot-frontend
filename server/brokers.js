// Broker / carrier registry: factoring approval, FreightGuard reports and the company's own DNU list.
// The factoring lookup is a demo provider until a factoring company API is connected (see factoring.js).
import {activeFactoring,checkFactoring,lookupFmcsa,parseIdentifiers,factoringPresets} from './factoring.js';
import {env,errorText} from './providers.js';
export const factoringProvider='Demo Factoring';
export const factoringStatuses=['approved','unknown','declined'];
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function installBrokers(db){
 db.exec(`CREATE TABLE IF NOT EXISTS brokers(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('broker','carrier')),name TEXT NOT NULL,mc TEXT NOT NULL DEFAULT '',dot TEXT NOT NULL DEFAULT '',factoring TEXT NOT NULL DEFAULT 'unknown',credit_limit REAL,days_to_pay INTEGER,authority TEXT NOT NULL DEFAULT 'unknown',freightguard INTEGER NOT NULL DEFAULT 0,freightguard_note TEXT NOT NULL DEFAULT '',dnu INTEGER NOT NULL DEFAULT 0,dnu_reason TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',demo INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS broker_name ON brokers(type,lower(name));
 CREATE TABLE IF NOT EXISTS broker_checks(id TEXT PRIMARY KEY,query TEXT NOT NULL,type TEXT NOT NULL,broker_id TEXT REFERENCES brokers(id),created_at TEXT NOT NULL);`);
}
export function seedBrokers(db){
 const now=new Date().toISOString();
 const insert=db.prepare('INSERT OR IGNORE INTO brokers(id,type,name,mc,dot,factoring,credit_limit,days_to_pay,authority,freightguard,freightguard_note,dnu,dnu_reason,notes,demo,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)');
 // Real broker names from the demo board: neutral demo values, no MC/DOT and no negative flags.
 const seen=new Set();
 for(const l of db.prepare('SELECT data FROM loads').all().map(r=>JSON.parse(r.data))){
  if(seen.has(l.broker))continue;seen.add(l.broker);
  const fictional=['Rapid Freight Partners','Midwest Haul Brokers'].includes(l.broker);if(fictional)continue;
  insert.run('brk-'+slug(l.broker),'broker',l.broker,'','',l.factoring,null,null,'unknown',0,'',0,'','',now);
 }
 for(const f of [
  ['broker','Rapid Freight Partners','MC-DEMO-5501','DOT-DEMO-9101','declined',0,62,'active',3,'Неоплата перевозчикам, 3 жалобы за 90 дней (демо)',1,'Двойной брокеридж на прошлом рейсе (демо)'],
  ['broker','Midwest Haul Brokers','MC-DEMO-5502','DOT-DEMO-9102','unknown',null,45,'active',1,'Задержка оплаты 60+ дней (демо)',0,''],
  ['carrier','Blue Ridge Trucking LLC','MC-DEMO-7701','DOT-DEMO-9201','approved',null,null,'active',0,'',0,''],
  ['carrier','Lone Star Haulers','MC-DEMO-7702','DOT-DEMO-9202','declined',null,null,'inactive',2,'Груз не доставлен, повторная передача груза (демо)',1,'Перевозчик передал груз третьей стороне (демо)']
 ])insert.run('brk-'+slug(f[1]),...f,'Демо-запись для проверки сценария.',now);
 if(!db.prepare('SELECT id FROM broker_checks LIMIT 1').get())for(const [i,id] of ['brk-rapid-freight-partners','brk-c-h-robinson'].entries()){const b=db.prepare('SELECT * FROM brokers WHERE id=?').get(id);if(b)db.prepare('INSERT OR IGNORE INTO broker_checks VALUES(?,?,?,?,?)').run('seed-check-'+i,b.name,b.type,b.id,new Date(Date.now()-3600000*(i+2)).toISOString())}
}
const shape=b=>b&&({...b,dnu:!!b.dnu,demo:!!b.demo});
export function listBrokers(db){return db.prepare('SELECT * FROM brokers ORDER BY type,name').all().map(shape)}
export function listBrokerChecks(db){return db.prepare('SELECT c.*,b.name AS broker_name FROM broker_checks c LEFT JOIN brokers b ON b.id=c.broker_id ORDER BY c.created_at DESC LIMIT 12').all()}
export function findBroker(db,query,type){
 const q=query.trim().toLowerCase(),digits=q.replace(/\D/g,'');
 return shape(db.prepare('SELECT * FROM brokers WHERE type=? ORDER BY name').all(type).find(b=>b.name.toLowerCase()===q||b.name.toLowerCase().includes(q)||digits.length>=3&&(b.mc.replace(/\D/g,'').includes(digits)||b.dot.replace(/\D/g,'').includes(digits))))??null;
}
export function registerBrokerRoutes(app,db,context={env:process.env}){
 const text=(v,max)=>v===undefined?'':typeof v==='string'&&v.trim().length<=max?v.trim():null;
 app.post('/api/brokers/check',async(req,res)=>{
  const query=text(req.body?.query,120),type=req.body?.type??'broker';
  if(!query||query.length<2)return res.status(400).json({error:'Введите название, MC или DOT (от 2 символов)'});
  if(!['broker','carrier'].includes(type))return res.status(400).json({error:'Выберите тип проверки'});
  let found=findBroker(db,query,type);const now=new Date().toISOString(),errors=[],ids=parseIdentifiers(query,found);
  // Live sources, when configured on the server: FMCSA (authority, legal name) and the company's factoring API.
  let fmcsa=null;if(env(context,'LANILOT_FMCSA_WEBKEY')&&(ids.mc||ids.dot)){try{fmcsa=await lookupFmcsa(context,ids)}catch(e){errors.push({source:'FMCSA',error:errorText(e)})}}
  const fid=activeFactoring(context);let decision=null;if(fid){try{decision=await checkFactoring(context,fid,{...ids,name:fmcsa?.legalName||ids.name})}catch(e){errors.push({source:factoringPresets[fid].name,error:errorText(e)})}}
  if(!found&&fmcsa?.legalName){const id='brk-'+crypto.randomUUID();db.prepare('INSERT OR IGNORE INTO brokers(id,type,name,mc,dot,updated_at) VALUES(?,?,?,?,?,?)').run(id,type,fmcsa.legalName,ids.mc?'MC-'+ids.mc:'',fmcsa.dotNumber?'DOT-'+fmcsa.dotNumber:'',now);found=shape(db.prepare('SELECT * FROM brokers WHERE type=? AND lower(name)=lower(?)').get(type,fmcsa.legalName))}
  if(found&&(fmcsa||decision)){db.prepare('UPDATE brokers SET mc=?,dot=?,authority=?,factoring=?,credit_limit=?,days_to_pay=?,demo=0,updated_at=? WHERE id=?').run(found.mc||(ids.mc?'MC-'+ids.mc:''),found.dot||(fmcsa?.dotNumber?'DOT-'+fmcsa.dotNumber:''),fmcsa?(type==='broker'?fmcsa.brokerAuthority:fmcsa.carrierAuthority)==='active'?'active':fmcsa.authority:found.authority,decision?.factoring??found.factoring,decision?decision.creditLimit:found.credit_limit,decision?decision.daysToPay:found.days_to_pay,now,found.id);found=shape(db.prepare('SELECT * FROM brokers WHERE id=?').get(found.id))}
  db.prepare('INSERT INTO broker_checks VALUES(?,?,?,?,?)').run(crypto.randomUUID(),query,type,found?.id??null,now);
  res.json({found:!!found,result:found,query,type,provider:fid?factoringPresets[fid].name:factoringProvider,fmcsa,errors,sources:{factoring:fid?'live':'demo',fmcsa:env(context,'LANILOT_FMCSA_WEBKEY')?'live':'off'},checkedAt:now,demo:!fid&&!fmcsa});
 });
 const save=(req,res)=>{
  const editing=req.method==='PUT',old=editing?db.prepare('SELECT * FROM brokers WHERE id=?').get(req.params.id):null;
  if(editing&&!old)return res.status(404).json({error:'Запись не найдена'});
  const b=req.body??{},name=editing?old.name:text(b.name,120),type=editing?old.type:b.type,mc=text(b.mc??old?.mc,30),dot=text(b.dot??old?.dot,30),reason=text(b.dnuReason??old?.dnu_reason,300),notes=text(b.notes??old?.notes,1000);
  if(!name)return res.status(400).json({error:'Укажите название'});
  if(!['broker','carrier'].includes(type))return res.status(400).json({error:'Выберите тип: брокер или перевозчик'});
  if([mc,dot,reason,notes].includes(null))return res.status(400).json({error:'Проверьте поля формы'});
  const dnu=b.dnu===undefined?!!old?.dnu:b.dnu;if(typeof dnu!=='boolean')return res.status(400).json({error:'Укажите статус DNU'});
  if(dnu&&!reason)return res.status(400).json({error:'Укажите причину DNU'});
  const now=new Date().toISOString();
  if(editing)db.prepare('UPDATE brokers SET mc=?,dot=?,dnu=?,dnu_reason=?,notes=?,updated_at=? WHERE id=?').run(mc,dot,Number(dnu),dnu?reason:'',notes,now,old.id);
  else{if(db.prepare('SELECT id FROM brokers WHERE type=? AND lower(name)=lower(?)').get(type,name))return res.status(409).json({error:'Такая запись уже есть'});db.prepare('INSERT INTO brokers(id,type,name,mc,dot,dnu,dnu_reason,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('brk-'+crypto.randomUUID(),type,name,mc,dot,Number(dnu),dnu?reason:'',notes,now)}
  res.status(editing?200:201).json(shape(db.prepare('SELECT * FROM brokers WHERE type=? AND lower(name)=lower(?)').get(type,name)));
 };
 app.post('/api/brokers',save);app.put('/api/brokers/:id',save);
}
