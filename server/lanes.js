// Dedicated lanes: recurring contract runs with a fixed broker, rate and weekly schedule.
import {equipmentTypes} from './fleet.js';
import {locations} from './locations.js';
const toRad=d=>d*Math.PI/180;
// Road miles are estimated from the straight-line distance (≈1.2 detour factor) until the lane has a routed load.
export function estimateMiles(origin,destination){
 const a=locations[origin],b=locations[destination];if(!a||!b)return null;
 const dLat=toRad(b[1]-a[1]),dLng=toRad(b[0]-a[0]),h=Math.sin(dLat/2)**2+Math.cos(toRad(a[1]))*Math.cos(toRad(b[1]))*Math.sin(dLng/2)**2;
 return Math.round(3958.8*2*Math.asin(Math.sqrt(h))*1.2);
}
export function installLanes(db){db.exec(`CREATE TABLE IF NOT EXISTS lanes(id TEXT PRIMARY KEY,origin TEXT NOT NULL,destination TEXT NOT NULL,equipment TEXT NOT NULL,broker TEXT NOT NULL,rate REAL NOT NULL,miles INTEGER,days TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`)}
export function seedLanes(db){
 const now=new Date().toISOString(),year=new Date().getFullYear();
 for(const f of [
  ['seed-lane-chi-dal','Chicago, IL','Dallas, TX','Dry Van','C.H. Robinson',2400,949,'1,3,5',`${year}-01-06`,`${year}-12-31`,'lanes@example.com','Контракт на 3 рейса в неделю.',1],
  ['seed-lane-ind-dal','Indianapolis, IN','Dallas, TX','Reefer','Arrive Logistics',2700,919,'2,4',`${year}-03-01`,'','reefer@example.com','Температурный режим 34°F.',1],
  ['seed-lane-atl-clt','Atlanta, GA','Charlotte, NC','Dry Van','C.H. Robinson',1000,259,'1',`${year}-05-01`,`${year}-09-30`,'','Сезонная линия на паузе.',0]
 ])db.prepare('INSERT OR IGNORE INTO lanes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...f,now,now);
}
export function listLanes(db){return db.prepare('SELECT * FROM lanes ORDER BY active DESC,created_at,id').all().map(l=>({...l,active:!!l.active,days:l.days.split(',').filter(Boolean).map(Number)}))}
export function registerLaneRoutes(app,db){
 const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const validate=b=>{
  const clean={};for(const [key,max] of Object.entries({origin:100,destination:100,equipment:40,broker:120,startDate:10,endDate:10,contact:160,notes:1000})){const v=b?.[key]??'';if(typeof v!=='string'||v.trim().length>max)throw Error('Проверьте поля линии');clean[key]=v.trim()}
  if(!clean.origin||!clean.destination)throw Error('Укажите города погрузки и доставки');
  if(clean.origin.toLowerCase()===clean.destination.toLowerCase())throw Error('Города погрузки и доставки должны различаться');
  if(!equipmentTypes.includes(clean.equipment))throw Error('Выберите тип техники из списка');
  if(!clean.broker)throw Error('Укажите брокера');
  if(typeof b.rate!=='number'||!Number.isFinite(b.rate)||b.rate<=0||b.rate>100000)throw Error('Ставка должна быть от $0.01 до $100 000');
  if(!Array.isArray(b.days)||!b.days.length||b.days.some(d=>!Number.isInteger(d)||d<1||d>7))throw Error('Выберите дни недели');
  if(!validDate(clean.startDate)||clean.endDate&&(!validDate(clean.endDate)||clean.endDate<clean.startDate))throw Error('Проверьте даты контракта: окончание не раньше начала');
  if(typeof b.active!=='boolean')throw Error('Укажите состояние линии');
  const miles=b.miles===null||b.miles===undefined||b.miles===''?estimateMiles(clean.origin,clean.destination):b.miles;
  if(miles!==null&&(!Number.isInteger(miles)||miles<1||miles>6000))throw Error('Пробег линии: от 1 до 6000 миль');
  return {...clean,rate:Math.round(b.rate*100)/100,days:[...new Set(b.days)].sort().join(','),active:b.active,miles};
 };
 const save=(req,res,next)=>{try{
  const old=req.method==='PUT'?db.prepare('SELECT id FROM lanes WHERE id=?').get(req.params.id):null;if(req.method==='PUT'&&!old)return res.status(404).json({error:'Линия не найдена'});
  const l=validate(req.body),id=old?.id??crypto.randomUUID(),now=new Date().toISOString();
  if(old)db.prepare('UPDATE lanes SET origin=?,destination=?,equipment=?,broker=?,rate=?,miles=?,days=?,start_date=?,end_date=?,contact=?,notes=?,active=?,updated_at=? WHERE id=?').run(l.origin,l.destination,l.equipment,l.broker,l.rate,l.miles,l.days,l.startDate,l.endDate,l.contact,l.notes,Number(l.active),now,id);
  else db.prepare('INSERT INTO lanes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,l.origin,l.destination,l.equipment,l.broker,l.rate,l.miles,l.days,l.startDate,l.endDate,l.contact,l.notes,Number(l.active),now,now);
  res.status(old?200:201).json({id});
 }catch(e){next(e)}};
 app.post('/api/lanes',save);app.put('/api/lanes/:id',save);
 app.delete('/api/lanes/:id',(req,res)=>{if(!db.prepare('SELECT id FROM lanes WHERE id=?').get(req.params.id))return res.status(404).json({error:'Линия не найдена'});db.prepare('DELETE FROM lanes WHERE id=?').run(req.params.id);res.json({ok:true})});
}
