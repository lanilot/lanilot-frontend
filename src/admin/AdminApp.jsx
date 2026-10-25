import React,{useCallback,useEffect,useState} from 'react';
import LogoMark from '../LogoMark.jsx';
import {Inbox,Mail,Phone,LayoutDashboard,Building2,Users,CreditCard,Filter,LogOut,RefreshCw,Search,X,ArrowUpRight,ArrowDownRight,Minus,ExternalLink,ShieldCheck,AlertTriangle} from 'lucide-react';
import {__,fmtDate,translateDeep} from '../i18n.js';
import LangSwitch from '../LangSwitch.jsx';
import SearchSelect from '../SearchSelect.jsx';
import {AreaChart,BarList,MiniColumns} from './charts.jsx';
import {label as answerLabel} from '../Onboarding.jsx';
import {productMeta} from '../Products.jsx';
import '../styles.css';
import '../controls.css';
import '../auth.css';
import './admin.css';

// Platform admin: product analytics (Metrika / YouTube Analytics style) and control over companies and subscriptions.
async function api(path,method='GET',body){const r=await fetch('/api/admin'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(d.error?translateDeep(d.error):__('Ошибка сервера')),{status:r.status});return d}
const num=v=>new Intl.NumberFormat('en-US').format(v);
const usd=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
const pct=v=>v===null||v===undefined?'—':`${Math.round(v*1000)/10}%`;
const day=v=>v?fmtDate(new Date(v.length===10?v+'T12:00:00':v),{day:'numeric',month:'short',year:'numeric'},'date'):'—';
const baseDomain=()=>window.location.hostname.replace(/^admin\./,'');
const companyUrl=slug=>`${window.location.protocol}//${slug==='app'?'app':slug}.${baseDomain()}${window.location.port?':'+window.location.port:''}`;
const statusLabel=s=>({active:__('Активна'),suspended:__('Приостановлена')})[s]||s;
const roleName=r=>({owner:__('Владелец'),dispatcher:__('Диспетчер'),updater:__('Апдейтер'),viewer:__('Наблюдатель')})[r]||r;
const stepName=s=>({contact:__('Контакты'),company:__('Компания'),fleet:__('Автопарк'),work:__('Работа'),account:__('Аккаунт создан')})[s]||s;
const requestStatus=s=>({new:__('Новая'),contacted:__('Связались'),scheduled:__('Демо назначено'),won:__('Клиент'),lost:__('Отказ')})[s]||s;
const requestTone={new:'info',contacted:'warn',scheduled:'warn',won:'active',lost:'muted'};
const periods=[[7,__('7 дней')],[30,__('30 дней')],[90,__('90 дней')],[365,__('Год')]];
const pages=[['overview',LayoutDashboard,()=>__('Обзор')],['requests',Inbox,()=>__('Заявки')],['companies',Building2,()=>__('Компании')],['users',Users,()=>__('Пользователи')],['subscriptions',CreditCard,()=>__('Подписки')],['funnel',Filter,()=>__('Воронка')]];

function Delta({value,previous,ratio}){
 if(value===null||previous===null||previous===undefined)return <span className="ad-delta flat"><Minus size={12}/>—</span>;
 const diff=ratio?(value-previous)*100:previous?((value-previous)/previous)*100:value?100:0,dir=Math.abs(diff)<.05?'flat':diff>0?'up':'down',Icon=dir==='up'?ArrowUpRight:dir==='down'?ArrowDownRight:Minus;
 return <span className={'ad-delta '+dir} title={__('По сравнению с предыдущим периодом')}><Icon size={12}/>{ratio?`${diff>0?'+':''}${Math.round(diff*10)/10} ${__('п.п.')}`:`${diff>0?'+':''}${Math.round(diff)}%`}</span>;
}
function Panel({title,hint,children,className=''}){return <section className={'ad-panel '+className}>{title&&<header><h3>{title}</h3>{hint&&<span>{hint}</span>}</header>}{children}</section>}

