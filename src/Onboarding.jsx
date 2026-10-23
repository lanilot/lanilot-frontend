import React,{useEffect,useState} from 'react';
import {Rocket,ArrowLeft,ArrowRight,Check} from 'lucide-react';
import {__,lang,translateDeep} from './i18n.js';
import {Shell,Field,SocialButtons} from './AuthShell.jsx';

// Step-by-step sign-up: every step is saved on the server, so the funnel shows where people stop.
const STORE='lanilot_onboarding';
const steps=[
 {key:'contact',label:()=>__('Контакты'),title:()=>__('Расскажите о себе'),subtitle:()=>__('Начнём с контактов — так мы сможем помочь с настройкой.')},
 {key:'company',label:()=>__('Компания'),title:()=>__('Ваша компания'),subtitle:()=>__('Название появится в кабинете и в письмах брокерам.')},
 {key:'fleet',label:()=>__('Автопарк'),title:()=>__('Автопарк'),subtitle:()=>__('Подберём грузы под вашу технику.')},
 {key:'work',label:()=>__('Работа'),title:()=>__('Как вы работаете сейчас'),subtitle:()=>__('Настроим источники грузов и интеграции.')},
 {key:'account',label:()=>__('Аккаунт'),title:()=>__('Пароль и запуск'),subtitle:()=>__('Последний шаг — и кабинет готов.')}
];
const labels={
 role:{fleet:()=>__('Перевозчик с автопарком'),owner_operator:()=>'Owner-operator',dispatch_service:()=>__('Диспетчерская служба'),broker:()=>__('Брокер')},
 fleetSize:{'1':()=>__('1 грузовик')},
 loadBoards:{'Direct brokers':()=>__('Напрямую от брокеров'),Other:()=>__('Другое')},
 eld:{samsara:()=>'Samsara',motive:()=>'Motive',other:()=>__('Другой'),none:()=>__('Нет ELD')},
 goals:{find_loads:()=>__('Быстрее находить грузы'),profit:()=>__('Контроль прибыли рейсов'),team:()=>__('Работа команды диспетчеров'),brokers:()=>__('Переписка с брокерами'),documents:()=>__('Документы и оплаты')}
};
export const label=(group,value)=>labels[group]?.[value]?.()??value;
const empty={contact:{name:'',email:'',phone:''},company:{company:'',role:'',mc:'',city:''},fleet:{fleetSize:'',equipment:[]},work:{loadBoards:[],eld:'',goals:[]}};
async function request(method,path,body){const r=await fetch('/api/onboarding'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(d.error?translateDeep(d.error):__('Ошибка сервера')),{status:r.status});return d}
const storage={get:()=>{try{return localStorage.getItem(STORE)}catch{return null}},set:v=>{try{v?localStorage.setItem(STORE,v):localStorage.removeItem(STORE)}catch{}}};
function source(){const p=new URLSearchParams(window.location.search);if(p.get('utm_source'))return [p.get('utm_source'),p.get('utm_campaign')].filter(Boolean).join(' / ');try{return document.referrer?new URL(document.referrer).host:''}catch{return ''}}

export function Choice({group,options,value,onChange,multi,cards}){
 const active=v=>multi?value.includes(v):value===v;
 const toggle=v=>onChange(multi?(value.includes(v)?value.filter(x=>x!==v):[...value,v]):v);
 return <div className={cards?'ob-cards':'ob-chips'} role="group">{options.map(v=><button type="button" key={v} aria-pressed={active(v)} className={active(v)?'active':''} onClick={()=>toggle(v)}>{cards&&<i>{active(v)&&<Check size={12}/>}</i>}{label(group,v)}</button>)}</div>;
}
function Group({title,hint,children}){return <div className="ob-group"><span className="ob-group-title">{title}{hint&&<small>{hint}</small>}</span>{children}</div>}

