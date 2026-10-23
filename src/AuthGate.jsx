import React,{useEffect,useState} from 'react';
import {Route,LogIn,KeyRound,UserPlus,AlertCircle,Building2,Rocket} from 'lucide-react';
import {__,translateDeep} from './i18n.js';
import LangSwitch from './LangSwitch.jsx';
import './auth.css';

const roleLabel=role=>({owner:__('Владелец'),dispatcher:__('Диспетчер'),viewer:__('Наблюдатель')})[role]||role;
async function post(path,body){const r=await fetch('/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?translateDeep(data.error):__('Ошибка сервера'));return data}
const screenPath=()=>window.location.pathname.replace(/\/+$/,'');
const inviteToken=()=>window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]{20,})\/?$/)?.[1]??null;

function Shell({company,icon:Icon,title,subtitle,children}){
 return <div className="auth-page"><div className="auth-main">
  <header className="auth-top"><div className="auth-brand"><span className="sidebar-logo"><Route size={20}/></span><strong>{company?.name||'Lanilot'}</strong></div><LangSwitch/></header>
  <section className="auth-card" aria-labelledby="auth-title">
   <span className="auth-icon"><Icon size={20}/></span><h1 id="auth-title">{title}</h1>{subtitle&&<p className="auth-subtitle">{subtitle}</p>}{children}
  </section><p className="auth-footer">Lanilot · {__('Рабочее место диспетчера')}</p>
 </div><AuthVisual/></div>;
}
// Right half of the sign-in screens: a product picture, hidden on narrow screens.
function AuthVisual(){
 const route='M70 250 C150 180 230 210 300 160 S430 90 520 120';
 return <aside className="auth-visual" aria-hidden="true">
  <div className="auth-visual-copy"><h2>{__('Грузы, водители и прибыль — в одном окне')}</h2><p>{__('Lanilot находит выгодные грузы, считает прибыль рейса и ведёт переписку с брокерами.')}</p></div>
  <div className="auth-scene">
   <svg viewBox="0 0 590 330" className="auth-map">
    <defs><pattern id="auth-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#ffffff2e"/></pattern>
     <linearGradient id="auth-route" x1="0" x2="1"><stop offset="0" stopColor="#9fc0ff"/><stop offset="1" stopColor="#ffffff"/></linearGradient></defs>
    <path d="M40 120 L120 70 L250 60 L330 40 L420 55 L500 40 L560 90 L545 170 L500 230 L470 300 L420 270 L330 280 L260 300 L200 260 L120 250 L60 210 Z" fill="url(#auth-dots)" stroke="#ffffff40" strokeWidth="1.5"/>
    <path d={route} fill="none" stroke="#ffffff30" strokeWidth="10" strokeLinecap="round"/>
    <path d={route} fill="none" stroke="url(#auth-route)" strokeWidth="3" strokeLinecap="round" strokeDasharray="8 8" className="auth-route-line"/>
    <path d="M130 120 C210 100 260 230 360 230" fill="none" stroke="#ffffff55" strokeWidth="2" strokeDasharray="4 7"/>
    {[[70,250],[520,120],[130,120],[360,230]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="11" fill="#ffffff26"/><circle cx={x} cy={y} r="5" fill="#fff"/></g>)}
    <g className="auth-truck"><rect x="-17" y="-10" width="34" height="20" rx="6" fill="#fff"/><path d="M-8 0h12m-4-4 4 4-4 4" stroke="#2858ef" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
   </svg>
   <div className="auth-float auth-float-load"><small>LD-2046 · {__('В пути')}</small><strong>Chicago, IL → Dallas, TX</strong><span><i style={{width:'64%'}}/></span></div>
   <div className="auth-float auth-float-profit"><small>{__('Прибыль рейса')}</small><strong>+$1,240</strong><em>$3.18 / mi</em></div>
   <div className="auth-float auth-float-broker"><small>{__('Брокер проверен')}</small><strong>C.H. Robinson</strong><em>{__('Факторинг одобрен')}</em></div>
  </div>
 </aside>;
}
function Field({label,...props}){return <label className="form-label">{label}<input {...props}/></label>}

