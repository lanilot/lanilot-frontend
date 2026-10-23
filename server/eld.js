// ELD fleet positions. Until an ELD provider (Samsara, Motive…) is connected, positions are simulated:
// trucks on in-transit trips move along the cached road route by the trip's schedule, others stay parked.
import {readFileSync,existsSync} from 'node:fs';
import {locations} from './locations.js';
import {eldProviders} from './eld-providers.js';
import {errorText} from './providers.js';
export const eldProvider='Demo ELD';
const routesFile=new URL('./routes.json',import.meta.url);
const hash=s=>[...s].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7);
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const bearing=(a,b)=>(Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI+360)%360;
function along(coords,progress){
 const seg=coords.slice(1).map((p,i)=>Math.hypot(p[0]-coords[i][0],p[1]-coords[i][1])),total=seg.reduce((s,d)=>s+d,0);
 let left=total*progress;for(let i=0;i<seg.length;i++){if(left<=seg[i]||i===seg.length-1){const t=seg[i]?Math.min(1,left/seg[i]):0;return {point:lerp(coords[i],coords[i+1],t),heading:bearing(coords[i],coords[i+1])}}left-=seg[i]}
 return {point:coords[0],heading:0};
}
export function eldSnapshot(db,now=new Date()){
 const routes=existsSync(routesFile)?JSON.parse(readFileSync(routesFile,'utf8')):{};
 const loadById=id=>{const r=db.prepare('SELECT data FROM loads WHERE id=?').get(id);return r?JSON.parse(r.data):null};
 const trips=db.prepare("SELECT * FROM trips WHERE status IN ('planned','in_transit','delivered','completed') ORDER BY created_at DESC").all();
 const units=db.prepare('SELECT * FROM trucks ORDER BY id').all().map(truck=>{
  const mine=trips.filter(t=>t.truck.trim().toLowerCase()===truck.id.toLowerCase());
  const active=mine.find(t=>t.status==='in_transit')||mine.find(t=>t.status==='planned'),last=mine.find(t=>['delivered','completed'].includes(t.status));
  const load=active?loadById(active.load_id):null,h=hash(truck.id);
  const driver=active?.driver??null,driverRow=driver?db.prepare('SELECT availability FROM drivers WHERE lower(trim(name))=lower(?)').get(driver.trim()):null;
  let status,point,heading=0,speed=0,progress=null,eta=null;
  if(active?.status==='in_transit'&&load){
   const start=Date.parse((active.pickup||load.pickup)+'T14:00:00Z'),end=Date.parse((active.delivery||load.delivery)+'T22:00:00Z');
   progress=Math.min(.98,Math.max(.02,(now-start)/(end-start)));
   const cached=routes[load.id],coords=cached?.origin===load.origin&&cached?.destination===load.destination?cached.geometry.coordinates:[locations[load.origin],locations[load.destination]].filter(Boolean);
   if(coords.length>=2){const at=along(coords,progress);point=at.point;heading=at.heading}
   // Rest breaks: every few hours the unit reports a short stop, like a real ELD feed.
   const minute=Math.floor(now/60000);status=(minute+h)%37<4?'on_duty':'driving';speed=status==='driving'?52+(minute+h)%13:0;eta=new Date(end).toISOString();
  }
  if(!point){
   const city=truck.location&&locations[truck.location]?truck.location:active&&load?load.origin:last?loadById(last.load_id)?.destination:'Chicago, IL';
   const base=locations[city]??locations['Chicago, IL'];point=[base[0]+((h%100)-50)/2500,base[1]+((h>>8)%100-50)/2500];
   status=truck.availability==='maintenance'?'maintenance':truck.availability==='inactive'?'inactive':active?'on_duty':'off_duty';
  }
  const driveLeft=status==='driving'||status==='on_duty'?Math.max(30,660-((Math.floor(now/60000)+h)%600)):660;
  return {truck:truck.id,plate:truck.plate,equipment:truck.equipment,driver,driverAvailability:driverRow?.availability??null,status,lat:Math.round(point[1]*1e5)/1e5,lng:Math.round(point[0]*1e5)/1e5,heading:Math.round(heading),speed,progress,eta,
   tripId:active?.id??null,loadId:load?.id??null,origin:load?.origin??null,destination:load?.destination??null,
   hos:{driveLeftMinutes:driveLeft,shiftLeftMinutes:Math.min(840,driveLeft+180),cycleLeftHours:70-(h%30)},
   updatedAt:new Date(now-((h%50)+5)*1000).toISOString()};
 });
 return {provider:eldProvider,demo:true,generatedAt:now.toISOString(),units};
}
// Live mode: every configured ELD is polled (mixed fleets are merged); vehicles are matched to our trucks
// by name/number vs truck number or plate, and unmatched vehicles are still shown. Cached ~30 s per process.
const CACHE_MS=30000;
export const configuredEld=context=>Object.entries(eldProviders).filter(([,p])=>p.configured(context)).map(([id])=>id);
async function liveSnapshot(db,context,ids){
 const results=await Promise.allSettled(ids.map(id=>eldProviders[id].fetch(context)));
 const trucks=db.prepare('SELECT * FROM trucks').all(),norm=v=>String(v??'').trim().toLowerCase();
 const trips=db.prepare("SELECT * FROM trips WHERE status IN ('planned','in_transit') ORDER BY created_at DESC").all();
 const loadById=id=>{const r=db.prepare('SELECT data FROM loads WHERE id=?').get(id);return r?JSON.parse(r.data):null};
 const units=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(u=>{
  const truck=trucks.find(t=>norm(t.id)===norm(u.vehicle)||t.plate&&norm(t.plate)===norm(u.vehicle));
  const trip=truck&&(trips.find(t=>norm(t.truck)===norm(truck.id)&&t.status==='in_transit')||trips.find(t=>norm(t.truck)===norm(truck.id)));
  const load=trip?loadById(trip.load_id):null;
  return {...u,truck:truck?.id??u.vehicle,matched:!!truck,plate:truck?.plate??null,equipment:truck?.equipment??null,driver:u.driver||trip?.driver||null,tripId:trip?.id??null,loadId:load?.id??null,origin:load?.origin??null,destination:load?.destination??null,progress:null,eta:null};
 });
 return {provider:ids.map(id=>eldProviders[id].name).join(' + '),demo:false,generatedAt:new Date().toISOString(),units,
  providers:ids.map((id,i)=>({id,name:eldProviders[id].name,ok:results[i].status==='fulfilled',count:results[i].status==='fulfilled'?results[i].value.length:0,error:results[i].status==='rejected'?errorText(results[i].reason):null}))};
}
export function registerEldRoutes(app,db,context={env:process.env}){
 let cache=null;
 app.get('/api/eld/positions',async(req,res)=>{
  const ids=configuredEld(context);
  if(!ids.length)return res.json({...eldSnapshot(db),providers:[]});
  const key=ids.join(',');
  if(!cache||cache.key!==key||Date.now()-cache.at>CACHE_MS)cache={key,at:Date.now(),data:await liveSnapshot(db,context,ids)};
  res.json(cache.data);
 });
}
