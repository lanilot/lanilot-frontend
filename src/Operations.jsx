// Fuel, safety & fleet, broker updates (updater) and the email guard. Data comes with /api/state;
// changes go through onAction(path,method,body) → {ok,error}, which refreshes the state.
import {__,fmtDate} from './i18n.js';
import LoadingBoundary from './Loading.jsx';
import React,{useMemo,useState} from 'react';
import {Fuel as FuelIcon,Gauge,DollarSign,AlertTriangle,CheckCircle2,ShieldAlert,FileWarning,Wrench,Car,ClipboardCheck,Send,Mail,MessagesSquare,Clock,ShieldCheck,Ban,LinkIcon,Inbox,Plug} from 'lucide-react';
import {money,number,date,tripLabels} from './ui.js';
import './operations.css';

const ago=iso=>{const m=Math.max(0,Math.round((Date.now()-Date.parse(iso))/60000));return m<60?__('{0} мин назад',[m]):m<1440?__('{0} ч назад',[Math.round(m/60)]):__('{0} дн назад',[Math.round(m/1440)])};
function Kpis({items}){return <div className="ops-kpis">{items.map(([Icon,label,value,tone])=><div className={'panel ops-kpi '+(tone||'')} key={label}><Icon size={17}/><span>{label}<strong>{value}</strong></span></div>)}</div>}
function Tabs({tabs,value,onChange}){return <nav className="fleet-tabs ops-tabs">{tabs.map(([id,label,n])=><button key={id} className={value===id?'active':''} onClick={()=>onChange(id)}>{label}{n!==undefined&&<span>{n}</span>}</button>)}</nav>}

