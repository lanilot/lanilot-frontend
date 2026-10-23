import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {seedLoads} from '../server/seed.js';
import {locations} from '../server/locations.js';
const file=new URL('../server/routes.json',import.meta.url);
const cache=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
for(const load of seedLoads()){
 if(cache[load.id]?.geometry&&!process.argv.includes('--refresh'))continue;
 const origin=locations[load.origin],destination=locations[load.destination];
 if(!origin||!destination){console.warn(load.id,'missing city coordinates');continue}
 const url=`https://router.project-osrm.org/route/v1/driving/${origin.join(',')};${destination.join(',')}?overview=simplified&geometries=geojson&steps=false`;
 try{const res=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error(`HTTP ${res.status}`);const data=await res.json();const route=data.routes?.[0];if(data.code!=='Ok'||!route)throw Error(data.message||'No route');cache[load.id]={origin:load.origin,destination:load.destination,originCoordinates:origin,destinationCoordinates:destination,geometry:route.geometry,distanceMeters:route.distance,durationSeconds:route.duration,source:'OSRM / OpenStreetMap',profile:'driving',fetchedAt:new Date().toISOString()};writeFileSync(file,JSON.stringify(cache));console.log(load.id,route.geometry.coordinates.length,'points');}catch(e){console.log(load.id,e.message)}
 await new Promise(resolve=>setTimeout(resolve,600));
}
console.log('Cached',Object.keys(cache).length,'routes');
