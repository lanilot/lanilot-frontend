// Broker/carrier checks: the company's factoring provider (credit decision) + FMCSA QCMobile (authority, legal name).
// Factoring companies (RTS, OTR, Triumph, Apex, eCapital…) do not publish a public credit-check API — access comes
// with a partner agreement. So each preset is a configurable HTTPS connector: URL template, auth and JSON field
// mapping come from env vars, set once the factoring company provides its API description.
import {env,safeJson,ProviderError,readStatus,writeStatus,errorText} from './providers.js';
import {eldProviders} from './eld-providers.js';

export const factoringPresets={
 rts:{name:'RTS Financial (RTS Pro)',docs:'https://www.rtsinc.com/'},
 otr:{name:'OTR Solutions',docs:'https://otrsolutions.com/'},
 triumph:{name:'Triumph (TriumphPay)',docs:'https://www.triumph.io/'},
 apex:{name:'Apex Capital',docs:'https://www.apexcapitalcorp.com/'},
 ecapital:{name:'eCapital',docs:'https://ecapital.com/'},
 custom:{name:'Другая факторинговая компания',docs:''}
};
const prefix=id=>'LANILOT_FACTORING_'+id.toUpperCase()+'_';
const factoringVars=id=>['URL','TOKEN','API_KEY','KEY_HEADER','FIELD_STATUS','FIELD_LIMIT','FIELD_DAYS','APPROVED','DECLINED','TEST_MC'].map(k=>prefix(id)+k);
export const activeFactoring=context=>{const id=env(context,'LANILOT_FACTORING_PROVIDER').toLowerCase();return factoringPresets[id]&&env(context,prefix(id)+'URL')?id:null};
const pick=(obj,path)=>path.split('.').reduce((v,k)=>v==null?v:v[k],obj);

// URL template placeholders: {mc} {dot} {name}. Values are URL-encoded; the template itself must be HTTPS.
export async function checkFactoring(context,id,{mc='',dot='',name=''}){
 const p=prefix(id),template=env(context,p+'URL');
 if(!template)throw new ProviderError('Не задан URL API факторинга');
 if(/\{mc\}/.test(template)&&!mc||/\{dot\}/.test(template)&&!dot)throw new ProviderError('Для проверки через факторинг нужен MC или DOT');
 const url=template.replace(/\{(mc|dot|name)\}/g,(_,k)=>encodeURIComponent({mc,dot,name}[k]));
 const headers={};if(env(context,p+'TOKEN'))headers.Authorization='Bearer '+env(context,p+'TOKEN');if(env(context,p+'API_KEY'))headers[env(context,p+'KEY_HEADER')||'x-api-key']=env(context,p+'API_KEY');
 const body=await safeJson(context,url,{headers});
 const raw=pick(body,env(context,p+'FIELD_STATUS')||'status'),value=String(raw??'').trim().toLowerCase();
 const list=(name,def)=>(env(context,p+name)||def).split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 const factoring=list('APPROVED','approved,approve,yes,y,true,buy').includes(value)?'approved':list('DECLINED','declined,decline,no,n,false,no buy,nobuy').includes(value)?'declined':'unknown';
 const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
 return {factoring,creditLimit:num(pick(body,env(context,p+'FIELD_LIMIT')||'creditLimit')),daysToPay:num(pick(body,env(context,p+'FIELD_DAYS')||'daysToPay')),rawStatus:raw??null};
}

// FMCSA QCMobile API (free webKey via login.gov): https://mobile.fmcsa.dot.gov/qc/services/…?webKey=
const FMCSA='https://mobile.fmcsa.dot.gov/qc/services';
const authority=v=>({A:'active',I:'inactive',N:'none'})[String(v??'').toUpperCase()]||'unknown';
function fmcsaCarrier(c){if(!c)return null;const statuses=[c.commonAuthorityStatus,c.contractAuthorityStatus,c.brokerAuthorityStatus].map(authority);
 return {legalName:c.legalName||null,dbaName:c.dbaName||null,dotNumber:c.dotNumber?String(c.dotNumber):null,allowedToOperate:c.allowedToOperate==='Y',brokerAuthority:authority(c.brokerAuthorityStatus),carrierAuthority:authority(c.commonAuthorityStatus)==='active'||authority(c.contractAuthorityStatus)==='active'?'active':authority(c.commonAuthorityStatus),
  authority:c.allowedToOperate==='N'?'inactive':statuses.includes('active')?'active':statuses.includes('inactive')?'inactive':'unknown',city:c.phyCity||null,state:c.phyState||null}}