function Login({onDone}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <div className="ad-login"><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('/login','POST',{email,password});onDone()}catch(err){setError(err.message);setBusy(false)}}}>
  <div className="ad-logo"><span><LogoMark color="#2563eb"/></span><strong>lanilot<i>.</i></strong><em>admin</em></div>
  <h1>{__('Админ-панель платформы')}</h1><p>{__('Только для администраторов Lanilot.')}</p>
  <label className="form-label">Email<input type="email" required autoFocus autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label className="form-label">{__('Пароль')}<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {error&&<p className="chat-error" role="alert">{error}</p>}
  <button className="button primary full" disabled={busy}>{busy?__('Входим…'):__('Войти')}</button>
 </form><div className="ad-login-lang"><LangSwitch/></div></div>;
}

function Overview({days}){
 const [data,setData]=useState(null),[metric,setMetric]=useState('signups'),[error,setError]=useState('');
 useEffect(()=>{setData(null);api('/overview?days='+days).then(setData).catch(e=>setError(e.message))},[days]);
 if(error)return <p className="chat-error">{error}</p>;if(!data)return <div className="ad-loading"/>;
 const tiles=[['signups',__('Новые компании'),num],['activeUsers',__('Активные пользователи'),num],['activeCompanies',__('Активные компании'),num],['leads',__('Начали регистрацию'),num],['demoRequests',__('Заявки на демо'),num],['conversion',__('Конверсия регистрации'),pct]];
 const m=data.metrics,t=data.totals,chartMetric=metric==='conversion'?'leads':metric,current=tiles.find(x=>x[0]===chartMetric);
 const funnel=[{key:'started',label:__('Начали'),value:data.funnel.started},...data.funnel.steps.map(s=>({key:s.name,label:stepName(s.name),value:s.reached,hint:data.funnel.started?pct(s.reached/data.funnel.started):''}))];
 return <div className="ad-page">
  <div className="ad-tiles" role="tablist">{tiles.map(([key,text,fmt])=><button key={key} role="tab" aria-selected={metric===key} className={'ad-tile'+(metric===key?' active':'')} onClick={()=>setMetric(key)}>
   <span>{text}</span><strong>{fmt(m[key].value)}</strong><Delta value={m[key].value} previous={m[key].previous} ratio={key==='conversion'}/></button>)}</div>
  <div className="ad-grid-main">
   <Panel title={current[1]} hint={metric==='conversion'?__('График: начатые регистрации по дням'):__('По дням · пунктир — предыдущий период')} className="ad-chart-panel">
    <AreaChart dates={data.dates} current={data.series[chartMetric].current} previous={data.series[chartMetric].previous} label={current[1]} previousLabel={__('Предыдущий период')} format={num}/>
   </Panel>
   <div className="ad-side">
    <Panel><div className="ad-hero"><span>MRR</span><strong>{usd(t.mrr)}</strong><small>{__('Ежемесячная выручка по тарифам · ARR {0}',[usd(t.mrr*12)])}</small></div></Panel>
    <Panel><dl className="ad-facts"><div><dt>{__('Компании')}</dt><dd>{num(t.companies)}</dd></div><div><dt>{__('Активные')}</dt><dd>{num(t.active)}</dd></div><div><dt>{__('Приостановлены')}</dt><dd>{num(t.suspended)}</dd></div><div><dt>{__('На пробном периоде')}</dt><dd>{num(t.trials)}</dd></div><div><dt>{__('Демо-кабинеты')}</dt><dd>{num(t.sandboxes)}</dd></div><div><dt>{__('Пользователи')}</dt><dd>{num(t.users)}</dd></div></dl></Panel>
   </div>
  </div>
  <div className="ad-grid-3">
   <Panel title={__('Воронка регистрации')} hint={__('за период')}><BarList rows={funnel} format={num} empty={__('Нет данных за период')}/></Panel>
   <Panel title={__('Источники')} hint={__('начали → завершили')}><BarList rows={data.sources.map(s=>({label:s.source,value:s.started,hint:`${s.completed||0} ✓`}))} format={num} empty={__('Нет регистраций за период')}/></Panel>
   <Panel title={__('Тарифы')} hint={__('активные компании')}><BarList rows={data.plans.map(p=>({key:p.id,label:p.name,value:p.companies,hint:usd(p.mrr)}))} format={num} empty="—"/></Panel>
  </div>
 </div>;
}

