import {installTelegram} from './telegram.js';
import {installIntegrations,seedIntegrations,listIntegrations,registerIntegrationRoutes} from './integrations.js';
import {installFinances,seedFinances,registerFinanceRoutes,listFinances,paymentStatuses} from './finances.js';
import {installAttachments,seedAttachments,registerAttachmentRoutes,attachmentState} from './attachments.js';
import {installDocuments,seedDocuments,registerDocumentRoutes,documentMetadata,documentKinds} from './documents.js';
import {installRadar,seedRadars,listRadars,registerRadarRoutes} from './radar.js';
import {installFleet,registerFleetRoutes,assignmentAvailabilityError,equipmentTypes,driverAvailability,truckAvailability} from './fleet.js';
import {defaultSettings,validateSettings,timezones} from './settings.js';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {calculateProfit,defaultCosts,canTransition,brokerDraft} from './domain.js';
import {seedDemoData,seedMissingLoads} from './demo-seed.js';
import {locations} from './locations.js';
import {installBrokers,seedBrokers,listBrokers,listBrokerChecks,registerBrokerRoutes,factoringProvider} from './brokers.js';
import {installLanes,seedLanes,listLanes,registerLaneRoutes} from './lanes.js';
import {registerEldRoutes,eldProvider} from './eld.js';
import {installProviderStatus} from './providers.js';
import {listProviders,registerProviderRoutes,activeFactoring,factoringPresets} from './factoring.js';

