// Back-office departments next to dispatch: fuel (fuel-card transactions, MPG and overuse alerts),
// safety and fleet compliance (expiring documents, inspections, accidents, maintenance),
// broker updates by the updater (after pickup), and the email guard against load-theft scams.
// Fuel-card feeds (WEX, Octane…) and outgoing messages are demo-only until a provider is connected.
const day=86400000;
const isoDate=offset=>new Date(Date.now()+offset*day).toISOString().slice(0,10);
const isoTime=hours=>new Date(Date.now()+hours*3600000).toISOString();

export const TANK_GALLONS=250;
export const updateKinds=['eta','traffic','truck_issue','driver_health','delay','loaded','delivered','other'];
export const updateChannels=['email','teams','telegram'];

export function installOperations(db){
 db.exec(`CREATE TABLE IF NOT EXISTS fuel_transactions(id TEXT PRIMARY KEY,truck TEXT NOT NULL,driver TEXT NOT NULL,provider TEXT NOT NULL,card TEXT NOT NULL,date TEXT NOT NULL,location TEXT NOT NULL,item TEXT NOT NULL,gallons REAL NOT NULL,amount REAL NOT NULL,odometer INTEGER,reviewed_at TEXT);
 CREATE TABLE IF NOT EXISTS safety_documents(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL,subject TEXT NOT NULL,kind TEXT NOT NULL,number TEXT NOT NULL DEFAULT '',expires TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS safety_events(id TEXT PRIMARY KEY,type TEXT NOT NULL,date TEXT NOT NULL,driver TEXT NOT NULL DEFAULT '',truck TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,cost REAL,severity TEXT NOT NULL DEFAULT 'low');
 CREATE TABLE IF NOT EXISTS broker_updates(id TEXT PRIMARY KEY,trip_id TEXT NOT NULL,load_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,channels TEXT NOT NULL,author TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS inbox_emails(id TEXT PRIMARY KEY,sender_name TEXT NOT NULL,sender_email TEXT NOT NULL,reply_to TEXT NOT NULL DEFAULT '',subject TEXT NOT NULL,body TEXT NOT NULL,origin TEXT NOT NULL DEFAULT '',destination TEXT NOT NULL DEFAULT '',miles INTEGER,rate REAL,received_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new');`);
}