// ---------------- Fuel
const fuelItems={diesel:__('Дизель'),reefer:__('Топливо рефа'),def:'DEF',non_fuel:__('Не топливо')};
const fuelReason=(t,tank)=>t.flags.map(f=>f==='tank'?__('{0} gal — больше объёма баков ({1} gal)',[t.gallons,tank]):f==='overuse'?__('+{0} gal сверх нормы: ~{1} gal на пробег с прошлой заправки',[t.over,t.expected]):__('Покупка не топлива по топливной карте: {0}',[money(t.amount)]));
export function FuelPage({state,onAction,onNavigate}){
 const f=state.fuel,[tab,setTab]=useState('alerts'),[busy,setBusy]=useState(null);
 const alerts=f.transactions.filter(t=>t.flags.length),open=alerts.filter(t=>!t.reviewed);
 const miles=f.trucks.reduce((s,t)=>s+t.miles,0),gallons=f.trucks.reduce((s,t)=>s+t.gallons,0),spend=f.trucks.reduce((s,t)=>s+t.spend,0);
 const fleetMpg=gallons?miles/gallons:0,cpm=f.trucks.reduce((s,t)=>s+(t.costPerMile||0)*t.miles,0)/(miles||1);
 const cards=(state.providers||[]).filter(p=>p.group==='fuel');
 const review=async(t,reviewed)=>{setBusy(t.id);await onAction('/fuel/'+t.id,'PATCH',{reviewed});setBusy(null)};
 return <section className="ops-page">
  <Kpis items={[[Gauge,__('MPG автопарка · цель {0}',[f.targetMpg]),fleetMpg.toFixed(2),fleetMpg<f.targetMpg*0.9?'warn':''],[DollarSign,__('Топливо на милю'),'$'+cpm.toFixed(3)],[FuelIcon,__('Расход на топливо'),money(spend)],[AlertTriangle,__('Открытые алерты'),open.length,open.length?'bad':'']]}/>
  <div className="panel ops-cards"><span className="ops-cards-label"><FuelIcon size={14}/>{__('Топливные карты')}</span>{cards.map(c=><span key={c.id} className={'ops-chip '+(c.configured?'live':'')}>{c.name}<small>{c.configured?__('Подключено'):__('Демо-данные')}</small></span>)}<button className="text-button" onClick={()=>onNavigate('integrations')}><Plug size={13}/>{__('Подключить')}</button></div>
  <section className="panel"><div className="fleet-toolbar"><Tabs value={tab} onChange={setTab} tabs={[['alerts',__('Алерты'),open.length],['trucks',__('Расход по машинам'),f.trucks.length],['transactions',__('Операции по картам'),f.transactions.length]]}/></div>
  <LoadingBoundary loadKey={'fuel-'+tab}>
  {tab==='alerts'&&(alerts.length?<ul className="ops-alerts">{alerts.map(t=><li key={t.id} className={t.reviewed?'done':''}><AlertTriangle size={16}/><div><strong>{t.truck} · {t.driver}</strong><span>{date(t.date)} · {t.location} · {t.provider} {t.card} · {t.item==='non_fuel'?'':t.gallons+' gal · '}{money(t.amount)}</span>{fuelReason(t,f.tankGallons).map(r=><p key={r}>{r}</p>)}</div>{t.reviewed?<button className="text-button" disabled={busy===t.id} onClick={()=>review(t,false)}><CheckCircle2 size={14}/>{__('Проверено')}</button>:<button className="button secondary" disabled={busy===t.id} onClick={()=>review(t,true)}>{__('Отметить проверенным')}</button>}</li>)}</ul>:<p className="fleet-empty">{__('Нарушений нет')}</p>)}
  {tab==='trucks'&&<div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>{__('Машина')}</th><th>{__('Водитель')}</th><th>{__('Карта')}</th><th>{__('Мили')}</th><th>{__('Галлоны')}</th><th>MPG</th><th>{__('$ / миля')}</th><th>{__('Расход')}</th></tr></thead><tbody>{f.trucks.map(t=><tr key={t.truck}><td><strong>{t.truck}</strong></td><td>{t.driver}</td><td>{t.provider} {t.card}</td><td>{number(t.miles)}</td><td>{number(t.gallons)}</td><td><span className={'fleet-status '+(t.low?'inactive ops-bad':'available')}>{t.mpg??'—'}</span>{t.low&&<small className="ops-note">{__('Ниже цели на {0}%',[Math.round((1-t.mpg/f.targetMpg)*100)])}</small>}</td><td>{t.costPerMile?'$'+t.costPerMile.toFixed(3):'—'}</td><td>{money(t.spend)}</td></tr>)}</tbody></table></div>}
  {tab==='transactions'&&<div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>{__('Дата')}</th><th>{__('Машина')}</th><th>{__('Водитель')}</th><th>{__('Место')}</th><th>{__('Покупка')}</th><th>{__('Галлоны')}</th><th>{__('Сумма')}</th><th>{__('Одометр')}</th><th/></tr></thead><tbody>{f.transactions.map(t=><tr key={t.id}><td>{date(t.date)}</td><td>{t.truck}</td><td>{t.driver}</td><td>{t.location}</td><td>{fuelItems[t.item]||t.item}</td><td>{t.item==='non_fuel'?'—':t.gallons}</td><td>{money(t.amount)}</td><td>{t.odometer?number(t.odometer):'—'}</td><td>{t.flags.length>0&&<span className="fleet-status inactive ops-bad">{__('Алерт')}</span>}</td></tr>)}</tbody></table></div>}
  </LoadingBoundary></section>
 </section>;
}

