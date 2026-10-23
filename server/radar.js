import {equipmentTypes} from './fleet.js';
export function installRadar(db){db.exec(`CREATE TABLE IF NOT EXISTS radars(id TEXT PRIMARY KEY,name TEXT NOT NULL,origin TEXT NOT NULL,destination TEXT NOT NULL,equipment TEXT NOT NULL,min_rate REAL NOT NULL,rate_type TEXT NOT NULL,enabled INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`)}
export function matchingLoads(radar,loads){
 if(!radar.enabled)return [];
 const equal=(a,b)=>a.trim().toLowerCase()===b.trim().toLowerCase();
 return loads.filter(l=>(!radar.origin||equal(l.origin,radar.origin))&&(!radar.destination||equal(l.destination,radar.destination))&&(!radar.equipment||l.equipment===radar.equipment)&&Number.isFinite(l.rate)&&((radar.rate_type==='rpm'?(l.miles+l.deadhead>0?l.rate/(l.miles+l.deadhead):0):l.rate)>=radar.min_rate)).sort((a,b)=>b.rate-a.rate);
}
export function listRadars(db,loads){return db.prepare('SELECT * FROM radars ORDER BY created_at DESC,id').all().map(r=>({...r,enabled:!!r.enabled,matchIds:matchingLoads(r,loads).map(l=>l.id)}))}
export function seedRadars(db){
 const fixtures=[['seed-radar-chicago-van','Chicago · Dry Van','Chicago, IL','','Dry Van',2000,'total',1],['seed-radar-chicago-reefer','Reefer от $3.50/mi','Chicago, IL','','Reefer',3.5,'rpm',1],['seed-radar-dallas','Dallas → Phoenix','Dallas, TX','Phoenix, AZ','Dry Van',2000,'total',0],['seed-radar-cargo-van','Chicago · Cargo Van','Chicago, IL','','Cargo Van',500,'total',1]];
 for(const f of fixtures){const now=new Date().toISOString();db.prepare('INSERT OR IGNORE INTO radars VALUES(?,?,?,?,?,?,?,?,?,?)').run(...f,now,now)}
}
export function registerRadarRoutes(app,db){
 const validate=b=>{
  const clean={};for(const [key,max] of Object.entries({name:80,origin:100,destination:100,equipment:40,rateType:10})){if(typeof b?.[key]!=='string'||b[key].trim().length>max)throw Error('Проверьте поля радара');clean[key]=b[key].trim()}
  if(!clean.name)throw Error('Укажите название радара');
  if(clean.equipment&&!equipmentTypes.includes(clean.equipment))throw Error('Выберите тип техники из списка');
  if(!['total','rpm'].includes(clean.rateType))throw Error('Выберите единицу минимальной ставки');
  if(typeof b.enabled!=='boolean'||typeof b.minRate!=='number'||!Number.isFinite(b.minRate)||b.minRate<0||b.minRate>(clean.rateType==='rpm'?1000:100000))throw Error('Проверьте минимальную ставку и состояние радара');
  return {...clean,minRate:b.minRate,enabled:b.enabled};
 };
 const save=(req,res,next)=>{try{
  const old=req.method==='PUT'?db.prepare('SELECT id FROM radars WHERE id=?').get(req.params.id):null;if(req.method==='PUT'&&!old)return res.status(404).json({error:'Радар не найден'});
  const r=validate(req.body),id=old?.id??crypto.randomUUID(),now=new Date().toISOString();
  if(old)db.prepare('UPDATE radars SET name=?,origin=?,destination=?,equipment=?,min_rate=?,rate_type=?,enabled=?,updated_at=? WHERE id=?').run(r.name,r.origin,r.destination,r.equipment,r.minRate,r.rateType,Number(r.enabled),now,id);
  else db.prepare('INSERT INTO radars VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,r.name,r.origin,r.destination,r.equipment,r.minRate,r.rateType,Number(r.enabled),now,now);
  res.status(old?200:201).json({id});
 }catch(e){next(e)}};
 app.post('/api/radars',save);app.put('/api/radars/:id',save);
 app.patch('/api/radars/:id',(req,res)=>{if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'Укажите состояние радара'});if(!db.prepare('SELECT id FROM radars WHERE id=?').get(req.params.id))return res.status(404).json({error:'Радар не найден'});db.prepare('UPDATE radars SET enabled=?,updated_at=? WHERE id=?').run(Number(req.body.enabled),new Date().toISOString(),req.params.id);res.json({ok:true})});
 app.get('/api/radars/:id/results',(req,res)=>{const r=db.prepare('SELECT * FROM radars WHERE id=?').get(req.params.id);if(!r)return res.status(404).json({error:'Радар не найден'});const loads=db.prepare('SELECT data FROM loads').all().map(row=>JSON.parse(row.data));res.json({id:r.id,enabled:!!r.enabled,loads:matchingLoads(r,loads),checkedAt:new Date().toISOString(),demo:true})});
}
