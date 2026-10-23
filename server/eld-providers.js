// Live ELD adapters. Each returns units in the map's shape:
// {vehicle, driver, status, lat, lng, heading, speed, hos|null, updatedAt, location, provider}.
// Docs: Samsara developers.samsara.com (Bearer token, /fleet/vehicles/stats?types=gps, /fleet/hos/clocks);
// Motive developer-docs.gomotive.com (X-Api-Key, /v1/vehicle_locations, /v1/available_time, seconds);
// Geotab developers.geotab.com (JSON-RPC apiv1: Authenticate, Get Device/DeviceStatusInfo/User).
import {env,safeJson,ProviderError} from './providers.js';

const MAX_PAGES=10;
const minutes=ms=>Number.isFinite(ms)?Math.max(0,Math.round(ms/60000)):null;
const hosOf=(driveMin,shiftMin,cycleMin)=>driveMin==null&&shiftMin==null&&cycleMin==null?null:{driveLeftMinutes:driveMin,shiftLeftMinutes:shiftMin,cycleLeftHours:cycleMin==null?null:Math.round(cycleMin/60)};

const samsaraHosts={us:'api.samsara.com',eu:'api.eu.samsara.com',ca:'api.ca.samsara.com'};
const samsaraStatus={driving:'driving',onDuty:'on_duty',yardMove:'on_duty',offDuty:'off_duty',sleeperBed:'off_duty',personalConveyance:'off_duty'};
async function samsara(context){
 const host=samsaraHosts[env(context,'LANILOT_SAMSARA_REGION').toLowerCase()||'us'];if(!host)throw new ProviderError('LANILOT_SAMSARA_REGION: us, eu или ca');
 const headers={Authorization:'Bearer '+env(context,'LANILOT_SAMSARA_TOKEN')};
 const pages=async path=>{const out=[];let after='';for(let i=0;i<MAX_PAGES;i++){const sep=path.includes('?')?'&':'?';const page=await safeJson(context,`https://${host}${path}${after?sep+'after='+encodeURIComponent(after):''}`,{headers});out.push(...(page?.data||[]));if(!page?.pagination?.hasNextPage)break;after=page.pagination.endCursor}return out};
 const [vehicles,clocks]=await Promise.all([pages('/fleet/vehicles/stats?types=gps'),pages('/fleet/hos/clocks').catch(()=>[])]);
 const byVehicle=new Map(clocks.filter(c=>c.currentVehicle?.id).map(c=>[String(c.currentVehicle.id),c]));
 return vehicles.filter(v=>v.gps&&Number.isFinite(v.gps.latitude)).map(v=>{const c=byVehicle.get(String(v.id)),speed=Math.round(v.gps.speedMilesPerHour||0);
  return {vehicle:v.name||String(v.id),externalId:String(v.id),driver:c?.driver?.name||null,status:samsaraStatus[c?.currentDutyStatus?.hosStatusType]||(speed>3?'driving':'off_duty'),lat:v.gps.latitude,lng:v.gps.longitude,heading:Math.round(v.gps.headingDegrees||0),speed,hos:c?hosOf(minutes(c.clocks?.drive?.driveRemainingDurationMs),minutes(c.clocks?.shift?.shiftRemainingDurationMs),minutes(c.clocks?.cycle?.cycleRemainingDurationMs)):null,updatedAt:v.gps.time,location:v.gps.reverseGeo?.formattedLocation||null,provider:'samsara'}});
}

const motiveStatus={driving:'driving',on_duty:'on_duty',yard_move:'on_duty',off_duty:'off_duty',sleeper:'off_duty',personal_conveyance:'off_duty'};
async function motive(context){
 const headers={'X-Api-Key':env(context,'LANILOT_MOTIVE_API_KEY')};
 const pages=async(path,key)=>{const out=[];for(let page=1;page<=MAX_PAGES;page++){const body=await safeJson(context,`https://api.gomotive.com${path}?per_page=100&page_no=${page}`,{headers});const items=body?.[key]||[];out.push(...items);const p=body?.pagination;if(!p||page*(p.per_page||100)>=(p.total||0)||!items.length)break}return out};
 const [vehicles,users]=await Promise.all([pages('/v1/vehicle_locations','vehicles'),pages('/v1/available_time','users').catch(()=>[])]);
 const byDriver=new Map(users.map(u=>u.user).filter(Boolean).map(u=>[String(u.id),u]));
 return vehicles.map(x=>x.vehicle).filter(v=>v?.current_location&&Number.isFinite(Number(v.current_location.lat))).map(v=>{const loc=v.current_location,d=v.current_driver,u=d?byDriver.get(String(d.id)):null,a=u?.available_time,speed=Math.round(Number(loc.speed)||0);
  return {vehicle:v.number||String(v.id),externalId:String(v.id),driver:d?[d.first_name,d.last_name].filter(Boolean).join(' '):null,status:motiveStatus[u?.duty_status]||(speed>3?'driving':'off_duty'),lat:Number(loc.lat),lng:Number(loc.lon),heading:Math.round(Number(loc.bearing)||0),speed,hos:a?hosOf(minutes(a.drive*1000),minutes(a.shift*1000),minutes(a.cycle*1000)):null,updatedAt:loc.located_at||null,location:loc.description||null,provider:'motive'}});
}