// ---------------- Safety & fleet
const docKinds={cdl:'CDL',medical:__('Медицинская карта'),drug_test:__('Тест на наркотики и алкоголь'),mvr:'MVR',annual_inspection:__('Ежегодная инспекция DOT'),registration:__('Регистрация (IRP)'),insurance:__('Страховка')};
const subjectTypes={driver:__('Водитель'),truck:__('Машина'),trailer:__('Прицеп')};
const severity={low:__('Низкая'),medium:__('Средняя'),high:__('Высокая')};
export function SafetyPage({state,onAction}){
 const {documents,events}=state.safety,[tab,setTab]=useState('documents'),[renew,setRenew]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const of=type=>events.filter(e=>e.type===type),today=new Date().toISOString().slice(0,10);
 const expired=documents.filter(d=>d.state==='expired').length,soon=documents.filter(d=>d.state==='soon').length;
 const openViolations=of('violation').filter(e=>e.status==='open').length,overdue=of('maintenance').filter(e=>e.status==='open'&&e.date<today).length;
 const act=async(path,body)=>{setBusy(true);setError('');const r=await onAction(path,'PATCH',body);setBusy(false);if(!r.ok)setError(r.error);return r.ok};
 const eventTable=(type,cols)=><div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>{type==='maintenance'?__('Срок'):__('Дата')}</th>{cols.includes('driver')&&<th>{__('Водитель')}</th>}<th>{__('Машина')}</th>{cols.includes('location')&&<th>{__('Место')}</th>}<th>{type==='violation'?__('Нарушение'):__('Описание')}</th>{cols.includes('severity')&&<th>{__('Тяжесть')}</th>}{cols.includes('cost')&&<th>{__('Стоимость')}</th>}<th>{__('Статус')}</th><th/></tr></thead><tbody>{of(type).map(e=>{const late=type==='maintenance'&&e.status==='open'&&e.date<today;return <tr key={e.id}><td className={late?'ops-bad':''}>{date(e.date)}{late&&<small className="ops-note">{__('Просрочено')}</small>}</td>{cols.includes('driver')&&<td>{e.driver||'—'}</td>}<td>{e.truck||'—'}</td>{cols.includes('location')&&<td>{e.location||'—'}</td>}<td><strong>{e.title}</strong><small className="ops-note">{e.detail}</small></td>{cols.includes('severity')&&<td><span className={'ops-sev '+e.severity}>{severity[e.severity]}</span></td>}{cols.includes('cost')&&<td>{e.cost?money(e.cost):'—'}</td>}<td><span className={'fleet-status '+(e.status==='open'?'maintenance':'available')}>{e.status==='open'?(type==='maintenance'?__('Запланировано'):__('Открыто')):(type==='maintenance'?__('Выполнено'):__('Закрыто'))}</span></td><td><button className="text-button" disabled={busy} onClick={()=>act('/safety/events/'+e.id,{status:e.status==='open'?'closed':'open'})}>{e.status==='open'?(type==='maintenance'?__('Выполнено'):__('Закрыть')):__('Открыть снова')}</button></td></tr>})}</tbody></table></div>;
 return <section className="ops-page">
  <Kpis items={[[FileWarning,__('Просроченные документы'),expired,expired?'bad':''],[Clock,__('Истекают за 30 дней'),soon,soon?'warn':''],[ShieldAlert,__('Открытые нарушения'),openViolations,openViolations?'warn':''],[Wrench,__('Просроченное ТО'),overdue,overdue?'bad':'']]}/>
  <section className="panel"><div className="fleet-toolbar"><Tabs value={tab} onChange={t=>{setTab(t);setRenew(null)}} tabs={[['documents',__('Документы и сроки'),documents.length],['inspections',__('Инспекции и нарушения'),of('inspection').length+of('violation').length],['accidents',__('ДТП'),of('accident').length],['maintenance',__('Обслуживание'),of('maintenance').length]]}/></div>
  {error&&<p className="chat-error" role="alert">{error}</p>}
  <LoadingBoundary loadKey={'safety-'+tab}>
  {tab==='documents'&&<div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>{__('Кто / что')}</th><th>{__('Документ')}</th><th>{__('Номер')}</th><th>{__('Действует до')}</th><th>{__('Статус')}</th><th/></tr></thead><tbody>{documents.map(d=><tr key={d.id}><td><strong>{d.subject}</strong><small className="ops-note">{subjectTypes[d.subject_type]}</small></td><td>{docKinds[d.kind]||d.kind}</td><td>{d.number||'—'}</td><td>{renew?.id===d.id?<form className="ops-renew" onSubmit={async e=>{e.preventDefault();if(await act('/safety/documents/'+d.id,{expires:renew.value}))setRenew(null)}}><input type="date" required aria-label={__('Новая дата окончания')} value={renew.value} onChange={e=>setRenew({...renew,value:e.target.value})}/><button className="button primary" disabled={busy}>{__('Сохранить')}</button></form>:date(d.expires)}</td><td><span className={'ops-doc '+d.state}>{d.state==='expired'?__('Просрочен {0} дн',[-d.days]):d.state==='soon'?__('Через {0} дн',[d.days]):__('Действует')}</span></td><td>{renew?.id!==d.id&&<button className="text-button" onClick={()=>setRenew({id:d.id,value:d.expires})}>{__('Продлить')}</button>}</td></tr>)}</tbody></table></div>}
  {tab==='inspections'&&<>{eventTable('inspection',['driver','location','severity'])}<h3 className="ops-subhead">{__('Нарушения (CSA)')}</h3>{eventTable('violation',['driver','location','severity'])}</>}
  {tab==='accidents'&&eventTable('accident',['driver','location','severity','cost'])}
  {tab==='maintenance'&&eventTable('maintenance',['cost'])}
  </LoadingBoundary></section>
 </section>;
}

