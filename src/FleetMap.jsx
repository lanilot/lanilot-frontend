import {translateDeep,__,fmtDate} from './i18n.js';
import LoadingBoundary from './Loading.jsx';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {MapPinned,RefreshCw,Truck,Gauge,Clock,Navigation,AlertCircle} from 'lucide-react';

export const eldStatusLabels={driving:__("В движении"),on_duty:__("На смене"),off_duty:__("Не на смене"),maintenance:__("На обслуживании"),inactive:__("Неактивна")};
const hm=m=>__("{0} ч {1} мин",[Math.floor(m/60),String(m%60).padStart(2,'0')]);
const ago=iso=>{const s=Math.max(0,Math.round((Date.now()-Date.parse(iso))/1000));return s<60?__("{0} сек назад",[s]):__("{0} мин назад",[Math.round(s/60)])};
const pinHtml=u=>`<span class="eld-pin ${u.status}">${u.status==='driving'?`<i style="transform:rotate(${u.heading}deg)"></i>`:''}<b>${u.truck.replace(/^TRK-/,'')}</b></span>`;

// Live fleet map fed by ELD positions (simulated until Samsara/Motive is connected).
export default function FleetMap({state,onOpenLoad}){
 const host=useRef(null),map=useRef(null),markers=useRef({}),routeLayer=useRef(null);
 const [data,setData]=useState(null),[error,setError]=useState(''),[selected,setSelected]=useState(null),[filter,setFilter]=useState('all'),[,tick]=useState(0);
 const load=async()=>{try{const r=await fetch('/api/eld/positions');const body=translateDeep(await r.json());if(!r.ok)throw Error(body.error||__("ELD недоступен"));setData(body);setError('')}catch(e){setError(e.message)}};
 useEffect(()=>{load();const poll=setInterval(()=>{if(!document.hidden)load()},15000),clock=setInterval(()=>tick(n=>n+1),5000);return()=>{clearInterval(poll);clearInterval(clock)}},[]);
 useEffect(()=>{
  const m=L.map(host.current,{zoomControl:false,zoomSnap:.25});map.current=m;L.control.zoom({position:'bottomright'}).addTo(m);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(m);
  m.setView([38.5,-92],5);const resize=new ResizeObserver(()=>m.invalidateSize({pan:false}));resize.observe(host.current);
  return()=>{resize.disconnect();m.remove();map.current=null;markers.current={}};
 },[]);
 const units=data?.units||[];
 useEffect(()=>{
  const m=map.current;if(!m||!units.length)return;const seen=new Set();
  for(const u of units){seen.add(u.truck);const icon=L.divIcon({className:'eld-pin-host',html:pinHtml(u),iconSize:[34,34],iconAnchor:[17,17]});
   const label=`${u.truck}${u.driver?' · '+u.driver:''} — ${eldStatusLabels[u.status]}${u.speed?' · '+u.speed+' mph':''}`;
   if(markers.current[u.truck]){markers.current[u.truck].setLatLng([u.lat,u.lng]).setIcon(icon);markers.current[u.truck].setTooltipContent(label)}
   else markers.current[u.truck]=L.marker([u.lat,u.lng],{icon,title:u.truck,keyboard:true}).bindTooltip(label,{direction:'top',offset:[0,-16]}).on('click',()=>setSelected(u.truck)).addTo(m);}
  for(const id of Object.keys(markers.current))if(!seen.has(id)){markers.current[id].remove();delete markers.current[id]}
  if(!m._fitted){m.fitBounds(L.latLngBounds(units.map(u=>[u.lat,u.lng])),{padding:[50,50],maxZoom:7});m._fitted=true}
 },[data]);
 const unit=units.find(u=>u.truck===selected);
 useEffect(()=>{
  const m=map.current;routeLayer.current?.remove();routeLayer.current=null;if(!m||!unit)return;
  m.flyTo([unit.lat,unit.lng],Math.max(m.getZoom(),7),{duration:.6});
  if(!unit.loadId)return;const abort=new AbortController();
  fetch('/api/loads/'+encodeURIComponent(unit.loadId)+'/route',{signal:abort.signal}).then(r=>r.ok?r.json():null).then(route=>{if(!route||!map.current)return;routeLayer.current=L.polyline(route.geometry.coordinates.map(p=>[p[1],p[0]]),{color:'#2563eb',weight:4,opacity:.75,dashArray:route.kind==='direct'?'7 7':undefined}).addTo(map.current)}).catch(()=>{});
  return()=>abort.abort();
 },[selected]);
 const counts=useMemo(()=>units.reduce((n,u)=>({...n,[u.status]:(n[u.status]||0)+1}),{}),[data]);
 const list=units.filter(u=>filter==='all'||u.status===filter);
 const tripLoad=u=>u.loadId&&state.loads.find(l=>l.id===u.loadId);
 return <section className="fleet-map-page">
 <div className="info-note eld-note"><AlertCircle size={16}/><span><strong>{data?.provider||'ELD'}</strong> {__("· демо-позиции: машины в пути движутся по маршруту рейса. Реальные данные — после подключения Samsara или Motive (API-ключ ELD).")}</span>{data&&<span className="eld-updated">{__("Обновлено")} {ago(data.generatedAt)}</span>}<button className="button secondary tiny" onClick={load}><RefreshCw size={12}/>{__("Обновить")}</button></div>
 <div className="status-chips">{[['all',__("Все"),units.length],...Object.entries(eldStatusLabels).map(([k,l])=>[k,l,counts[k]||0])].map(([key,label,n])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{key!=='all'&&<i className={'eld-dot '+key}/>} {label}<span>{n}</span></button>)}</div>
 <div className="fleet-map-layout"><aside className="panel eld-list" aria-label={__("Машины на карте")}>{error&&<p className="chat-error" role="alert">{error}</p>}{!data&&!error&&<LoadingBoundary busy variant="form"><span/></LoadingBoundary>}
  {list.map(u=>{const l=tripLoad(u);return <button key={u.truck} className={'eld-unit '+(selected===u.truck?'selected':'')} onClick={()=>setSelected(selected===u.truck?null:u.truck)}><span className={'eld-dot '+u.status}/><span className="eld-unit-main"><strong>{u.truck}<small>{u.driver||__("Без водителя")}</small></strong><span className="eld-unit-status">{eldStatusLabels[u.status]}{u.speed>0&&<><Gauge size={11}/>{u.speed} mph</>}</span>{l&&<span className="eld-unit-trip"><Navigation size={11}/>{l.origin.split(',')[0]} → {l.destination.split(',')[0]}{u.progress!=null&&` · ${Math.round(u.progress*100)}%`}</span>}<span className="eld-unit-hos"><Clock size={11}/>{__("Вождение:")} {hm(u.hos.driveLeftMinutes)} {__("· смена")} {hm(u.hos.shiftLeftMinutes)}</span><small>{ago(u.updatedAt)}</small></span></button>})}
  {data&&!list.length&&<p className="fleet-empty">{__("Нет машин с этим статусом")}</p>}</aside>
  <div className="panel eld-map"><div className="eld-map-canvas" ref={host} aria-label={__("Карта автопарка")}/>{unit&&<div className="eld-map-card"><strong><Truck size={14}/>{unit.truck} · {unit.driver||__("Без водителя")}</strong><span>{eldStatusLabels[unit.status]}{unit.speed>0?` · ${unit.speed} mph`:''} · {unit.lat.toFixed(3)}, {unit.lng.toFixed(3)}</span>{unit.eta&&<span>ETA: {fmtDate(new Date(unit.eta),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'},'datetime')}</span>}<span>{__("HOS: вождение")} {hm(unit.hos.driveLeftMinutes)} {__("· цикл")} {unit.hos.cycleLeftHours} {__("ч")}</span>{tripLoad(unit)&&<button className="button secondary tiny" onClick={()=>onOpenLoad(tripLoad(unit))}>{__("Открыть рейс")}</button>}</div>}</div></div>
 </section>
}