function CompanyDrawer({id,plans,onClose,onChanged}){
 const [c,setC]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 const load=useCallback(()=>api('/companies/'+id).then(d=>{setC(d);setForm({plan:d.plan,status:d.status,slug:d.slug,trialEndsAt:d.trialEndsAt?d.trialEndsAt.slice(0,10):'',notes:d.notes||''})}).catch(e=>setError(e.message)),[id]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k)},[onClose]);
 const save=async()=>{setBusy(true);setError('');setSaved(false);try{await api('/companies/'+id,'PATCH',{plan:form.plan,status:form.status,notes:form.notes,...(form.slug!==c.slug?{slug:form.slug.trim().toLowerCase()}:{}),...(form.plan==='trial'?{trialEndsAt:form.trialEndsAt||null}:{})});await load();onChanged();setSaved(true)}catch(e){setError(e.message)}setBusy(false)};
 return <div className="ad-drawer-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="ad-drawer" role="dialog" aria-modal="true" aria-label={c?.name||__('Компания')}>
  <header><div><h2>{c?.name||'…'}</h2>{c&&<a href={companyUrl(c.slug)} target="_blank" rel="noreferrer">{c.slug}.{baseDomain()} <ExternalLink size={11}/></a>}</div><button className="icon-button" aria-label={__('Закрыть')} onClick={onClose}><X size={18}/></button></header>
  {!c?<div className="ad-loading"/>:<div className="ad-drawer-body">
   <div className="ad-mini-kpis">{[[__('Пользователи'),c.users],[__('Грузовики'),c.trucks],[__('Грузы'),c.loads],[__('Рейсы'),c.trips]].map(([k,v])=><div key={k}><span>{k}</span><strong>{num(v)}</strong></div>)}</div>
   <Panel title={__('Активность за 30 дней')} hint={__('пользователей в день · последний визит {0}',[day(c.lastActive)])}><MiniColumns dates={c.activity.dates} values={c.activity.users} label={__('Активность за 30 дней')}/></Panel>
   <Panel title={__('Подписка')}>
    <div className="ad-form">
     <label className="form-label">{__('Тариф')}<SearchSelect aria-label={__('Тариф')} value={form.plan} disabled={busy} onChange={e=>setForm({...form,plan:e.target.value})}>{Object.entries(plans).map(([k,p])=><option key={k} value={k}>{p.name} · {usd(p.price)}/{__('мес')}</option>)}</SearchSelect></label>
     {form.plan==='trial'&&<label className="form-label">{__('Пробный период до')}<input type="date" value={form.trialEndsAt} disabled={busy} onChange={e=>setForm({...form,trialEndsAt:e.target.value})}/></label>}
     <label className="form-label">{__('Статус')}<SearchSelect aria-label={__('Статус')} value={form.status} disabled={busy||c.id==='workspace'} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">{statusLabel('active')}</option><option value="suspended">{statusLabel('suspended')}</option></SearchSelect></label>
     {c.id!=='workspace'&&!c.sandbox&&<label className="form-label wide">{__('Адрес кабинета')}<span className="subdomain-input"><span>https://</span><input value={form.slug} maxLength={32} disabled={busy} spellCheck={false} onChange={e=>setForm({...form,slug:e.target.value.replace(/[^a-zA-Z0-9-]/g,'')})}/><span>.{baseDomain()}</span></span></label>}
     <label className="form-label wide">{__('Заметка (видна только админам)')}<textarea maxLength={2000} value={form.notes} disabled={busy} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    </div>
    {form.status==='suspended'&&c.status!=='suspended'&&<p className="ad-warn"><AlertTriangle size={14}/>{__('Все пользователи компании будут разлогинены и не смогут войти.')}</p>}
    {error&&<p className="chat-error" role="alert">{error}</p>}
    <div className="ad-actions"><span>{saved?__('Сохранено'):__('Оплата пока отмечается вручную — Stripe подключается на этапе 5.')}</span><button className="button primary" disabled={busy} onClick={save}>{busy?__('Сохраняем…'):__('Сохранить')}</button></div>
   </Panel>
   <Panel title={__('Продукты')} hint={__('Доступ компании наследуют все её сотрудники')}>
    <div className="ad-products">{['dash','erp','crm','fuel','safety','driver'].map(p=>{const m=productMeta(p),on=c.products.includes(p),req=c.productRequests.find(r=>r.product===p&&r.status==='new');return <label key={p} className={'ad-product'+(on?' is-on':'')}>
     <input type="checkbox" checked={on} disabled={busy} onChange={async e=>{setBusy(true);setError('');try{await api('/companies/'+id+'/products/'+p,'PUT',{enabled:e.target.checked});await load();onChanged()}catch(err){setError(err.message)}setBusy(false)}}/>
     <span><strong>{m.name}</strong>{req?<small className="ad-product-request">{__('Заявка: тариф {0} · {1}',[plans[req.plan]?.name??req.plan,day(req.created_at)])}</small>:<small>{on?__('Подключено'):__('Не подключено')}</small>}</span></label>})}</div>
   </Panel>
   <Panel title={__('Сотрудники')}><table className="ad-table compact"><tbody>{c.members.map(m=><tr key={m.id}><td><strong>{m.name}</strong><small>{m.email}</small></td><td>{roleName(m.role)}</td><td className="muted">{day(m.last_active)}</td></tr>)}</tbody></table></Panel>
   <Panel title={__('Профиль')}><dl className="ad-facts">
    {[[__('Создана'),day(c.createdAt)],[__('Владелец'),c.owner?`${c.owner.name} · ${c.owner.email}`:'—'],['MC / DOT',[c.profile?.mc,c.profile?.dot].filter(Boolean).join(' / ')||'—'],[__('Город'),c.profile?.city||'—'],[__('Телефон'),c.profile?.phone||'—'],[__('Автопарк'),c.operations?.fleetSize?answerLabel('fleetSize',c.operations.fleetSize):'—'],[__('Техника'),c.operations?.equipment?.join(', ')||'—'],['ELD',c.operations?.eld?answerLabel('eld',c.operations.eld):'—'],[__('Источник регистрации'),c.signup?.source||'—']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
   </dl></Panel>
  </div>}
 </aside></div>;
}

function Companies({plans,onOpen,version}){
 const [list,setList]=useState(null),[q,setQ]=useState(''),[status,setStatus]=useState(''),[plan,setPlan]=useState(''),[internal,setInternal]=useState(false);
 useEffect(()=>{const t=setTimeout(()=>api(`/companies?q=${encodeURIComponent(q)}&status=${status}&plan=${plan}&internal=${internal?1:''}`).then(setList),200);return()=>clearTimeout(t)},[q,status,plan,internal,version]);
 return <div className="ad-page">
  <div className="ad-filters"><label className="ad-search"><Search size={14}/><input placeholder={__('Название, адрес или email владельца')} value={q} onChange={e=>setQ(e.target.value)} aria-label={__('Поиск компаний')}/></label>
   <SearchSelect aria-label={__('Статус')} value={status} onChange={e=>setStatus(e.target.value)}><option value="">{__('Все статусы')}</option><option value="active">{statusLabel('active')}</option><option value="suspended">{statusLabel('suspended')}</option></SearchSelect>
   <SearchSelect aria-label={__('Тариф')} value={plan} onChange={e=>setPlan(e.target.value)}><option value="">{__('Все тарифы')}</option>{Object.entries(plans).map(([k,p])=><option key={k} value={k}>{p.name}</option>)}</SearchSelect>
   <label className="auth-check"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/><span>{__('Показать внутренние')}</span></label></div>
  <Panel>{!list?<div className="ad-loading"/>:list.length===0?<p className="ad-empty">{__('Компаний не найдено')}</p>:<div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>{__('Компания')}</th><th>{__('Владелец')}</th><th>{__('Тариф')}</th><th>{__('Статус')}</th><th className="num">{__('Польз.')}</th><th className="num">{__('Грузовики')}</th><th>{__('Активность 30д')}</th><th>{__('Последний визит')}</th><th>{__('Создана')}</th></tr></thead><tbody>
   {list.map(c=><tr key={c.id} className="clickable" tabIndex={0} onClick={()=>onOpen(c.id)} onKeyDown={e=>{if(e.key==='Enter')onOpen(c.id)}}>
    <td><strong>{c.name}{c.sandbox&&<span className="ad-badge sandbox">{__('Демо-доступ')}</span>}{c.productRequests>0&&<span className="ad-badge request">{__('Заявка на продукт')}</span>}</strong><small>{c.slug}{c.internal&&' · '+__('внутренняя')}</small></td><td>{c.owner?<><span>{c.owner.name}</span><small>{c.owner.email}</small></>:'—'}</td>
    <td><span className={'ad-badge plan-'+c.plan}>{plans[c.plan]?.name||c.plan}</span>{c.trialEndsAt&&<small>{__('до {0}',[day(c.trialEndsAt)])}</small>}</td>
    <td><span className={'ad-status '+c.status}>{statusLabel(c.status)}</span></td><td className="num">{c.users}</td><td className="num">{c.trucks}</td>
    <td><span className="ad-meter" title={__('{0} из 30 дней',[c.activeDays30])}><i style={{width:`${c.activeDays30/30*100}%`}}/></span><small>{__('{0} дн.',[c.activeDays30])}</small></td><td className="muted">{day(c.lastActive)}</td><td className="muted">{day(c.createdAt)}</td></tr>)}
  </tbody></table></div>}</Panel>
 </div>;
}

function UsersPage(){
 const [list,setList]=useState(null),[q,setQ]=useState('');
 useEffect(()=>{const t=setTimeout(()=>api('/users?q='+encodeURIComponent(q)).then(setList),200);return()=>clearTimeout(t)},[q]);
 return <div className="ad-page"><div className="ad-filters"><label className="ad-search"><Search size={14}/><input placeholder={__('Имя, email или компания')} value={q} onChange={e=>setQ(e.target.value)} aria-label={__('Поиск пользователей')}/></label></div>
  <Panel>{!list?<div className="ad-loading"/>:<div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>{__('Пользователь')}</th><th>{__('Компании и роли')}</th><th>{__('Последний визит')}</th><th>{__('Зарегистрирован')}</th></tr></thead><tbody>
   {list.map(u=><tr key={u.id}><td><strong>{u.name}{u.admin&&<span className="ad-badge admin"><ShieldCheck size={11}/>admin</span>}</strong><small>{u.email}</small></td><td><div className="ad-chips">{u.companies.map(c=><span key={c.id}>{c.name} · {roleName(c.role)}</span>)}{!u.companies.length&&'—'}</div></td><td className="muted">{day(u.last_active)}</td><td className="muted">{day(u.created_at)}</td></tr>)}
  </tbody></table></div>}</Panel></div>;
}

function Subscriptions({onOpen,version}){
 const [d,setD]=useState(null);useEffect(()=>{api('/subscriptions').then(setD)},[version]);
 if(!d)return <div className="ad-loading"/>;
 return <div className="ad-page">
  <div className="ad-plans">{d.plans.map(p=><Panel key={p.id} className={'ad-plan plan-'+p.id}><span>{p.name}</span><strong>{usd(p.price)}<small>/{__('мес')}</small></strong><dl><div><dt>{__('Компании')}</dt><dd>{p.companies}</dd></div><div><dt>MRR</dt><dd>{usd(p.mrr)}</dd></div><div><dt>{__('Лимиты')}</dt><dd>{p.trucks??'∞'} {__('груз.')} · {p.users??'∞'} {__('польз.')}</dd></div></dl></Panel>)}
   <Panel className="ad-plan total"><span>{__('Итого MRR')}</span><strong>{usd(d.mrr)}</strong><dl><div><dt>ARR</dt><dd>{usd(d.mrr*12)}</dd></div><div><dt>{__('Платящие')}</dt><dd>{d.paying.length}</dd></div></dl></Panel></div>
  <Panel title={__('Пробные периоды')} hint={__('сначала заканчивающиеся')}>{d.trials.length===0?<p className="ad-empty">{__('Нет компаний на пробном периоде')}</p>:<div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>{__('Компания')}</th><th>{__('Владелец')}</th><th>{__('Пробный период до')}</th><th>{__('Активность 30д')}</th><th className="num">{__('Грузовики')}</th></tr></thead><tbody>
   {d.trials.map(c=><tr key={c.id} className="clickable" tabIndex={0} onClick={()=>onOpen(c.id)} onKeyDown={e=>{if(e.key==='Enter')onOpen(c.id)}}><td><strong>{c.name}</strong><small>{c.slug}</small></td><td>{c.owner?.email||'—'}</td><td>{day(c.trialEndsAt)} {c.expired?<span className="ad-status suspended">{__('истёк')}</span>:c.endingSoon&&<span className="ad-status warn">{__('скоро')}</span>}</td><td>{__('{0} дн.',[c.activeDays30])}</td><td className="num">{c.trucks}</td></tr>)}
  </tbody></table></div>}</Panel>
  <p className="ad-note"><CreditCard size={14}/>{__('Оплата пока не подключена: тариф меняется вручную в карточке компании. Stripe — этап 5.')}</p>
 </div>;
}

function RequestCard({r,onSaved,onOpen}){
 const [notes,setNotes]=useState(r.notes),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async patch=>{setBusy(true);setError('');try{await api('/requests/'+r.id,'PATCH',patch);onSaved()}catch(e){setError(e.message)}setBusy(false)};
 return <article className="ad-request">
  <header><div><strong>{r.name}</strong><span>{r.company}</span></div><span className={'ad-status '+requestTone[r.status]}>{requestStatus(r.status)}</span></header>
  <div className="ad-request-contacts"><a href={'mailto:'+r.email}><Mail size={13}/>{r.email}</a>{r.phone&&<a href={'tel:'+r.phone.replace(/[^\d+]/g,'')}><Phone size={13}/>{r.phone}</a>}</div>
  <dl className="ad-request-meta"><div><dt>{__('Автопарк')}</dt><dd>{r.fleet_size?answerLabel('fleetSize',r.fleet_size):'—'}</dd></div><div><dt>{__('Источник')}</dt><dd>{r.source||'(direct)'}</dd></div><div><dt>{__('Язык')}</dt><dd>{r.lang||'—'}</dd></div><div><dt>{__('Получена')}</dt><dd>{day(r.created_at)}</dd></div></dl>
  {r.message&&<p className="ad-request-message">{r.message}</p>}
  {r.company_id&&<button type="button" className="ad-request-open" onClick={()=>onOpen(r.company_id)}><Building2 size={13}/>{__('Демо-кабинет посетителя')}</button>}
  <textarea aria-label={__('Заметка по заявке')} placeholder={__('Заметка: о чём договорились, дата демо…')} maxLength={2000} value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)} onBlur={()=>notes!==r.notes&&save({notes})}/>
  {error&&<p className="chat-error" role="alert">{error}</p>}
  <div className="ad-request-actions">{['new','contacted','scheduled','won','lost'].map(st=><button key={st} disabled={busy||st===r.status} className={st===r.status?'active':''} onClick={()=>save({status:st})}>{requestStatus(st)}</button>)}</div>
 </article>;
}
function Requests({onCount,onOpen,version}){
 const [d,setD]=useState(null),[status,setStatus]=useState('');
 const load=useCallback(()=>api('/requests'+(status?'?status='+status:'')).then(x=>{setD(x);onCount(x.counts.new||0)}),[status,onCount]);
 useEffect(()=>{load()},[load,version]);
 if(!d)return <div className="ad-loading"/>;
 const total=Object.values(d.counts).reduce((a,b)=>a+b,0);
 return <div className="ad-page">
  <div className="ad-periods ad-request-tabs" role="group" aria-label={__('Статус заявок')}>{[['',__('Все'),total],...['new','contacted','scheduled','won','lost'].map(st=>[st,requestStatus(st),d.counts[st]||0])].map(([k,t,n])=><button key={k||'all'} aria-pressed={status===k} className={status===k?'active':''} onClick={()=>setStatus(k)}>{t} <b>{n}</b></button>)}</div>
  {d.requests.length===0?<Panel><p className="ad-empty">{__('Заявок пока нет. Они приходят с формы демо-доступа на lanilot.com.')}</p></Panel>:<div className="ad-requests">{d.requests.map(r=><RequestCard key={r.id+r.updated_at} r={r} onSaved={load} onOpen={onOpen}/>)}</div>}
 </div>;
}