// ---------------- Broker updates (updater)
const kindLabels={eta:'ETA',traffic:__('Пробки на маршруте'),truck_issue:__('Поломка машины'),driver_health:__('Здоровье водителя'),delay:__('Задержка'),loaded:__('Загружен'),delivered:__('Доставлен'),other:__('Другое')};
const channelLabels={email:'Email',teams:'Microsoft Teams',telegram:'Telegram'},channelIcons={email:Mail,teams:MessagesSquare,telegram:Send};
const template=(kind,t)=>{const l=t.load,ref=`${l.id} ${l.origin} → ${l.destination}`;return {
 eta:`${ref}: driver ${t.driver} is on schedule. ETA ${date(t.delivery)}, within the appointment window.`,
 traffic:`${ref}: heavy traffic on the route. New ETA: . We will keep you posted.`,
 truck_issue:`${ref}: truck ${t.truck} has a mechanical issue, repair in progress. New ETA: . Next update within 2 hours.`,
 driver_health:`${ref}: driver ${t.driver} is not feeling well and is taking a rest break. New ETA: . We will update you shortly.`,
 delay:`${ref}: the load is delayed. Reason: . New ETA: .`,
 loaded:`${ref}: loaded. ETA ${date(t.delivery)}.`,
 delivered:`${ref}: delivered. POD will follow shortly.`,
 other:`${ref}: `}[kind]};