export function createApp(dbPath=':memory:',{seedDemo=true,integrationOptions={},telegramOptions={}}={}){
 const db=new DatabaseSync(dbPath);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS loads(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS offers(id TEXT PRIMARY KEY,load_id TEXT NOT NULL REFERENCES loads(id),rate REAL NOT NULL,status TEXT NOT NULL,draft TEXT NOT NULL,costs TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS active_offer ON offers(load_id) WHERE status IN ('draft','awaiting','accepted');
 CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY,offer_id TEXT UNIQUE NOT NULL REFERENCES offers(id),load_id TEXT UNIQUE NOT NULL REFERENCES loads(id),status TEXT NOT NULL,driver TEXT NOT NULL,truck TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,load_id TEXT NOT NULL REFERENCES loads(id),offer_id TEXT REFERENCES offers(id),sender TEXT NOT NULL CHECK(sender IN ('dispatcher','broker')),body TEXT NOT NULL,client_key TEXT UNIQUE,created_at TEXT NOT NULL,read_at TEXT);
 CREATE INDEX IF NOT EXISTS thread_messages ON messages(load_id,created_at);`);
 for(const column of ['pickup','delivery','cancellation_reason','cancelled_at','restored_at'])if(!db.prepare('PRAGMA table_info(trips)').all().some(c=>c.name===column))db.exec(`ALTER TABLE trips ADD COLUMN ${column} TEXT`);
 db.exec(`CREATE TABLE IF NOT EXISTS drivers(id TEXT PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE IF NOT EXISTS trucks(id TEXT PRIMARY KEY,equipment TEXT NOT NULL);`);
 installFleet(db);
 db.exec(`CREATE TABLE IF NOT EXISTS trip_history(id TEXT PRIMARY KEY,trip_id TEXT NOT NULL REFERENCES trips(id),action TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,created_at TEXT NOT NULL);`);
 db.exec(`CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,data TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run('workspace',JSON.stringify(defaultSettings));
 const readSettings=()=>JSON.parse(db.prepare("SELECT data FROM settings WHERE id='workspace'").get().data);
 {const s=readSettings();if(s.costs?.driverPerMile===0.65){s.costs.driverPerMile=defaultCosts.driverPerMile;db.prepare("UPDATE settings SET data=? WHERE id='workspace'").run(JSON.stringify(s))}}
 const integrationVault=installIntegrations(db,dbPath,integrationOptions);installFinances(db);installDocuments(db);installAttachments(db);
 installRadar(db);installBrokers(db);installProviderStatus(db);installLanes(db);
 const telegram=installTelegram(db,dbPath,telegramOptions);
 seedMissingLoads(db);
 if(seedDemo){seedDemoData(db);seedRadars(db);seedBrokers(db);seedLanes(db);seedDocuments(db);seedAttachments(db);seedFinances(db);seedIntegrations(db,integrationVault);telegram.seed()}
 const app=express();app.use((req,res,next)=>req.path.endsWith('/attachments')?next():express.json({limit:'100kb'})(req,res,next));telegram.register(app);registerIntegrationRoutes(app,db,integrationVault);registerFleetRoutes(app,db);registerRadarRoutes(app,db);registerFinanceRoutes(app,db);registerDocumentRoutes(app,db);registerAttachmentRoutes(app,db);registerBrokerRoutes(app,db,integrationVault);registerProviderRoutes(app,db,integrationVault);registerLaneRoutes(app,db);registerEldRoutes(app,db,integrationVault);
 const enrichLoad=l=>({...l,originCoordinates:locations[l.origin]??null,destinationCoordinates:locations[l.destination]??null});
 const loadById=id=>{const r=db.prepare('SELECT data FROM loads WHERE id=?').get(id);return r?enrichLoad(JSON.parse(r.data)):null};
 const offerById=id=>db.prepare('SELECT * FROM offers WHERE id=?').get(id);
 const enrichedOffer=o=>({...o,costs:JSON.parse(o.costs),load:loadById(o.load_id)});
 const findMessageKey=(key,loadId,res,sender,body)=>{const msg=db.prepare('SELECT * FROM messages WHERE client_key=?').get(key);if(msg){const matches=msg.load_id===loadId&&msg.sender===sender&&(body===undefined||msg.body===body);res.status(matches?200:409).json(matches?msg:{error:'Ключ сообщения уже использован с другими данными'});return true}return false};
 app.put('/api/settings',(req,res,next)=>{try{const settings=validateSettings(req.body);db.prepare("UPDATE settings SET data=? WHERE id='workspace'").run(JSON.stringify(settings));res.json(settings)}catch(e){next(e)}});
 app.get('/api/state' ,(req,res)=>res.json({providers:listProviders(db,integrationVault),brokers:listBrokers(db),brokerChecks:listBrokerChecks(db),factoringProvider:activeFactoring(integrationVault)?factoringPresets[activeFactoring(integrationVault)].name:factoringProvider,lanes:listLanes(db),eldProvider,telegram:telegram.state(),integrations:listIntegrations(db,integrationVault),finances:listFinances(db),paymentStatuses,attachments:attachmentState(db),documents:db.prepare(`SELECT ${documentMetadata} FROM documents ORDER BY created_at DESC,id`).all(),documentKinds,radars:listRadars(db,db.prepare('SELECT data FROM loads').all().map(r=>JSON.parse(r.data))),loads:db.prepare('SELECT data FROM loads').all().map(r=>enrichLoad(JSON.parse(r.data))),offers:db.prepare('SELECT * FROM offers ORDER BY created_at DESC').all().map(enrichedOffer),drivers:db.prepare('SELECT * FROM drivers').all(),trucks:db.prepare('SELECT * FROM trucks').all(),trips:db.prepare('SELECT * FROM trips ORDER BY created_at DESC').all().map(t=>({...t,history:db.prepare('SELECT * FROM trip_history WHERE trip_id=? ORDER BY created_at,id').all(t.id),pickup:t.pickup||loadById(t.load_id).pickup,delivery:t.delivery||loadById(t.load_id).delivery,load:{...loadById(t.load_id),pickup:t.pickup||loadById(t.load_id).pickup,delivery:t.delivery||loadById(t.load_id).delivery},offer:enrichedOffer(offerById(t.offer_id))})),messages:db.prepare('SELECT * FROM messages ORDER BY created_at,id').all(),equipmentTypes,driverAvailability,truckAvailability,defaultCosts:readSettings().costs,settings:readSettings(),timezones,demo:true}));
 app.get('/api/loads/:id/route',(req,res)=>{
  const l=loadById(req.params.id);if(!l)return res.status(404).json({error:'Груз не найден'});
  const file=new URL('./routes.json',import.meta.url);const cache=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
  const route=cache[l.id];
  if(route&&route.origin===l.origin&&route.destination===l.destination)return res.json({...route,kind:'road',truckValidated:false});
  if(!l.originCoordinates||!l.destinationCoordinates)return res.status(404).json({error:'Координаты маршрута недоступны'});
  res.json({kind:'direct',origin:l.origin,destination:l.destination,originCoordinates:l.originCoordinates,destinationCoordinates:l.destinationCoordinates,geometry:{type:'LineString',coordinates:[l.originCoordinates,l.destinationCoordinates]},source:'Города погрузки и доставки',truckValidated:false});
 });
 app.post('/api/loads/:id/messages',(req,res)=>{
  const l=loadById(req.params.id);if(!l)return res.status(404).json({error:'Груз не найден'});
  const {body,clientId}=req.body??{};
  if(typeof body!=='string'||!body.trim()||body.trim().length>5000)return res.status(400).json({error:'Сообщение должно содержать от 1 до 5000 символов'});
  if(typeof clientId!=='string'||clientId.length<8||clientId.length>100)return res.status(400).json({error:'Некорректный ключ сообщения'});
  if(findMessageKey(clientId,l.id,res,'dispatcher',body.trim()))return;
  const offer=db.prepare("SELECT id FROM offers WHERE load_id=? AND status IN ('draft','awaiting','accepted') ORDER BY created_at DESC LIMIT 1").get(l.id);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(id,l.id,offer?.id??null,'dispatcher',body.trim(),clientId,now,now);
  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id=?').get(id));
 });
 app.post('/api/loads/:id/demo-reply',(req,res)=>{
  const l=loadById(req.params.id);if(!l)return res.status(404).json({error:'Груз не найден'});
  const {clientId}=req.body??{};
  if(typeof clientId!=='string'||clientId.length<8||clientId.length>100)return res.status(400).json({error:'Некорректный ключ сообщения'});
  if(findMessageKey(clientId,l.id,res,'broker'))return;
  const last=db.prepare("SELECT id FROM messages WHERE load_id=? AND sender='dispatcher' ORDER BY created_at DESC LIMIT 1").get(l.id);
  if(!last)return res.status(409).json({error:'Сначала напишите брокеру'});
  const count=db.prepare("SELECT count(*) AS n FROM messages WHERE load_id=? AND sender='broker'").get(l.id).n;
  const confirmed=db.prepare("SELECT rate FROM offers WHERE load_id=? AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(l.id);
  const replies=confirmed?[`Your booking is confirmed at $${confirmed.rate.toLocaleString('en-US')} all-in. The pickup appointment remains ${l.window}. Please share your driver's ETA.`,`Thanks for checking. The appointment details have not changed. Please contact us if your ETA changes.`,`Our team has received your update. Please send the signed documents after delivery.`]:[`Thanks for the update. The ${l.equipment} load is still available. Pickup is ${l.window}. Please confirm your truck location and ETA.`,`Our current offer is $${l.rate.toLocaleString('en-US')} all-in. We can review your counteroffer. Please confirm the equipment and pickup time.`,`I have shared your request with our team. We will confirm the final terms before any booking commitment.`];
  const id=crypto.randomUUID();db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(id,l.id,null,'broker',replies[count%replies.length],clientId,new Date().toISOString(),null);
  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id=?').get(id));
 });
 app.post('/api/loads/:id/read',(req,res)=>{
  if(!loadById(req.params.id))return res.status(404).json({error:'Груз не найден'});
  db.prepare("UPDATE messages SET read_at=? WHERE load_id=? AND sender='broker' AND read_at IS NULL").run(new Date().toISOString(),req.params.id);res.json({ok:true});
 });
 app.post('/api/offers',(req,res,next)=>{try{const {loadId,rate,costs=readSettings().costs}=req.body;const l=loadById(loadId);if(!l)return res.status(404).json({error:'Груз не найден'});if(!Number.isFinite(rate)||rate<=0||rate>100000)return res.status(400).json({error:'Ставка должна быть от $0.01 до $100 000'});calculateProfit(rate,l.miles,l.deadhead,costs);if(db.prepare("SELECT id FROM offers WHERE load_id=? AND status IN ('draft','awaiting','accepted')").get(loadId))return res.status(409).json({error:'Для этого груза уже есть активное предложение'});const id=crypto.randomUUID();db.prepare('INSERT INTO offers VALUES(?,?,?,?,?,?,?)').run(id,loadId,rate,'draft',brokerDraft(l,rate),JSON.stringify(costs),new Date().toISOString());res.status(201).json(enrichedOffer(offerById(id)));}catch(e){next(e)}});
 app.patch('/api/offers/:id',(req,res,next)=>{try{const o=offerById(req.params.id);if(!o)return res.status(404).json({error:'Предложение не найдено'});const {status,draft}=req.body;const valid={draft:['awaiting','cancelled'],awaiting:['accepted','rejected','cancelled'],accepted:[],rejected:[],cancelled:[]};if(draft!==undefined&&(o.status!=='draft'||typeof draft!=='string'||draft.trim().length<10||draft.length>10000))return res.status(400).json({error:'Изменять текст можно только у черновика (10–10000 символов)'});if(status&&!valid[o.status].includes(status))return res.status(409).json({error:'Недопустимое изменение статуса'});
  db.exec('BEGIN IMMEDIATE');try{
   db.prepare('UPDATE offers SET status=?,draft=? WHERE id=?').run(status||o.status,draft??o.draft,o.id);
   if(status==='awaiting')db.prepare('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),o.load_id,o.id,'dispatcher',draft??o.draft,`offer-send-${o.id}`,new Date().toISOString(),new Date().toISOString());
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  res.json(enrichedOffer(offerById(o.id)));}catch(e){next(e)}});
 app.post('/api/trips',(req,res,next)=>{try{
  const {offerId,loadId,driver,truck,status='planned'}=req.body;
  let o=offerId?offerById(offerId):db.prepare("SELECT * FROM offers WHERE load_id=? AND status IN ('draft','awaiting','accepted')").get(loadId??'');
  const load=loadById(o?.load_id??loadId);if(!load)return res.status(404).json({error:'Груз не найден'});
  if(offerId&&o?.status!=='accepted')return res.status(409).json({error:'Сначала отметьте подтверждение брокера'});
  if(!['planned','in_transit','delivered','completed'].includes(status))return res.status(400).json({error:'Некорректный статус рейса'});
  if(status!=='planned'&&o?.status!=='accepted')return res.status(409).json({error:'До подтверждения брокера доступно только планирование'});
  if(typeof driver!=='string'||!driver.trim()||driver.length>100||typeof truck!=='string'||!truck.trim()||truck.length>40)return res.status(400).json({error:'Укажите водителя и машину'});
  const pickup=req.body.pickup??load.pickup,delivery=req.body.delivery??load.delivery;
  const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(!validDate(pickup)||!validDate(delivery)||delivery<pickup)return res.status(400).json({error:'Укажите корректные даты: доставка не раньше погрузки'});
  if(db.prepare('SELECT id FROM trips WHERE load_id=?').get(load.id))return res.status(409).json({error:'Рейс уже создан'});
  const unavailable=assignmentAvailabilityError(db,driver,truck,status);if(unavailable)return res.status(409).json({error:unavailable});
  const conflict=['planned','in_transit'].includes(status)&&db.prepare("SELECT * FROM trips WHERE status IN ('planned','in_transit') AND (lower(trim(truck))=lower(?) OR lower(trim(driver))=lower(?))").all(truck.trim(),driver.trim()).some(t=>{const other=loadById(t.load_id);return (t.pickup||other.pickup)<=delivery&&pickup<=(t.delivery||other.delivery)});
  if(conflict)return res.status(409).json({error:'Водитель или машина заняты другим рейсом в эти даты'});
  const id=crypto.randomUUID();db.exec('BEGIN IMMEDIATE');try{
   if(!o){const oid=crypto.randomUUID();db.prepare('INSERT INTO offers VALUES(?,?,?,?,?,?,?)').run(oid,load.id,load.rate,'draft',brokerDraft(load,load.rate),JSON.stringify(readSettings().costs),new Date().toISOString());o=offerById(oid)}
   db.prepare('INSERT INTO trips(id,offer_id,load_id,status,driver,truck,created_at,pickup,delivery) VALUES(?,?,?,?,?,?,?,?,?)').run(id,o.id,load.id,status,driver.trim(),truck.trim(),new Date().toISOString(),pickup,delivery);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}res.status(201).json({id});
 }catch(e){next(e)}});
 app.post('/api/trips/:id/cancel',(req,res)=>{
  const t=db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.id);if(!t)return res.status(404).json({error:'Рейс не найден'});
  if(t.status==='completed')return res.status(409).json({error:'Завершённый рейс нельзя отменить'});
  const {reason,confirmed}=req.body??{};
  if(confirmed!==true)return res.status(400).json({error:'Подтвердите отмену рейса'});
  if(typeof reason!=='string'||reason.trim().length<3||reason.trim().length>1000)return res.status(400).json({error:'Укажите причину отмены (от 3 до 1000 символов)'});
  if(t.status==='cancelled')return res.json({ok:true,id:t.id});
  const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
   db.prepare("UPDATE trips SET status='cancelled',cancellation_reason=?,cancelled_at=?,restored_at=NULL WHERE id=?").run(reason.trim(),now,t.id);
   db.prepare('INSERT INTO trip_history VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),t.id,'cancelled','cancelled',reason.trim(),now);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}res.json({ok:true,id:t.id});
 });
 app.post('/api/trips/:id/restore',(req,res)=>{
  const t=db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.id);if(!t)return res.status(404).json({error:'Рейс не найден'});
  if(t.status!=='cancelled')return res.status(409).json({error:'Восстановить можно только отменённый рейс'});
  const {status,confirmed}=req.body??{};
  if(confirmed!==true)return res.status(400).json({error:'Подтвердите восстановление рейса'});
  if(!['planned','in_transit','delivered','completed'].includes(status))return res.status(400).json({error:'Выберите новый статус рейса'});
  if(status!=='planned'&&offerById(t.offer_id).status!=='accepted')return res.status(409).json({error:'До подтверждения брокера доступно только планирование'});
  const unavailable=assignmentAvailabilityError(db,t.driver,t.truck,status);if(unavailable)return res.status(409).json({error:unavailable});
  const l=loadById(t.load_id),pickup=t.pickup||l.pickup,delivery=t.delivery||l.delivery;
  const conflict=['planned','in_transit'].includes(status)&&db.prepare("SELECT * FROM trips WHERE id<>? AND status IN ('planned','in_transit') AND (lower(trim(truck))=lower(?) OR lower(trim(driver))=lower(?))").all(t.id,t.truck.trim(),t.driver.trim()).some(other=>{const load=loadById(other.load_id);return (other.pickup||load.pickup)<=delivery&&pickup<=(other.delivery||load.delivery)});
  if(conflict)return res.status(409).json({error:'Водитель или машина заняты другим рейсом в эти даты. Проверьте назначения в планировщике.'});
  const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
   if(t.cancelled_at&&!db.prepare("SELECT id FROM trip_history WHERE trip_id=? AND action='cancelled' AND created_at=?").get(t.id,t.cancelled_at))db.prepare('INSERT INTO trip_history VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),t.id,'cancelled','cancelled',t.cancellation_reason,t.cancelled_at);
   db.prepare('UPDATE trips SET status=?,restored_at=? WHERE id=?').run(status,now,t.id);
   db.prepare('INSERT INTO trip_history VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),t.id,'restored',status,null,now);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}res.json({ok:true,id:t.id});
 });
 const updateTrip=(req,res)=>{
  const t=db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.id);if(!t)return res.status(404).json({error:'Рейс не найден'});
  if(t.status==='cancelled')return res.status(409).json({error:'Отменённый рейс нельзя редактировать'});
  const editing=req.method==='PUT',body=req.body??{},status=body.status;
  if(!['planned','in_transit','delivered','completed'].includes(status))return res.status(400).json({error:'Некорректный статус рейса'});
  if(!editing&&!canTransition(t.status,status))return res.status(409).json({error:'Недопустимый переход статуса рейса'});
  if(status!=='planned'&&offerById(t.offer_id).status!=='accepted')return res.status(409).json({error:'Сначала отметьте подтверждение брокера'});
  const load=loadById(t.load_id),driver=editing?body.driver:t.driver,truck=editing?body.truck:t.truck;
  const pickup=editing?body.pickup:(t.pickup||load.pickup),delivery=editing?body.delivery:(t.delivery||load.delivery);
  if(typeof driver!=='string'||!driver.trim()||driver.length>100||typeof truck!=='string'||!truck.trim()||truck.length>40)return res.status(400).json({error:'Укажите водителя и машину'});
  const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(!validDate(pickup)||!validDate(delivery)||delivery<pickup)return res.status(400).json({error:'Укажите корректные даты: доставка не раньше погрузки'});
  const unavailable=assignmentAvailabilityError(db,driver,truck,status);if(unavailable)return res.status(409).json({error:unavailable});
  const conflict=['planned','in_transit'].includes(status)&&db.prepare("SELECT * FROM trips WHERE id<>? AND status IN ('planned','in_transit') AND (lower(trim(truck))=lower(?) OR lower(trim(driver))=lower(?))").all(t.id,truck.trim(),driver.trim()).some(other=>{const l=loadById(other.load_id);return (other.pickup||l.pickup)<=delivery&&pickup<=(other.delivery||l.delivery)});
  if(conflict)return res.status(409).json({error:'Водитель или машина заняты другим рейсом в эти даты'});
  db.prepare('UPDATE trips SET driver=?,truck=?,pickup=?,delivery=?,status=? WHERE id=?').run(driver.trim(),truck.trim(),pickup,delivery,status,t.id);res.json({ok:true,id:t.id});
 };
 app.patch('/api/trips/:id',updateTrip);
 app.put('/api/trips/:id',updateTrip);
 app.use((err,req,res,next)=>res.status(err.type==='entity.too.large'?413:400).json({error:err.type==='entity.too.large'?(req.path.endsWith('/attachments')?'Файл превышает 25 МБ':'Превышен допустимый размер запроса'):err.message||'Не удалось выполнить действие'}));
 return {app,db,telegram};
}