export default function Onboarding({providers=[]}){
 const [oauth,setOauth]=useState(null),[token,setToken]=useState(null),[options,setOptions]=useState(null),[index,setIndex]=useState(0),[done,setDone]=useState(0),[form,setForm]=useState(empty);
 const [account,setAccount]=useState({password:'',demo:true}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const start=async()=>{const d=await request('POST','',{source:source(),lang});storage.set(d.token);return d};
 const apply=(d,t)=>{setOauth(d.oauth||null);setToken(t);setOptions(d.options);setDone(d.step);setIndex(Math.min(d.step,steps.length-1));setForm(f=>Object.fromEntries(Object.entries(empty).map(([k,v])=>[k,{...v,...f[k],...d.data[k]}])))};
 useEffect(()=>{(async()=>{
  // Google/Apple sign-in for a new person hands over a started sign-up.
  const handed=new URLSearchParams(window.location.search).get('onboarding');if(handed){storage.set(handed);window.history.replaceState(null,'','/signup')}
  const saved=storage.get();
  if(saved){try{return apply(await request('GET','/'+saved),saved)}catch(e){if(e.status!==404)throw e;storage.set(null)}}
  const d=await start();apply(d,d.token);
 })().catch(e=>setError(e.message))},[]);
 const step=steps[index],set=(group,key)=>value=>setForm(f=>({...f,[group]:{...f[group],[key]:value}}));
 const input=(group,key)=>({value:form[group][key],onChange:e=>set(group,key)(e.target.value)});
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');
  try{
   if(step.key==='account'){await request('POST',`/${token}/complete`,oauth?{demo:account.demo}:account);storage.set(null);window.location.replace('/');return}
   const d=await request('PUT',`/${token}/${step.key}`,form[step.key]);setDone(d.step);setIndex(index+1);
  }catch(err){setError(err.message)}
  setBusy(false);
 };
 if(!options)return <Shell icon={Rocket} title={__('Регистрация компании')} subtitle={error||__('Готовим регистрацию…')} wide/>;
 return <Shell icon={Rocket} title={step.title()} subtitle={step.subtitle()} wide>
  <ol className="ob-progress" aria-label={__('Шаг {0} из {1}',[index+1,steps.length])}>{steps.map((s,i)=><li key={s.key} className={i===index?'current':i<done?'done':''}><button type="button" disabled={i>done||busy} onClick={()=>{setError('');setIndex(i)}}><span>{i<done&&i!==index?<Check size={11}/>:i+1}</span>{s.label()}</button></li>)}</ol>
  <form onSubmit={submit} noValidate={false}>
   {step.key==='contact'&&!oauth&&index===0&&<SocialButtons providers={providers}/>}
   {step.key==='contact'&&<>
    <Field label={__('Имя и фамилия')} required autoFocus autoComplete="name" maxLength={100} {...input('contact','name')}/>
    <Field label={__('Рабочий email')} type="email" required autoComplete="email" maxLength={160} readOnly={!!oauth} {...input('contact','email')}/>
    <Field label={__('Телефон (необязательно)')} type="tel" autoComplete="tel" maxLength={40} {...input('contact','phone')}/>
   </>}
   {step.key==='company'&&<>
    <Field label={__('Название компании')} required autoFocus autoComplete="organization" maxLength={100} {...input('company','company')}/>
    <Group title={__('Чем вы занимаетесь?')}><Choice cards group="role" options={options.role} value={form.company.role} onChange={set('company','role')}/></Group>
    <div className="ob-row"><Field label={__('MC или DOT (необязательно)')} inputMode="numeric" maxLength={12} {...input('company','mc')}/><Field label={__('Город (необязательно)')} autoComplete="address-level2" maxLength={100} placeholder="Chicago, IL" {...input('company','city')}/></div>
   </>}
   {step.key==='fleet'&&<>
    <Group title={__('Сколько у вас грузовиков?')}><Choice group="fleetSize" options={options.fleetSize} value={form.fleet.fleetSize} onChange={set('fleet','fleetSize')}/></Group>
    <Group title={__('Типы техники')} hint={__('можно несколько')}><Choice multi group="equipment" options={options.equipment} value={form.fleet.equipment} onChange={set('fleet','equipment')}/></Group>
   </>}
   {step.key==='work'&&<>
    <Group title={__('Где вы сейчас берёте грузы?')} hint={__('можно несколько')}><Choice multi group="loadBoards" options={options.loadBoards} value={form.work.loadBoards} onChange={set('work','loadBoards')}/></Group>
    <Group title={__('Какой ELD используете?')}><Choice group="eld" options={options.eld} value={form.work.eld} onChange={set('work','eld')}/></Group>
    <Group title={__('Что хотите улучшить в первую очередь?')} hint={__('можно несколько')}><Choice multi cards group="goals" options={options.goals} value={form.work.goals} onChange={set('work','goals')}/></Group>
   </>}
   {step.key==='account'&&<>
    <dl className="ob-summary"><div><dt>{__('Компания')}</dt><dd>{form.company.company}</dd></div><div><dt>Email</dt><dd>{form.contact.email}</dd></div></dl>
    {oauth?<p className="auth-hint">{oauth.provider==='apple'?__('Вы вошли через Apple — пароль не нужен.'):__('Вы вошли через Google — пароль не нужен.')}</p>:<Field label={__('Пароль (от 8 символов)')} type="password" required minLength={8} autoFocus autoComplete="new-password" value={account.password} onChange={e=>setAccount({...account,password:e.target.value})}/>}
    <label className="auth-check"><input type="checkbox" checked={account.demo} onChange={e=>setAccount({...account,demo:e.target.checked})}/><span>{__('Заполнить кабинет примерами (грузы, водители, рейсы)')}</span></label>
   </>}
   {error&&<p className="chat-error" role="alert">{error}</p>}
   <div className="ob-actions">
    {index>0&&<button type="button" className="button secondary" disabled={busy} onClick={()=>{setError('');setIndex(index-1)}}><ArrowLeft size={14}/>{__('Назад')}</button>}
    <button className="button primary" disabled={busy}>{step.key==='account'?(busy?__('Создаём кабинет…'):__('Создать кабинет')):<>{__('Далее')}<ArrowRight size={14}/></>}</button>
   </div>
  </form><p className="auth-switch">{__('Уже есть аккаунт?')} <a href="/login">{__('Войти')}</a></p></Shell>;
}