// Delivery of each channel by the background worker; 'demo' means the channel has no connection yet.
const deliveryLabels={queued:__('В очереди'),sent:__('Отправлено'),demo:__('Демо'),failed:__('Ошибка')};
const DUE_HOURS=4;
export function BrokerUpdatesPage({state,onAction}){
 const trips=state.trips.filter(t=>['planned','in_transit','delivered'].includes(t.status)),updates=state.brokerUpdates;
 const last=t=>updates.find(u=>u.trip_id===t.id),due=t=>t.status==='in_transit'&&(!last(t)||Date.now()-Date.parse(last(t).created_at)>DUE_HOURS*3600000);
 const [selectedId,setSelectedId]=useState(()=>(trips.find(due)||trips[0])?.id),selected=trips.find(t=>t.id===selectedId);
 const [kind,setKind]=useState('eta'),[body,setBody]=useState(()=>selected?template('eta',selected):''),[channels,setChannels]=useState(['email','teams','telegram']),[error,setError]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
 const pick=(t,k=kind)=>{setSelectedId(t.id);setKind(k);setBody(template(k,t));setError('');setSent(false)};
 const toggle=c=>setChannels(channels.includes(c)?channels.filter(x=>x!==c):[...channels,c]);
 return <section className="ops-page">
  <Kpis items={[[Car,__('В пути'),trips.filter(t=>t.status==='in_transit').length],[Clock,__('Нужно обновление'),trips.filter(due).length,trips.some(due)?'warn':''],[Send,__('Обновлений за 24 ч'),updates.filter(u=>Date.now()-Date.parse(u.created_at)<86400000).length]]}/>
  <div className="ops-split">
   <section className="panel ops-list"><h2 className="ops-panel-title">{__('Рейсы после погрузки')}</h2>{trips.length?trips.map(t=><button key={t.id} className={'ops-row '+(t.id===selectedId?'active':'')} onClick={()=>pick(t)}><span><strong>{t.load.origin} → {t.load.destination}</strong><small>{t.load.broker} · {t.driver} · {t.truck}</small></span><span className="ops-row-meta"><span className={'badge '+t.status}>{tripLabels[t.status]}</span>{due(t)?<small className="ops-bad">{__('Нужно обновление')}</small>:last(t)&&<small>{ago(last(t).created_at)}</small>}</span></button>):<p className="fleet-empty">{__('Нет активных рейсов')}</p>}</section>
   {selected&&<section className="panel ops-compose"><h2 className="ops-panel-title">{__('Обновление брокеру')} · {selected.load.broker}</h2><p className="ops-note">{selected.load.contact||'—'} · {selected.load.id}</p>
    <div className="ops-kinds" role="group" aria-label={__('Тип обновления')}>{state.updateKinds.map(k=><button key={k} className={'ops-chip '+(kind===k?'active':'')} onClick={()=>{setKind(k);setBody(template(k,selected));setSent(false)}}>{kindLabels[k]}</button>)}</div>
    <label className="form-label">{__('Текст')}<textarea rows={4} value={body} onChange={e=>{setBody(e.target.value);setSent(false)}}/></label>
    <div className="ops-channels" role="group" aria-label={__('Каналы')}>{state.updateChannels.map(c=>{const Icon=channelIcons[c];return <label key={c} className={'ops-chip '+(channels.includes(c)?'active':'')}><input type="checkbox" checked={channels.includes(c)} onChange={()=>toggle(c)}/><Icon size={13}/>{channelLabels[c]}</label>})}</div>
    {error&&<p className="chat-error" role="alert">{error}</p>}{sent&&<p className="fleet-success">{__('Записано в историю рейса (демо: внешняя отправка не подключена)')}</p>}
    <div className="ops-actions"><span className="ops-note">{__('Демо: email, Teams и Telegram пока не подключены')}</span><button className="button primary" disabled={busy||!channels.length||body.trim().length<5} onClick={async()=>{setBusy(true);setError('');const r=await onAction('/updates','POST',{tripId:selected.id,kind,body,channels});setBusy(false);if(r.ok)setSent(true);else setError(r.error)}}><Send size={14}/>{__('Отправить брокеру')}</button></div>
    <h3 className="ops-subhead">{__('История обновлений')}</h3>
    <ul className="ops-history">{updates.filter(u=>u.trip_id===selected.id).map(u=><li key={u.id}><span className="ops-chip active">{kindLabels[u.kind]}</span><p>{u.body}</p><small>{fmtDate(u.created_at,undefined,'datetime')}{u.deliveries?.length?'':' · '+u.channels.map(c=>channelLabels[c]).join(', ')}{u.author?' · '+u.author:''}</small>{u.deliveries?.length>0&&<span className="ops-deliveries">{u.deliveries.map(d=><span key={d.channel} className={'ops-delivery '+d.status} title={d.error||undefined}>{channelLabels[d.channel]} · {deliveryLabels[d.status]||d.status}</span>)}</span>}</li>)}{!updates.some(u=>u.trip_id===selected.id)&&<li className="ops-note">{__('Обновлений ещё не было')}</li>}</ul>
   </section>}
  </div>
 </section>;
}