// Geotab sessions last up to 14 days and Authenticate is rate limited (10/min), so the session is reused.
const geotabSessions=new Map();
async function geotab(context){
 const server=env(context,'LANILOT_GEOTAB_SERVER')||'my.geotab.com';
 if(!/^([a-z0-9-]+\.)*geotab\.com$/i.test(server))throw new ProviderError('LANILOT_GEOTAB_SERVER должен быть адресом *.geotab.com');
 const key=server+'\0'+env(context,'LANILOT_GEOTAB_USERNAME')+'\0'+env(context,'LANILOT_GEOTAB_DATABASE');
 const call=async(host,method,params)=>{const body=await safeJson(context,`https://${host}/apiv1`,{method:'POST',body:{method,params}});if(body?.error)throw new ProviderError(body.error.message||'Geotab вернул ошибку');return body?.result};
 let session=geotabSessions.get(key);
 if(!session){const login=await call(server,'Authenticate',{database:env(context,'LANILOT_GEOTAB_DATABASE'),userName:env(context,'LANILOT_GEOTAB_USERNAME'),password:env(context,'LANILOT_GEOTAB_PASSWORD')});session={host:login?.path&&login.path!=='ThisServer'?new URL(login.path.includes('://')?login.path:'https://'+login.path).hostname:server,credentials:login?.credentials};if(!session.credentials)throw new ProviderError('Geotab не вернул сессию');geotabSessions.set(key,session)}
 const get=(typeName,search)=>call(session.host,'Get',{typeName,credentials:session.credentials,...(search?{search}:{})});
 let statuses,devices,users;
 try{[statuses,devices,users]=await Promise.all([get('DeviceStatusInfo'),get('Device'),get('User',{isDriver:true}).catch(()=>[])])}catch(e){geotabSessions.delete(key);throw e}
 const names=new Map((devices||[]).map(d=>[d.id,d.name])),drivers=new Map((users||[]).map(u=>[u.id,[u.firstName,u.lastName].filter(Boolean).join(' ')||u.name]));
 return (statuses||[]).filter(s=>Number.isFinite(s.latitude)).map(s=>{const speed=Math.round((s.speed||0)*0.621371);
  return {vehicle:names.get(s.device?.id)||s.device?.id,externalId:s.device?.id,driver:drivers.get(s.driver?.id)||null,status:s.isDriving?'driving':'off_duty',lat:s.latitude,lng:s.longitude,heading:Math.round(s.bearing||0),speed,hos:null,updatedAt:s.dateTime||null,location:null,provider:'geotab'}});
}

export const eldProviders={
 samsara:{name:'Samsara',docs:'https://developers.samsara.com/docs/getting-started',vars:['LANILOT_SAMSARA_TOKEN','LANILOT_SAMSARA_REGION'],configured:c=>!!env(c,'LANILOT_SAMSARA_TOKEN'),fetch:samsara,
  probe:c=>safeJson(c,`https://${samsaraHosts[env(c,'LANILOT_SAMSARA_REGION').toLowerCase()||'us']||'api.samsara.com'}/fleet/vehicles/stats?types=gps&limit=1`,{headers:{Authorization:'Bearer '+env(c,'LANILOT_SAMSARA_TOKEN')}})},
 motive:{name:'Motive',docs:'https://developer-docs.gomotive.com/docs/authentication',vars:['LANILOT_MOTIVE_API_KEY'],configured:c=>!!env(c,'LANILOT_MOTIVE_API_KEY'),fetch:motive,
  probe:c=>safeJson(c,'https://api.gomotive.com/v1/vehicle_locations?per_page=1&page_no=1',{headers:{'X-Api-Key':env(c,'LANILOT_MOTIVE_API_KEY')}})},
 geotab:{name:'Geotab',docs:'https://developers.geotab.com/myGeotab/apiReference/methods/Authenticate',vars:['LANILOT_GEOTAB_USERNAME','LANILOT_GEOTAB_PASSWORD','LANILOT_GEOTAB_DATABASE','LANILOT_GEOTAB_SERVER'],configured:c=>!!(env(c,'LANILOT_GEOTAB_USERNAME')&&env(c,'LANILOT_GEOTAB_PASSWORD')&&env(c,'LANILOT_GEOTAB_DATABASE')),fetch:geotab,
  probe:async c=>{await geotab(c);return true}}
};