function Login({company,signup}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <Shell company={company} icon={LogIn} title={__('Вход в кабинет')} subtitle={__('Войдите, чтобы продолжить работу.')}>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await post('/auth/login',{email,password});window.location.replace('/')}catch(err){setError(err.message);setBusy(false)}}}>
   <Field label="Email" type="email" autoComplete="email" required autoFocus value={email} onChange={e=>setEmail(e.target.value)}/>
   <Field label={__('Пароль')} type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
   {error&&<p className="chat-error" role="alert">{error}</p>}
   <button className="button primary full" disabled={busy}>{busy?__('Входим…'):__('Войти')}</button>
  </form>{signup?<p className="auth-switch">{__('Нет аккаунта?')} <a href="/signup">{__('Зарегистрироваться')}</a></p>:<p className="auth-hint">{__('Нет доступа? Попросите владельца компании прислать приглашение.')}</p>}</Shell>;
}
function Register(){
 const [form,setForm]=useState({name:'',company:'',email:'',password:'',demo:true}),[error,setError]=useState(''),[busy,setBusy]=useState(false);const set=k=>e=>setForm({...form,[k]:e.target.value});
 return <Shell company={null} icon={Rocket} title={__('Регистрация компании')} subtitle={__('Создайте кабинет для своей компании — вы станете его владельцем.')}>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await post('/auth/register',form);window.location.replace('/')}catch(err){setError(err.message);setBusy(false)}}}>
   <Field label={__('Имя и фамилия')} required autoFocus autoComplete="name" value={form.name} onChange={set('name')}/>
   <Field label={__('Название компании')} required autoComplete="organization" value={form.company} onChange={set('company')}/>
   <Field label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')}/>
   <Field label={__('Пароль (от 8 символов)')} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')}/>
   <label className="auth-check"><input type="checkbox" checked={form.demo} onChange={e=>setForm({...form,demo:e.target.checked})}/><span>{__('Заполнить кабинет демо-данными (грузы, водители, рейсы)')}</span></label>
   {error&&<p className="chat-error" role="alert">{error}</p>}
   <button className="button primary full" disabled={busy}>{busy?__('Создаём кабинет…'):__('Создать кабинет')}</button>
  </form><p className="auth-switch">{__('Уже есть аккаунт?')} <a href="/login">{__('Войти')}</a></p></Shell>;
}
function Setup({company,signup}){
 const [form,setForm]=useState({setupToken:'',name:'',email:'',password:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);const set=k=>e=>setForm({...form,[k]:e.target.value});
 return <Shell company={company} icon={KeyRound} title={__('Создание владельца')} subtitle={__('В компании ещё нет пользователей. Код настройки выводится в логах сервера при запуске.')}>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await post('/auth/setup',form);window.location.replace('/')}catch(err){setError(err.message);setBusy(false)}}}>
   <Field label={__('Код настройки')} required autoFocus autoComplete="off" value={form.setupToken} onChange={set('setupToken')}/>
   <Field label={__('Имя и фамилия')} required autoComplete="name" value={form.name} onChange={set('name')}/>
   <Field label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')}/>
   <Field label={__('Пароль (от 8 символов)')} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')}/>
   {error&&<p className="chat-error" role="alert">{error}</p>}
   <button className="button primary full" disabled={busy}>{__('Создать владельца')}</button>
  </form><p className="auth-switch"><a href="/login">{__('Войти')}</a>{signup&&<> · <a href="/signup">{__('Зарегистрировать компанию')}</a></>}</p></Shell>;
}
function AcceptInvite({company:hostCompany,token}){
 const [invite,setInvite]=useState(null),[error,setError]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 const company=invite?.company||hostCompany;
 useEffect(()=>{fetch('/api/auth/invites/'+token).then(async r=>{const d=await r.json();if(!r.ok)throw Error(translateDeep(d.error));setInvite(d)}).catch(e=>setError(e.message))},[token]);
 return <Shell company={company} icon={UserPlus} title={__('Приглашение в компанию')} subtitle={invite?__('{0} · роль: {1}',[invite.email,roleLabel(invite.role)]):null}>
  {!invite?(error?<><p className="chat-error" role="alert">{error}</p><a className="button secondary full" href="/">{__('Ко входу')}</a></>:<p className="auth-hint">{__('Проверяем приглашение…')}</p>)
  :<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await post('/auth/invites/'+token+'/accept',{name,password});window.location.replace('/')}catch(err){setError(err.message);setBusy(false)}}}>
   {invite.existingUser?<p className="auth-hint">{__('У вас уже есть аккаунт Lanilot — введите его пароль.')}</p>:<Field label={__('Имя и фамилия')} required autoFocus autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/>}
   <Field label={invite.existingUser?__('Пароль'):__('Пароль (от 8 символов)')} type="password" required minLength={invite.existingUser?1:8} autoComplete={invite.existingUser?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/>
   {error&&<p className="chat-error" role="alert">{error}</p>}
   <button className="button primary full" disabled={busy}>{__('Принять приглашение')}</button>
  </form>}</Shell>;
}

// Decides what to show before the workspace: company check, sign-in, owner setup or an invitation.
export default function AuthGate({render}){
 const [view,setView]=useState({kind:'loading'});
 useEffect(()=>{(async()=>{
  const t=await fetch('/api/tenant');if(t.status===404)return setView({kind:'missing'});const tenant=await t.json();
  if(tenant.company?.status==='suspended')return setView({kind:'suspended',company:tenant.company});
  const token=inviteToken();if(token)return setView({kind:'invite',company:tenant.company,token});
  const signup=!!tenant.auth.signup,path=screenPath();
  if(path==='/signup'&&signup)return setView({kind:'register'});
  if(tenant.auth.setupRequired&&path!=='/login')return setView({kind:'setup',company:tenant.company,signup});
  const me=await fetch('/api/auth/me');if(me.status===401)return setView({kind:'login',company:signup?null:tenant.company,signup});
  if(['/login','/signup'].includes(path))window.history.replaceState(null,'','/');
  setView({kind:'ready',session:await me.json()});
 })().catch(()=>setView({kind:'error'}))},[]);
 if(view.kind==='ready')return render(view.session);
 if(view.kind==='login')return <Login company={view.company} signup={view.signup}/>;
 if(view.kind==='register')return <Register/>;
 if(view.kind==='setup')return <Setup company={view.company} signup={view.signup}/>;
 if(view.kind==='invite')return <AcceptInvite company={view.company} token={view.token}/>;
 if(view.kind==='loading')return <div className="auth-page auth-page-loading"><div className="auth-loading" aria-label={__('Загрузка')}/></div>;
 const text={missing:[__('Компания не найдена'),__('Проверьте адрес кабинета.')],suspended:[__('Доступ приостановлен'),__('Обратитесь к администратору платформы.')],error:[__('Сервер недоступен'),__('Обновите страницу через минуту.')]}[view.kind];
 return <Shell company={view.company} icon={view.kind==='missing'?Building2:AlertCircle} title={text[0]} subtitle={text[1]}/>;
}
export {roleLabel};