// ---------------- Email guard: risky broker emails are quarantined; links are shown as text only.
const reasonText=r=>({free_mail:__('Бесплатная почта ({0}) вместо домена брокера',[r.value]),lookalike:__('Домен похож на {0}, но не совпадает',[r.value]),name_mismatch:__('Имя брокера не совпадает с доменом {0}',[r.value]),reply_to:__('Ответ уходит на другой адрес: {0}',[r.value]),high_rate:__('Ставка на {0}% выше рынка для обычного груза',[r.value]),foreign_link:__('Ссылки на сторонние сайты: {0}',[r.value]),pressure:__('Давление: срочность, просьба войти или прислать пароль')})[r.code]||r.code;
const riskLabels={high:__('Карантин'),medium:__('Проверить'),low:__('Чисто')};
// Every URL becomes plain text: never an <a>, so nothing in a broker email can be clicked.
const safeBody=text=>text.split(/(\bhttps?:\/\/[^\s<>"')]+)/gi).map((part,i)=>i%2?<span key={i} className="ops-link-off" title={__('Ссылка отключена')}><LinkIcon size={11}/>{(()=>{try{return new URL(part).hostname}catch{return part}})()}</span>:part);
export function MailGuardPage({state,onAction}){
 const {emails,marketRpm}=state.inbox,[filter,setFilter]=useState('all'),[selectedId,setSelectedId]=useState(emails[0]?.id),[busy,setBusy]=useState(false);
 const bucket=e=>e.status==='blocked'?'blocked':e.status==='safe'?'low':e.risk;
 const list=useMemo(()=>emails.filter(e=>filter==='all'||bucket(e)===filter),[emails,filter]),selected=emails.find(e=>e.id===selectedId);
 const set=async status=>{setBusy(true);await onAction('/inbox/'+selected.id,'PATCH',{status});setBusy(false)};
 const count=b=>emails.filter(e=>bucket(e)===b).length;
 return <section className="ops-page">
  <Kpis items={[[Inbox,__('Писем от брокеров'),emails.length],[ShieldAlert,__('В карантине'),count('high'),count('high')?'bad':''],[AlertTriangle,__('Проверить'),count('medium'),count('medium')?'warn':''],[ShieldCheck,__('Чистые'),count('low')]]}/>
  <div className="info-note ops-banner"><LinkIcon size={16}/><span>{__('Ссылки в письмах отключены: показан только адрес сайта, открыть его нельзя. Не вводите почту и пароль по ссылкам из писем.')}</span></div>
  <div className="ops-split">
   <section className="panel ops-list"><div className="fleet-toolbar"><Tabs value={filter} onChange={setFilter} tabs={[['all',__('Все'),emails.length],['high',riskLabels.high,count('high')],['medium',riskLabels.medium,count('medium')],['low',riskLabels.low,count('low')],['blocked',__('Заблокированы'),count('blocked')]]}/></div>
    {list.map(e=><button key={e.id} className={'ops-row '+(e.id===selectedId?'active':'')} onClick={()=>setSelectedId(e.id)}><span><strong>{e.sender_name} <small>{e.sender_email}</small></strong><small>{e.subject}</small></span><span className="ops-row-meta"><span className={'ops-risk '+bucket(e)}>{bucket(e)==='blocked'?__('Заблокирован'):riskLabels[bucket(e)]}</span><small>{ago(e.received_at)}</small></span></button>)}
    {!list.length&&<p className="fleet-empty">{__('Писем нет')}</p>}</section>
   {selected&&<section className="panel ops-compose"><div className="ops-mail-head"><div><h2 className="ops-panel-title">{selected.subject}</h2><p className="ops-note">{selected.sender_name} &lt;{selected.sender_email}&gt;{selected.reply_to&&<> · Reply-To: {selected.reply_to}</>}</p></div><span className={'ops-risk big '+bucket(selected)}>{__('Риск {0}/100',[selected.score])}</span></div>
    {selected.rate&&<div className="ops-mail-load"><span>{selected.origin} → {selected.destination}</span><span>{number(selected.miles)} mi</span><strong>{money(selected.rate)}</strong><span>${selected.rpm}/mi · {__('рынок')} ${marketRpm}/mi</span></div>}
    {selected.reasons.length?<ul className="ops-reasons">{selected.reasons.map(r=><li key={r.code}><AlertTriangle size={13}/>{reasonText(r)}</li>)}</ul>:<p className="fleet-success"><CheckCircle2 size={13}/> {__('Признаков мошенничества не найдено')}</p>}
    <div className="ops-mail-body">{safeBody(selected.body)}</div>
    <div className="ops-actions">{selected.risk!=='low'&&selected.status!=='safe'&&<span className="ops-note">{__('Не бронируйте груз, пока не проверите брокера по телефону из FMCSA.')}</span>}
     {selected.status!=='new'&&<button className="text-button" disabled={busy} onClick={()=>set('new')}>{__('Сбросить')}</button>}
     {selected.status!=='safe'&&<button className="button secondary" disabled={busy} onClick={()=>set('safe')}><ShieldCheck size={14}/>{__('Отправитель проверен')}</button>}
     {selected.status!=='blocked'&&<button className="button primary danger-button" disabled={busy} onClick={()=>set('blocked')}><Ban size={14}/>{__('Заблокировать отправителя')}</button>}</div>
   </section>}
  </div>
 </section>;
}