function Funnel({days}){
 const [d,setD]=useState(null);useEffect(()=>{setD(null);api('/funnel?days='+days).then(setD)},[days]);
 if(!d)return <div className="ad-loading"/>;
 const steps=[{name:'started',reached:d.started},...d.steps];
 const secs=s=>s==null?'—':s<90?`${Math.round(s)} ${__('с')}`:`${Math.round(s/60)} ${__('мин')}`;
 return <div className="ad-page">
  <Panel title={__('Воронка пошаговой регистрации')} hint={__('{0} начали за период',[num(d.started)])}>
   <div className="ad-funnel">{steps.map((s,i)=>{const share=d.started?s.reached/d.started:0,prev=i?steps[i-1].reached:s.reached,drop=prev?1-s.reached/prev:0;return <div key={s.name} className="ad-funnel-step">
    <div className="ad-funnel-head"><span>{i===0?__('Начали'):stepName(s.name)}</span><strong>{num(s.reached)}</strong></div>
    <div className="ad-funnel-bar"><i style={{height:`${Math.max(share*100,s.reached?3:0)}%`}}/></div>
    <div className="ad-funnel-foot"><b>{pct(share)}</b>{i>0&&<small className={drop>0?'down':''}>{drop>0?`−${Math.round(drop*100)}% ${__('ушли')}`:__('без потерь')}</small>}{i>0&&i<steps.length-1&&<small>{__('≈ {0} до шага',[secs(d.time[i-1]?.seconds)])}</small>}</div></div>})}</div>
  </Panel>
  <Panel title={__('Регистрации')} hint={__('последние 200 за период')}>{d.leads.length===0?<p className="ad-empty">{__('Нет регистраций за период')}</p>:<div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Email</th><th>{__('Дошёл до шага')}</th><th>{__('Статус')}</th><th>{__('Источник')}</th><th>{__('Язык')}</th><th>{__('Обновлено')}</th></tr></thead><tbody>
   {d.leads.map((l,i)=><tr key={i}><td><strong>{l.email||'—'}</strong><small>{l.name||''}</small></td><td>{l.status==='completed'?stepName('account'):l.step?stepName(['contact','company','fleet','work'][l.step-1]):__('Открыл форму')}</td><td><span className={'ad-status '+(l.status==='completed'?'active':'warn')}>{l.status==='completed'?__('Завершил'):__('Не завершил')}</span></td><td className="muted">{l.source||'(direct)'}</td><td className="muted">{l.lang||'—'}</td><td className="muted">{day(l.updated_at)}</td></tr>)}
  </tbody></table></div>}</Panel>
 </div>;
}