export function seedOperations(db){
 const fuel=[
  // truck, driver, provider, card, [days ago, location, item, gallons, $/gal, odometer]
  ['TRK-108','Alex Morgan','WEX','•••• 4417',[[-9,'Joliet, IL','diesel',120,3.79,412000],[-7,'Effingham, IL','diesel',119,3.82,412820],[-5,'Clarksville, TN','diesel',121,3.74,413650],[-3,'Nashville, TN','diesel',122,3.71,414480],[-1,'Gary, IN','diesel',118,3.88,415300]]],
  ['TRK-156','Sam Wilson','Octane','•••• 2290',[[-8,'Atlanta, GA','diesel',110,3.69,288000],[-6,'Greenville, SC','diesel',104,3.72,288700],[-4,'Memphis, TN','diesel',186,3.66,289400],[-3,'Memphis, TN','diesel',95,3.66,289520],[-1,'Charlotte, NC','diesel',101,3.75,290200]]],
  ['TRK-204','Daniel Brooks','WEX','•••• 7781',[[-8,'Chicago, IL','diesel',130,3.86,501000],[-6,'Denver, CO','diesel',128,3.94,501850],[-6,'Denver, CO','reefer',35,3.94,501850],[-4,'Omaha, NE','diesel',127,3.81,502700],[-2,'Des Moines, IA','diesel',129,3.79,503560],[-2,'Des Moines, IA','non_fuel',1,86.4,503560]]],
  ['TRK-302','Michael Davis','Octane','•••• 5012',[[-7,'Dallas, TX','diesel',115,3.61,355000],[-5,'Amarillo, TX','diesel',112,3.68,355780],[-3,'Albuquerque, NM','diesel',265,3.92,356600],[-1,'Phoenix, AZ','diesel',113,3.99,357380]]],
 ];
 for(const [truck,driver,provider,card,rows] of fuel)rows.forEach(([offset,location,item,gallons,price,odometer],i)=>db.prepare('INSERT OR IGNORE INTO fuel_transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)').run(`seed-fuel-${truck}-${i}`,truck,driver,provider,card,isoDate(offset),location,item,gallons,Math.round(gallons*price*100)/100,odometer));

 const now=new Date().toISOString();
 for(const [id,type,subject,kind,number,offset] of [
  ['cdl-108','driver','Alex Morgan','cdl','IL-M4421-0098',410],['med-108','driver','Alex Morgan','medical',"MEC-55102",18],['drug-108','driver','Alex Morgan','drug_test','',160],
  ['cdl-156','driver','Sam Wilson','cdl','GA-0583321',-4],['med-156','driver','Sam Wilson','medical','MEC-77310',240],['mvr-156','driver','Sam Wilson','mvr','',25],
  ['cdl-204','driver','Daniel Brooks','cdl','TX-11930244',680],['med-204','driver','Daniel Brooks','medical','MEC-31877',300],
  ['cdl-302','driver','Michael Davis','cdl','TX-20177611',95],['med-302','driver','Michael Davis','medical','MEC-90021',-12],['drug-302','driver','Michael Davis','drug_test','',12],
  ['insp-108','truck','TRK-108','annual_inspection','',140],['reg-108','truck','TRK-108','registration','IRP 44821',210],
  ['insp-156','truck','TRK-156','annual_inspection','',9],['reg-156','truck','TRK-156','registration','IRP 44822',-2],
  ['insp-204','truck','TRK-204','annual_inspection','',260],['ins-204','truck','TRK-204','insurance','PRG-7713-22',58],
  ['insp-302','truck','TRK-302','annual_inspection','',27],['reg-302','truck','TRK-302','registration','IRP 44825',330],
  ['insp-53a','trailer','TRL-53A','annual_inspection','',-20],['reg-53a','trailer','TRL-53A','registration','IL-TR 9921',190],['insp-53r','trailer','TRL-53R','annual_inspection','',44],
 ])db.prepare('INSERT OR IGNORE INTO safety_documents VALUES(?,?,?,?,?,?,?)').run('seed-doc-'+id,type,subject,kind,number,isoDate(offset),now);

 for(const [id,type,offset,driver,truck,location,title,detail,status,cost,severity] of [
  ['insp-1','inspection',-6,'Alex Morgan','TRK-108','Effingham, IL','Level 2','Clean inspection','closed',null,'low'],
  ['insp-2','inspection',-11,'Sam Wilson','TRK-156','Greenville, SC','Level 1','2 violations','open',null,'medium'],
  ['viol-1','violation',-11,'Sam Wilson','TRK-156','Greenville, SC','393.9(a)','Inoperable lamp','open',null,'low'],
  ['viol-2','violation',-11,'Sam Wilson','TRK-156','Greenville, SC','395.8(e)','False log entry','open',null,'high'],
  ['acc-1','accident',-19,'Michael Davis','TRK-302','Amarillo, TX','Backing incident','Dock, minor damage, no injuries','open',1850,'medium'],
  ['acc-2','accident',-64,'Daniel Brooks','TRK-204','Omaha, NE','Rear-end, struck by other vehicle','Not preventable','closed',0,'low'],
  ['mnt-1','maintenance',3,'','TRK-108','','PM service A','Oil, filters, grease','open',420,'low'],
  ['mnt-2','maintenance',-2,'','TRK-156','','Brake adjustment','From inspection 10/14','open',310,'high'],
  ['mnt-3','maintenance',12,'','TRK-204','','Reefer unit service','Thermo King 2000 h','open',650,'low'],
  ['mnt-4','maintenance',-15,'','TRK-501','Chicago, IL','Transmission repair','In shop','open',4800,'high'],
  ['mnt-5','maintenance',-30,'','TRK-302','','PM service A','Done','closed',395,'low'],
 ])db.prepare('INSERT OR IGNORE INTO safety_events VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('seed-ev-'+id,type,isoDate(offset),driver,truck,location,title,detail,status,cost,severity);

 for(const [id,kind,hours,body,channels] of [
  ['1','loaded',-30,'LD-2046 loaded at 16:40, seal #448120. Reefer set to 34°F. ETA Nashville tomorrow 14:00.','email,teams'],
  ['2','traffic',-9,'Heavy traffic on I-65 S near Louisville (construction). New ETA 15:30, still within the window.','email,telegram'],
 ])db.prepare('INSERT OR IGNORE INTO broker_updates VALUES(?,?,?,?,?,?,?,?)').run('seed-upd-'+id,'seed-trip-LD-2046','LD-2046',kind,body,channels,'Demo',isoTime(hours));

 for(const [id,name,email,replyTo,subject,body,origin,destination,miles,rate,hours] of [
  ['1','C.H. Robinson','loads@chrobinson-freight.com','','URGENT: Chicago → Atlanta, $4,900 — book now','Hi team, we need a truck TODAY. Rate $4,900 all-in. To get the rate confirmation, complete the carrier setup here: https://chrobinson-freight.com/carrier-setup/login and log in with your company email. Reply within 30 minutes.','Chicago, IL','Atlanta, GA',716,4900,-1],
  ['2','TQL Dispatch','tql.dispatch.desk@gmail.com','','Dallas → Houston, quick pay today $1,850','Dry van, 239 miles, $1,850 quick pay. Please verify your carrier packet: https://bit.ly/tql-carrier-verify and send us your email password for the load board sync.','Dallas, TX','Houston, TX',239,1850,-3],
  ['3','Coyote Logistics','ops@coyote.com','coyote.ops@outlook.com','Re: Denver → Kansas City reefer','Rate went up to $2,350. Sign the rate con here: https://docs-sign-secure.net/coyote/rc-55831 and reply to my other address.','Denver, CO','Kansas City, MO',604,2350,-5],
  ['4','Echo Global','carriers@echo.com','','Chicago → Nashville reefer, $1,450','Hi, reefer 36k lbs, pickup tomorrow 08:00–12:00. $1,450 all-in. Let me know your truck location.','Chicago, IL','Nashville, TN',473,1450,-6],
  ['5','C.H. Robinson','dispatch@chrobinson.com','','Chicago → Dallas dry van, $2,450','Dry van, 949 miles, $2,450 all-in. Pickup Monday 07:00. Details in Navisphere: https://www.chrobinson.com/en-us/carriers/','Chicago, IL','Dallas, TX',949,2450,-8],
  ['6','J.B. Hunt','loads@jbhunt.com','','Memphis → St. Louis, $820','Dry van, 284 miles. $820. Confirm by phone or reply here.','Memphis, TN','St. Louis, MO',284,820,-26],
 ])db.prepare("INSERT OR IGNORE INTO inbox_emails VALUES(?,?,?,?,?,?,?,?,?,?,?,'new')").run('seed-mail-'+id,name,email,replyTo,subject,body,origin,destination,miles,rate,isoTime(hours));
}

// --- Fuel: per-fill overuse against the miles driven since the previous fill, and fleet MPG per truck.
export function fuelState(db,targetMpg){
 const rows=db.prepare('SELECT * FROM fuel_transactions ORDER BY truck,odometer,date,id').all();
 const byTruck=new Map();for(const r of rows){if(!byTruck.has(r.truck))byTruck.set(r.truck,[]);byTruck.get(r.truck).push(r)}
 const transactions=[],trucks=[];
 for(const [truck,list] of byTruck){
  const diesel=list.filter(r=>r.item==='diesel');let previous=null;
  for(const r of list){
   const flags=[];let expected=null,over=null;
   if(r.item==='non_fuel')flags.push('non_fuel');
   if(r.item==='diesel'){
    if(r.gallons>TANK_GALLONS)flags.push('tank');
    if(previous&&r.odometer>=previous.odometer){expected=(r.odometer-previous.odometer)/targetMpg;over=r.gallons-expected;if(r.gallons>expected*1.2+15)flags.push('overuse')}
    previous=r;
   }
   transactions.push({...r,expected:expected===null?null:Math.round(expected),over:over===null?null:Math.round(over),flags,reviewed:!!r.reviewed_at});
  }
  // The first fill only tops the tank up: MPG counts the fuel bought after it against the miles since it.
  const miles=diesel.length>1?diesel.at(-1).odometer-diesel[0].odometer:0,used=diesel.slice(1),gallons=used.reduce((s,r)=>s+r.gallons,0),cost=used.reduce((s,r)=>s+r.amount,0);
  const all=list.reduce((s,r)=>s+r.amount,0),mpg=gallons?miles/gallons:null;
  trucks.push({truck,driver:list.at(-1).driver,provider:list.at(-1).provider,card:list.at(-1).card,miles,gallons:Math.round(gallons),mpg:mpg&&Math.round(mpg*100)/100,costPerMile:miles?Math.round(cost/miles*1000)/1000:null,spend:Math.round(all*100)/100,low:!!mpg&&mpg<targetMpg*0.85});
 }
 transactions.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return {targetMpg,tankGallons:TANK_GALLONS,trucks,transactions};
}

// --- Safety: document expirations (expired / due within 30 days) and events.
export function safetyState(db){
 const today=new Date().toISOString().slice(0,10);
 const documents=db.prepare('SELECT * FROM safety_documents ORDER BY expires,id').all().map(d=>{const days=Math.round((Date.parse(d.expires)-Date.parse(today))/day);return {...d,days,state:days<0?'expired':days<=30?'soon':'ok'}});
 return {documents,events:db.prepare('SELECT * FROM safety_events ORDER BY date DESC,id').all()};
}

// --- Email guard: scores each broker email; links are never rendered as links.
const FREE_MAIL=['gmail.com','yahoo.com','outlook.com','hotmail.com','aol.com','proton.me','protonmail.com','icloud.com','mail.com'];
const BROKER_DOMAINS={'chrobinson.com':'C.H. Robinson','tql.com':'TQL','coyote.com':'Coyote Logistics','echo.com':'Echo Global','jbhunt.com':'J.B. Hunt','arrivelogistics.com':'Arrive Logistics','uberfreight.com':'Uber Freight','schneider.com':'Schneider','rxo.com':'RXO','landstar.com':'Landstar'};
const PRESSURE=/\b(urgent|immediately|asap|within \d+ minutes|log ?in|password|verify|quick pay today|wire)\b/i;
const domainOf=email=>String(email).split('@')[1]?.toLowerCase()??'';
const baseDomain=d=>d.split('.').slice(-2).join('.');
function distance(a,b){const m=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)m[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length]}
export const linkPattern=/\bhttps?:\/\/[^\s<>"')]+/gi;
export function scoreEmail(e,marketRpm){
 const reasons=[],domain=domainOf(e.sender_email),base=baseDomain(domain),name=e.sender_name.toLowerCase();let score=0;
 const letters=v=>v.toLowerCase().replace(/[^a-z]/g,''),claimed=Object.values(BROKER_DOMAINS).find(n=>letters(name).includes(letters(n)));
 if(FREE_MAIL.includes(base)){score+=35;reasons.push({code:'free_mail',value:domain})}
 else if(!BROKER_DOMAINS[base]){const own=base.split('.')[0],near=Object.keys(BROKER_DOMAINS).find(d=>{const n=d.split('.')[0];return n.length>=5&&(distance(n,own)<=2||own.includes(n))});if(near){score+=40;reasons.push({code:'lookalike',value:near})}}
 if(claimed&&BROKER_DOMAINS[base]&&BROKER_DOMAINS[base]!==claimed){score+=25;reasons.push({code:'name_mismatch',value:domain})}
 if(e.reply_to&&baseDomain(domainOf(e.reply_to))!==base){score+=25;reasons.push({code:'reply_to',value:e.reply_to})}
 const rpm=e.rate&&e.miles?e.rate/e.miles:null;
 if(rpm&&marketRpm){const above=Math.round((rpm/marketRpm-1)*100);if(above>=35){score+=above>=80?35:25;reasons.push({code:'high_rate',value:above})}}
 const links=(e.body.match(linkPattern)||[]).map(u=>{try{return new URL(u).hostname}catch{return u}});
 const foreign=links.filter(h=>baseDomain(h)!==base);
 if(foreign.length){score+=20;reasons.push({code:'foreign_link',value:foreign.join(', ')})}
 if(PRESSURE.test(e.subject+' '+e.body)){score+=15;reasons.push({code:'pressure'})}
 const risk=score>=60?'high':score>=30?'medium':'low';
 return {score:Math.min(score,100),risk,reasons,rpm:rpm&&Math.round(rpm*100)/100,links:links.length};
}
export function inboxState(db,loads){
 const rpms=loads.map(l=>l.rate/(l.miles||1)).filter(Number.isFinite).sort((a,b)=>a-b),marketRpm=rpms.length?rpms[Math.floor(rpms.length/2)]:null;
 return {marketRpm:marketRpm&&Math.round(marketRpm*100)/100,emails:db.prepare('SELECT * FROM inbox_emails ORDER BY received_at DESC,id').all().map(e=>({...e,...scoreEmail(e,marketRpm)}))};
}

export function registerOperationRoutes(app,db,{session=()=>null}={}){
 app.patch('/api/fuel/:id',(req,res)=>{
  if(!db.prepare('SELECT id FROM fuel_transactions WHERE id=?').get(req.params.id))return res.status(404).json({error:'Операция не найдена'});
  db.prepare('UPDATE fuel_transactions SET reviewed_at=? WHERE id=?').run(req.body?.reviewed===false?null:new Date().toISOString(),req.params.id);res.json({ok:true});
 });
 app.patch('/api/safety/documents/:id',(req,res)=>{
  const {expires}=req.body??{};if(!db.prepare('SELECT id FROM safety_documents WHERE id=?').get(req.params.id))return res.status(404).json({error:'Документ не найден'});
  if(typeof expires!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(expires)||Number.isNaN(Date.parse(expires)))return res.status(400).json({error:'Укажите дату окончания'});
  db.prepare('UPDATE safety_documents SET expires=?,updated_at=? WHERE id=?').run(expires,new Date().toISOString(),req.params.id);res.json({ok:true});
 });
 app.patch('/api/safety/events/:id',(req,res)=>{
  const {status}=req.body??{};if(!db.prepare('SELECT id FROM safety_events WHERE id=?').get(req.params.id))return res.status(404).json({error:'Запись не найдена'});
  if(!['open','closed'].includes(status))return res.status(400).json({error:'Некорректный статус'});
  db.prepare('UPDATE safety_events SET status=? WHERE id=?').run(status,req.params.id);res.json({ok:true});
 });
 // Demo: the update is recorded in the load's history; email, Teams and Telegram delivery is not connected yet.
 app.post('/api/updates',(req,res)=>{
  const {tripId,kind,body,channels}=req.body??{},trip=db.prepare('SELECT * FROM trips WHERE id=?').get(tripId??'');
  if(!trip)return res.status(404).json({error:'Рейс не найден'});
  if(!updateKinds.includes(kind))return res.status(400).json({error:'Выберите тип обновления'});
  if(typeof body!=='string'||body.trim().length<5||body.trim().length>2000)return res.status(400).json({error:'Текст обновления: от 5 до 2000 символов'});
  if(!Array.isArray(channels)||!channels.length||channels.some(c=>!updateChannels.includes(c)))return res.status(400).json({error:'Выберите хотя бы один канал'});
  const id=crypto.randomUUID();db.prepare('INSERT INTO broker_updates VALUES(?,?,?,?,?,?,?,?)').run(id,trip.id,trip.load_id,kind,body.trim(),[...new Set(channels)].join(','),session(req)?.name??'',new Date().toISOString());
  res.status(201).json({id});
 });
 app.patch('/api/inbox/:id',(req,res)=>{
  const {status}=req.body??{};if(!db.prepare('SELECT id FROM inbox_emails WHERE id=?').get(req.params.id))return res.status(404).json({error:'Письмо не найдено'});
  if(!['new','safe','blocked'].includes(status))return res.status(400).json({error:'Некорректный статус'});
  db.prepare('UPDATE inbox_emails SET status=? WHERE id=?').run(status,req.params.id);res.json({ok:true});
 });
}
export const listBrokerUpdates=db=>db.prepare('SELECT * FROM broker_updates ORDER BY created_at DESC,id').all().map(u=>({...u,channels:u.channels.split(',')}));