const firstCarrier=content=>{const list=Array.isArray(content)?content:content?[content]:[];return list.map(x=>x?.carrier||x).find(Boolean)||null};
export async function lookupFmcsa(context,{mc,dot}){
 const key=env(context,'LANILOT_FMCSA_WEBKEY');if(!key)return null;
 const path=dot?`/carriers/${encodeURIComponent(dot)}`:mc?`/carriers/docket-number/${encodeURIComponent(mc)}`:null;if(!path)return null;
 const body=await safeJson(context,`${FMCSA}${path}?webKey=${encodeURIComponent(key)}`);
 const carrier=fmcsaCarrier(firstCarrier(body?.content));return carrier?{...carrier,mc:mc||null}:null;
}
// "MC-123456", "MC 123456" → mc; "DOT 1234567", "USDOT1234567" → dot; bare digits → treated as MC.
export function parseIdentifiers(query,record){
 const q=query.trim(),mc=q.match(/^mc[\s#-]*(\d{3,8})$/i)?.[1],dot=q.match(/^(?:us)?dot[\s#-]*(\d{3,9})$/i)?.[1],bare=q.match(/^\d{3,9}$/)?.[0];
 const fromRecord=v=>String(v||'').match(/^(?:mc|dot)[\s#-]*(\d+)$/i)?.[1]||'';
 return {mc:mc||(!dot&&bare)||fromRecord(record?.mc),dot:dot||fromRecord(record?.dot),name:record?.name||(!mc&&!dot&&!bare?q:'')};
}

// Provider list for the Integrations page: configured flag, env var names (never values), last check.
export function listProviders(db,context){
 const active=activeFactoring(context);
 return [
  ...Object.entries(eldProviders).map(([id,p])=>({id:'eld-'+id,group:'eld',name:p.name,docs:p.docs,vars:p.vars,configured:p.configured(context),...readStatus(db,'eld-'+id)})),
  {id:'fmcsa',group:'fmcsa',name:'FMCSA QCMobile',docs:'https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcApi',vars:['LANILOT_FMCSA_WEBKEY'],configured:!!env(context,'LANILOT_FMCSA_WEBKEY'),...readStatus(db,'fmcsa')},
  ...Object.entries(factoringPresets).map(([id,p])=>({id:'factoring-'+id,group:'factoring',name:p.name,docs:p.docs,vars:['LANILOT_FACTORING_PROVIDER',...factoringVars(id)],configured:!!env(context,prefix(id)+'URL'),active:active===id,partner:true,...readStatus(db,'factoring-'+id)}))
 ];
}
export function registerProviderRoutes(app,db,context){
 const running=new Set();
 app.post('/api/providers/:id/check',async(req,res)=>{
  const id=req.params.id,item=listProviders(db,context).find(p=>p.id===id);
  if(!item)return res.status(404).json({error:'Провайдер не найден'});
  if(!item.configured)return res.status(400).json({error:'Не настроено на сервере: задайте переменные окружения',vars:item.vars});
  if(running.has(id))return res.status(409).json({error:'Проверка уже выполняется'});
  running.add(id);let status;
  try{
   if(item.group==='eld')await eldProviders[id.slice(4)].probe(context);
   else if(item.group==='fmcsa')await safeJson(context,`${FMCSA}/carriers/docket-number/1515?webKey=${encodeURIComponent(env(context,'LANILOT_FMCSA_WEBKEY'))}`);
   else{const fid=id.slice(10),mc=env(context,prefix(fid)+'TEST_MC');if(!mc)throw new ProviderError('Задайте MC брокера для тестового запроса в переменной LANILOT_FACTORING_<ID>_TEST_MC');await checkFactoring(context,fid,{mc,dot:'',name:''})}
   status={status:'connected',result:'API ответил успешно',checkedAt:new Date().toISOString()};
  }catch(e){status={status:'error',result:errorText(e),checkedAt:new Date().toISOString()}}
  finally{running.delete(id)}
  writeStatus(db,id,status);res.json({ok:status.status==='connected',...status});
 });
}
