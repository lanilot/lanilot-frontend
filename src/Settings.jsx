import {__} from './i18n.js';
import ProfitBreakdown from './ProfitBreakdown.jsx';
import React,{useEffect,useState} from 'react';
import {Building2,Calculator,Save,RotateCcw,Info,Contact,Truck,LayoutGrid,Users as UsersIcon,Palette,Upload,Trash2,ExternalLink} from 'lucide-react';
import {Choice,label} from './Onboarding.jsx';
import {fmtDate,translateDeep} from './i18n.js';
import SearchSelect from './SearchSelect.jsx';
import {calculateProfit} from '../server/domain.js';
import {money} from './ui.js';
const costFields=[['fuelPrice',__("Топливо, $/gal"),.01,0,100],['mpg',__("Расход, MPG"),.1,.1,100],['driverPerMile',__("Водитель, $/mi"),.01,0,100],['tolls',__("Платные дороги, $"),1,0,100000],['factoringPercent',__("Факторинг, %"),.1,0,100],['other',__("Прочие расходы, $"),1,0,100000]];
const profileFields=[['name',__("Название компании"),120],['legalName',__("Юридическое название"),160],['businessType',__("Тип деятельности")],['mc','MC',10],['dot','DOT',10],['website',__("Сайт"),200],['address',__("Адрес"),200],['city',__("Город и штат"),100],['timezone',__("Часовой пояс компании")]];
const contactFields=[['contactName',__("Контактное лицо"),100],['email','Email',160],['phone',__("Телефон"),40]];
const planLabel=plan=>({trial:__("Пробный период")})[plan]||plan;
// Settings of the whole company: profile and requisites, contacts, workspace, fleet and workflow, trip costs.
const presets=['#2858ef','#0f766e','#7c3aed','#c2410c','#be123c','#1f2937','#15803d','#0369a1'];
// Spoken names for the preset swatches, so they can be picked by voice ("click green").
const presetNames={'#2858ef':()=>__('Синий'),'#0f766e':()=>__('Бирюзовый'),'#7c3aed':()=>__('Фиолетовый'),'#c2410c':()=>__('Оранжевый'),'#be123c':()=>__('Малиновый'),'#1f2937':()=>__('Графитовый'),'#15803d':()=>__('Зелёный'),'#0369a1':()=>__('Голубой')};
const baseDomain=()=>window.location.hostname.split('.').slice(-2).join('.');
// Logo upload goes straight to the server; the accent color and landing texts are saved with the form.
function Branding({draft,setBranding,brand,isOwner,workspace,onBrandChange,busy}){
 const [error,setError]=useState(''),[uploading,setUploading]=useState(false),b=draft.branding;
 const upload=async file=>{setError('');if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>512*1024){setError(__('Логотип: PNG, JPEG или WebP до 512 КБ'));return}
  setUploading(true);try{const r=await fetch('/api/settings/logo',{method:'PUT',headers:{'Content-Type':file.type},body:file});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?translateDeep(d.error):__('Ошибка сервера'));await onBrandChange()}catch(e){setError(e.message)}setUploading(false)};
 const remove=async()=>{setUploading(true);try{await fetch('/api/settings/logo',{method:'DELETE'});await onBrandChange()}finally{setUploading(false)}};
 const site=workspace.urls?.site??null;
 return <section className="panel settings-panel span-2"><div className="settings-heading"><Palette size={18}/><div><h2>{__("Брендинг")}</h2><p>{__("Логотип и цвет применяются к кабинету, экрану входа и странице компании.")}</p></div></div>
  <div className="brand-editor">
   <div className="brand-block"><span className="ob-group-title">{__("Логотип")}</span>
    <div className="brand-logo-row"><div className="brand-logo-preview">{brand?.logo?<img src={brand.logo} alt=""/>:<span>{__("Нет логотипа")}</span>}</div>
     <div className="brand-logo-actions"><label className={'button secondary'+(!isOwner||uploading?' disabled':'')}><Upload size={14}/>{uploading?__("Загружаем…"):__("Загрузить")}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!isOwner||uploading} onChange={e=>{upload(e.target.files[0]);e.target.value=''}}/></label>
      {brand?.logo&&<button type="button" className="button danger-outline" disabled={!isOwner||uploading} onClick={remove}><Trash2 size={14}/>{__("Удалить")}</button>}
      <small>{__("PNG, JPEG или WebP до 512 КБ. Лучше горизонтальный, на прозрачном фоне.")}</small></div></div>
    {error&&<p className="chat-error" role="alert">{error}</p>}</div>
   <div className="brand-block"><span className="ob-group-title">{__("Цвет бренда")}</span>
    <div className="brand-colors">{presets.map(c=><button type="button" key={c} className={b.color===c?'active':''} style={{background:c}} aria-label={__("Цвет: {0}",[presetNames[c]()])} title={presetNames[c]()} aria-pressed={b.color===c} disabled={busy} onClick={()=>setBranding('color',c)}/>)}
     <label className="brand-custom"><input type="color" value={b.color} disabled={busy} onChange={e=>setBranding('color',e.target.value)} aria-label={__("Свой цвет")}/><input value={b.color} maxLength={7} disabled={busy} onChange={e=>setBranding('color',e.target.value)} aria-label={__("Цвет в формате #RRGGBB")}/></label></div>
    <div className="brand-preview" style={{'--brand':/^#[0-9a-f]{6}$/i.test(b.color)?b.color:undefined}}><span className="brand-preview-chip">{draft.company.name}</span><button type="button" className="button primary" tabIndex={-1}>{__("Кнопка")}</button><a>{__("Ссылка")}</a></div></div>
  </div>
  <div className="brand-landing"><label className="auth-check"><input type="checkbox" checked={b.landingEnabled} disabled={busy} onChange={e=>setBranding('landingEnabled',e.target.checked)}/><span>{__("Показывать страницу компании на своём адресе")}{site&&<> — <a href={site} target="_blank" rel="noreferrer">{site.replace('https://','')} <ExternalLink size={11}/></a></>}</span></label>
   {b.landingEnabled&&<div className="settings-fields"><label className="form-label">{__("Заголовок страницы")}<input maxLength={120} disabled={busy} placeholder={__("Надёжные перевозки по США")} value={b.headline} onChange={e=>setBranding('headline',e.target.value)}/></label><label className="form-label">{__("Описание")}<textarea maxLength={600} disabled={busy} placeholder={__("Чем вы занимаетесь, по каким направлениям возите и почему с вами удобно работать.")} value={b.description} onChange={e=>setBranding('description',e.target.value)}/></label></div>}
   <p className="settings-note">{__("На странице также показываются контакты, MC/DOT и техника из профиля компании.")}</p></div>
 </section>;
}
// The company's own address <slug>.<domain>; the previous one keeps redirecting.
function SubdomainField({slug,urls,onChanged}){
 const [value,setValue]=useState(slug),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState('');
 useEffect(()=>{setValue(slug)},[slug]);
 const clean=value.trim().toLowerCase(),changed=clean!==slug;
 const save=async()=>{setBusy(true);setError('');setDone('');try{const r=await fetch('/api/settings/subdomain',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:clean})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?translateDeep(d.error):__("Ошибка сервера"));
  // On the old subdomain itself, move to the new address (sign-in is per address).
  const onOwn=new RegExp(`(^|\\.)${slug}\\.`);if(onOwn.test(window.location.hostname)){window.location.assign(`${window.location.protocol}//${window.location.host.replace(onOwn,`$1${d.slug}.`)}/login`);return}
  setDone(__("Адрес изменён. Старый адрес перенаправляет на новый."));await onChanged()}catch(e){setError(e.message)}setBusy(false)};
 return <div className="subdomain-field"><label className="form-label">{__("Адрес кабинета")}<span className="subdomain-input"><span>https://</span><input value={value} maxLength={32} disabled={busy} spellCheck={false} autoCapitalize="off" onChange={e=>{setValue(e.target.value.replace(/[^a-zA-Z0-9-]/g,''));setDone('');setError('')}}/><span>.{baseDomain()}</span></span></label>
  <div className="subdomain-actions"><button type="button" className="button secondary" disabled={busy||!changed||clean.length<3} onClick={save}>{busy?__("Сохраняем…"):__("Сохранить адрес")}</button>{urls?.site&&<a href={urls.site} target="_blank" rel="noreferrer">{__("Сайт")}: {urls.site.replace(/^https?:\/\//,'')}<ExternalLink size={11}/></a>}{urls?.dash&&<a href={urls.dash} target="_blank" rel="noreferrer">{__("Кабинет")}: {urls.dash.replace(/^https?:\/\//,'')}<ExternalLink size={11}/></a>}</div>
  {error&&<p className="chat-error" role="alert">{error}</p>}{done&&<p className="subdomain-done" role="status">{done}</p>}
  <small className="field-hint">{__("Латинские буквы, цифры и дефис. SSL-сертификат для нового адреса выпускается автоматически в течение 5 минут.")}</small></div>;
}
export default function Settings({settings,timezones,companyOptions,workspace,isOwner,brand,onBrandChange,onWorkspaceChange,onSave,onNavigate,busy}){
 const [draft,setDraft]=useState(()=>structuredClone(settings)),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const dirty=JSON.stringify(draft)!==JSON.stringify(settings);
 const updateCompany=(key,value)=>{setDraft(d=>({...d,company:{...d.company,[key]:value}}));setSaved(false)};
 const setBranding=(key,value)=>{setDraft(d=>({...d,branding:{...d.branding,[key]:value}}));setSaved(false)};
 const updateOps=key=>value=>{setDraft(d=>({...d,operations:{...d.operations,[key]:value}}));setSaved(false)};
 const updateCost=(key,value)=>{setDraft(d=>({...d,costs:{...d.costs,[key]:value===''?'':Number(value)}}));setSaved(false)};
 const field=([key,text,max])=>{
  if(key==='timezone')return <label className="form-label" key={key}>{text}<SearchSelect aria-label={text} disabled={busy} value={draft.company.timezone} onChange={e=>updateCompany('timezone',e.target.value)}>{timezones.map(zone=><option key={zone} value={zone}>{zone}</option>)}</SearchSelect></label>;
  if(key==='businessType')return <label className="form-label" key={key}>{text}<SearchSelect aria-label={text} disabled={busy} value={draft.company.businessType} onChange={e=>updateCompany('businessType',e.target.value)}><option value="">{__("Не указан")}</option>{companyOptions.role.map(r=><option key={r} value={r}>{label('role',r)}</option>)}</SearchSelect></label>;
  return <label className="form-label" key={key}>{text}<input name={key} type={key==='email'?'email':key==='phone'?'tel':'text'} inputMode={key==='mc'||key==='dot'?'numeric':undefined} required={key==='name'} maxLength={max} disabled={busy} value={draft.company[key]} onChange={e=>updateCompany(key,e.target.value)}/></label>;
 };
 const ops=draft.operations;
 let sample;try{sample=calculateProfit(2500,900,50,draft.costs)}catch{}
 return <form className="settings-page" onSubmit={async e=>{e.preventDefault();if(busy)return;setError('');setSaved(false);const result=await onSave(draft);if(result.ok){setDraft(result.settings);setSaved(true)}else setError(result.error)}}>
 <div className="settings-grid">
 <section className="panel settings-panel span-2"><div className="settings-heading"><Building2 size={18}/><div><h2>{__("Профиль компании")}</h2><p>{__("Название показывается в кабинете, при входе и в письмах брокерам.")}</p></div></div><div className="settings-fields three">{profileFields.map(field)}</div></section>
 <Branding draft={draft} setBranding={setBranding} brand={brand} isOwner={isOwner} workspace={workspace} onBrandChange={onBrandChange} busy={busy}/>
 <section className="panel settings-panel"><div className="settings-heading"><Contact size={18}/><div><h2>{__("Контакты")}</h2><p>{__("Для брокеров и уведомлений.")}</p></div></div><div className="settings-fields">{contactFields.map(field)}</div></section>
 <section className="panel settings-panel"><div className="settings-heading"><LayoutGrid size={18}/><div><h2>{__("Кабинет компании")}</h2><p>{__("Адрес входа и тариф.")}</p></div></div>
  {isOwner&&workspace.editableSlug&&<SubdomainField slug={workspace.slug} urls={workspace.urls} onChanged={onWorkspaceChange}/>}<dl className="settings-facts"><div><dt>{__("Вход")}</dt><dd>{window.location.host}</dd></div>{!(isOwner&&workspace.editableSlug)&&<div><dt>{__("Адрес кабинета")}</dt><dd>{workspace.slug?`${workspace.slug}.${baseDomain()}`:'—'}</dd></div>}<div><dt>{__("Тариф")}</dt><dd>{workspace.plan?planLabel(workspace.plan):'—'}</dd></div><div><dt>{__("Создан")}</dt><dd>{workspace.createdAt?fmtDate(workspace.createdAt,{day:'numeric',month:'short',year:'numeric'},'date'):'—'}</dd></div></dl>
  {isOwner&&<button type="button" className="button secondary" onClick={()=>onNavigate('users')}><UsersIcon size={14}/>{__("Пользователи и роли")}</button>}</section>
 <section className="panel settings-panel"><div className="settings-heading"><Truck size={18}/><div><h2>{__("Автопарк и работа")}</h2><p>{__("Помогает подбирать грузы и интеграции.")}</p></div></div>
  <div className="ob-group"><span className="ob-group-title">{__("Сколько у вас грузовиков?")}</span><Choice group="fleetSize" options={companyOptions.fleetSize} value={ops.fleetSize} onChange={updateOps('fleetSize')}/></div>
  <div className="ob-group"><span className="ob-group-title">{__("Типы техники")}</span><Choice multi group="equipment" options={companyOptions.equipment} value={ops.equipment} onChange={updateOps('equipment')}/></div>
  <div className="ob-group"><span className="ob-group-title">{__("Где вы сейчас берёте грузы?")}</span><Choice multi group="loadBoards" options={companyOptions.loadBoards} value={ops.loadBoards} onChange={updateOps('loadBoards')}/></div>
  <div className="ob-group"><span className="ob-group-title">{__("Какой ELD используете?")}</span><Choice group="eld" options={companyOptions.eld} value={ops.eld} onChange={updateOps('eld')}/></div>
  <div className="ob-group"><span className="ob-group-title">{__("Что хотите улучшить в первую очередь?")}</span><Choice multi group="goals" options={companyOptions.goals} value={ops.goals} onChange={updateOps('goals')}/></div>
 </section>
 <section className="panel settings-panel"><div className="settings-heading"><Calculator size={18}/><div><h2>{__("Калькулятор прибыли")}</h2></div></div><div className="settings-fields">{costFields.map(([key,label,step,min,max])=><label className="form-label" key={key}>{label}<input name={key} type="number" required min={min} max={max} step={step} disabled={busy} value={draft.costs[key]} onChange={e=>updateCost(key,e.target.value)}/></label>)}</div><details className="context-help"><summary>{__("Пример расчёта")}</summary><div className="settings-example"><span>{__("Пример: $2,500 · 900 mi + 50 mi DH")}</span><div><span>{__("Расходы")} <strong>{sample?money(sample.expenses):'—'}</strong></span><span>{__("Прибыль")} <strong>{sample?money(sample.profit):'—'}</strong></span></div>{sample&&<ProfitBreakdown load={{id:__("Пример"),origin:__("Маршрут"),destination:__("Доставка"),rate:2500,miles:900,deadhead:50}} rate={2500} costs={draft.costs} source={__("Текущие значения формы настроек")}/>}<small>{__("Без постоянных расходов и налогов")}</small></div></details><div className="info-note"><Info size={15}/><span>{__("Сохраните один раз — расходы применятся к новым расчётам.")}</span></div></section></div>
 <div className="settings-savebar"><span role="status">{error?<span className="negative">{error}</span>:saved?__("Настройки сохранены"):dirty?__("Есть несохранённые изменения"):__("Все изменения сохранены")}</span><div><button className="button secondary" type="button" disabled={busy||!dirty} onClick={()=>{setDraft(structuredClone(settings));setError('');setSaved(false)}}><RotateCcw size={14}/>{__("Отменить изменения")}</button><button className="button primary" type="submit" disabled={busy||!dirty}><Save size={14}/>{busy?__("Сохраняем…"):__("Сохранить настройки")}</button></div></div></form>
}
