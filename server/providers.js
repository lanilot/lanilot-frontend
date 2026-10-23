// Shared plumbing for live provider integrations (ELD, factoring, FMCSA): env access, an SSRF-guarded
// JSON client and a persisted "last check" status per provider. Secrets live only in server env vars.
import {publicAddress} from './integrations.js';

export const env=(context,name)=>String(context.env[name]??'').trim();

export class ProviderError extends Error{constructor(message,status){super(message);this.status=status}}

// HTTPS only, public addresses only, no redirects, 10 s timeout. Returns parsed JSON (or null for empty bodies).
export async function safeJson(context,url,{method='GET',headers={},body}={}){
 let u;try{u=new URL(url)}catch{throw new ProviderError('Некорректный адрес API')}
 if(u.protocol!=='https:'||u.username||u.password)throw new ProviderError('Разрешены только HTTPS-адреса без учётных данных');
 const addresses=await Promise.race([context.resolve(u.hostname,{all:true}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new ProviderError('DNS не ответил вовремя')),4000);t.unref?.()})]);
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new ProviderError('Адрес API указывает на внутреннюю сеть');
 const response=await context.request(u.href,{method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel?.();throw new ProviderError(response.status===401||response.status===403?'API отклонил доступ. Проверьте ключ и права.':response.status===429?'API ограничил частоту запросов. Повторите позже.':`API вернул HTTP ${response.status}`,response.status)}
 const text=await response.text();if(!text)return null;
 try{return JSON.parse(text)}catch{throw new ProviderError('API вернул не JSON')}
}

export function installProviderStatus(db){db.exec('CREATE TABLE IF NOT EXISTS provider_checks(id TEXT PRIMARY KEY,data TEXT NOT NULL)')}
export function readStatus(db,id){const r=db.prepare('SELECT data FROM provider_checks WHERE id=?').get(id);return r?JSON.parse(r.data):null}
export function writeStatus(db,id,data){db.prepare('INSERT INTO provider_checks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id,JSON.stringify(data))}
export const errorText=e=>e instanceof ProviderError?e.message:e?.name==='TimeoutError'?'API не ответил за 10 секунд':'Не удалось связаться с API: проверьте адрес, сеть и ключ';
