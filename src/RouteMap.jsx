import {translateDeep,__} from './i18n.js';
import LoadingBoundary from './Loading.jsx';
import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {Expand,ExternalLink,Route,AlertCircle} from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export default function RouteMap({load}){
 const host=useRef(null),mapRef=useRef(null),boundsRef=useRef(null);
 const [route,setRoute]=useState(null),[error,setError]=useState(''),[tilesError,setTilesError]=useState(false);
 useEffect(()=>{
  if(!host.current)return;
  let alive=true;const abort=new AbortController();setRoute(null);setError('');setTilesError(false);
  const map=L.map(host.current,{zoomControl:false,scrollWheelZoom:false,attributionControl:true,zoomSnap:.25});mapRef.current=map;
  L.control.zoom({position:'bottomright'}).addTo(map);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(map);
  tiles.on('tileerror',()=>{if(alive)setTilesError(true)});tiles.on('tileload',()=>{if(alive)setTilesError(false)});
  const addMarker=(coords,label,city)=>{if(!coords)return;const text=document.createElement('span');text.textContent=city;L.marker([coords[1],coords[0]],{title:city,keyboard:true,icon:L.divIcon({className:'route-pin-host',html:`<span class="route-pin pin-${label.toLowerCase()}">${label}</span>`,iconSize:[25,31],iconAnchor:[12,30]})}).bindTooltip(text,{direction:'top',offset:[0,-30]}).addTo(map)};
  addMarker(load.originCoordinates,'A',load.origin);addMarker(load.destinationCoordinates,'B',load.destination);
  if(load.originCoordinates&&load.destinationCoordinates){const b=L.latLngBounds([load.originCoordinates,load.destinationCoordinates].map(p=>[p[1],p[0]]));boundsRef.current=b;map.fitBounds(b,{padding:[30,30]})}else map.setView([38,-96],4);
  const resize=new ResizeObserver(()=>{map.invalidateSize({pan:false});if(boundsRef.current)map.fitBounds(boundsRef.current,{padding:[30,30],animate:false})});resize.observe(host.current);
  fetch('/api/loads/'+encodeURIComponent(load.id)+'/route',{signal:abort.signal}).then(async res=>{const body=translateDeep(await res.json());if(!res.ok)throw Error(body.error||__("Маршрут недоступен"));return body}).then(data=>{
   if(!alive)return;
   const coords=data.geometry.coordinates.map(p=>[p[1],p[0]]);
   L.polyline(coords,{color:'#ffffff',weight:7,opacity:.95}).addTo(map);
   const line=L.polyline(coords,{color:'#3567f0',weight:3.5,opacity:.95,dashArray:data.kind==='direct'?'7 7':undefined}).addTo(map);
   boundsRef.current=line.getBounds();map.fitBounds(boundsRef.current,{padding:[30,30]});setRoute(data);
  }).catch(e=>{if(alive&&e.name!=='AbortError')setError(e.message)});
  return()=>{alive=false;abort.abort();resize.disconnect();map.remove();mapRef.current=null;boundsRef.current=null};
 },[load.id]);
 const osm=load.originCoordinates&&load.destinationCoordinates?`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${load.originCoordinates[1]},${load.originCoordinates[0]};${load.destinationCoordinates[1]},${load.destinationCoordinates[0]}`:null;
 const hours=route?.durationSeconds?Math.floor(route.durationSeconds/3600):null;const minutes=route?.durationSeconds?Math.round(route.durationSeconds%3600/60):null;
 return <LoadingBoundary loadKey={load.id} busy={!route&&!error} variant="form"><div className="route-map-card"><div className="route-map-canvas" ref={host} aria-label={__("Карта маршрута {0} — {1}",[load.origin,load.destination])}/><div className="map-top-controls"><button aria-label={__("Показать весь маршрут")} title={__("Показать весь маршрут")} onClick={()=>{if(boundsRef.current)mapRef.current?.fitBounds(boundsRef.current,{padding:[30,30]})}}><Expand size={13}/></button>{osm&&<a href={osm} target="_blank" rel="noreferrer" title={__("Открыть в OpenStreetMap")} aria-label={__("Открыть маршрут в OpenStreetMap")}><ExternalLink size={13}/></a>}</div>{tilesError&&<span className="map-warning">{__("Подложка карты недоступна · проверьте интернет")}</span>}{!route&&!error&&<span className="map-loading">{__("Загружаем маршрут…")}</span>}<div className="map-route-meta"><span><Route size={12}/>{route?.kind==='road'?__("{0} mi на карте",[Math.round(route.distanceMeters/1609.344).toLocaleString('en-US')]):route?.kind==='direct'?__("Прямая линия между городами"):error||__("Расчёт маршрута")}</span>{hours!==null&&<span>≈ {hours} {__("ч")} {minutes} {__("мин")}</span>}</div><p className="map-caption">{route?.kind==='direct'?__("Дорожный маршрут недоступен. "):__("Между центрами городов. ")}{__("Без HOS и ограничений грузовика.")}</p></div></LoadingBoundary>
}