export default function AdminApp(){
 const [me,setMe]=useState(undefined),[newRequests,setNewRequests]=useState(0),[page,setPage]=useState(()=>pages.some(p=>p[0]===location.hash.slice(1))?location.hash.slice(1):'overview'),[days,setDays]=useState(30),[open,setOpen]=useState(null),[version,setVersion]=useState(0);
 const loadMe=()=>api('/me').then(m=>{setMe(m);setNewRequests(m.newRequests)}).catch(e=>setMe(e.status===401?null:false));
 useEffect(()=>{document.title='Lanilot Admin';loadMe()},[]);
 useEffect(()=>{location.hash=page},[page]);
 useEffect(()=>{const h=()=>{const p=location.hash.slice(1);if(pages.some(x=>x[0]===p)){setPage(p);setOpen(null)}};window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h)},[]);
 if(me===undefined)return <div className="ad-login"><div className="ad-loading"/></div>;
 if(me===null)return <Login onDone={loadMe}/>;
 if(me===false)return <div className="ad-login"><p className="chat-error">{__('Сервер недоступен')}</p></div>;
 const title=pages.find(p=>p[0]===page)[2]();
 return <div className="ad-shell">
  <aside className="ad-nav"><div className="ad-logo"><span><LogoMark color="#2563eb"/></span><strong>lanilot<i>.</i></strong><em>admin</em></div>
   <nav>{pages.map(([id,Icon,text])=><button key={id} className={page===id?'active':''} aria-current={page===id?'page':undefined} onClick={()=>setPage(id)}><Icon size={17}/>{text()}{id==='requests'&&newRequests>0&&<b aria-label={__('новых: {0}',[newRequests])}>{newRequests}</b>}</button>)}</nav>
   <div className="ad-me"><span>{me.user.name}<small>{me.user.email}</small></span><button className="icon-button" aria-label={__('Выйти')} title={__('Выйти')} onClick={async()=>{await api('/logout','POST');setMe(null)}}><LogOut size={16}/></button></div></aside>
  <main className="ad-main">
   <header className="ad-top"><h1>{title}</h1><div>
    {['overview','funnel'].includes(page)&&<div className="ad-periods" role="group" aria-label={__('Период')}>{periods.map(([d,t])=><button key={d} aria-pressed={days===d} className={days===d?'active':''} onClick={()=>setDays(d)}>{t}</button>)}</div>}
    <button className="icon-button" aria-label={__('Обновить')} title={__('Обновить')} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={16}/></button><LangSwitch/></div></header>
   <div key={version+page}>
    {page==='overview'&&<Overview days={days}/>}
    {page==='requests'&&<Requests onCount={setNewRequests} onOpen={setOpen} version={version}/>}
    {page==='companies'&&<Companies plans={me.plans} onOpen={setOpen} version={version}/>}
    {page==='users'&&<UsersPage/>}
    {page==='subscriptions'&&<Subscriptions onOpen={setOpen} version={version}/>}
    {page==='funnel'&&<Funnel days={days}/>}
   </div>
  </main>
  {open&&<CompanyDrawer id={open} plans={me.plans} onClose={()=>setOpen(null)} onChanged={()=>setVersion(v=>v+1)}/>}
 </div>;
}
