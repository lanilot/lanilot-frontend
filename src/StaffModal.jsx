import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,UserPlus,Save,Copy,ShieldCheck,Trash2} from 'lucide-react';
import {__,translateDeep} from './i18n.js';
import SearchSelect from './SearchSelect.jsx';
import useDialog from './useDialog.js';
import {roleLabel} from './AuthGate.jsx';

// Employee card: personal data, identity document, contacts, job and emergency contact.
const empty={lastName:'',firstName:'',middleName:'',birthDate:'',gender:'',citizenship:'',birthPlace:'',documentType:'passport',documentNumber:'',documentIssuer:'',documentIssued:'',documentExpires:'',taxId:'',email:'',phone:'',address:'',position:'',hireDate:'',emergencyName:'',emergencyPhone:'',notes:''};
const countries=['United States','Uzbekistan','Kazakhstan','Kyrgyzstan','Tajikistan','Turkmenistan','Russia','Ukraine','Belarus','Georgia','Armenia','Azerbaijan','Turkey','Canada','Mexico','Poland','Moldova'];
const documentTypes=()=>({passport:__('Паспорт'),id_card:__('ID-карта'),foreign_passport:__('Заграничный паспорт'),residence_permit:__('Вид на жительство'),green_card:'Green card'});
async function request(path,method='GET',body){const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?translateDeep(d.error):__('Ошибка сервера'));return d}

export default function StaffModal({id,email='',member=false,onClose,onDone}){
 const editing=!!id,[form,setForm]=useState({...empty,email}),[role,setRole]=useState('dispatcher'),[loaded,setLoaded]=useState(!editing);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState(''),[confirm,setConfirm]=useState(false);
 useDialog(true,onClose);
 useEffect(()=>{if(editing)request('/users/staff/'+id).then(d=>{setForm({...empty,...d});setLoaded(true)}).catch(e=>setError(e.message))},[id]);
 const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
 const field=(k,label,props={})=><label className={'form-label'+(props.wide?' wide':'')} key={k}><span>{label}{props.required&&<b aria-hidden="true"> *</b>}</span><input value={form[k]} onChange={set(k)} disabled={busy||props.readOnly} {...(({wide,readOnly,...rest})=>rest)(props)}/></label>;
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');
  try{
   if(editing){await request('/users/staff/'+id,'PUT',form);onDone(__('Карточка сотрудника сохранена'));return}
   const r=await request('/users/staff','POST',{...form,role});
   if(r.path){setLink(window.location.origin+r.path);onDone(null)}else onDone(__('Карточка сотрудника сохранена'));
  }catch(err){setError(err.message)}
  setBusy(false);
 };
 const title=editing?__('Карточка сотрудника'):member?__('Данные сотрудника'):__('Пригласить сотрудника');
 return createPortal(<div className="staff-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="staff-modal" role="dialog" aria-modal="true" aria-label={title}>
  <header><div><h2>{title}</h2><p>{link?__('Приглашение создано. Отправьте ссылку сотруднику — она действует 7 дней.'):__('Заполните данные как в документах. Поля со звёздочкой обязательны.')}</p></div><button type="button" className="icon-button" aria-label={__('Закрыть окно')} onClick={onClose}><X size={18}/></button></header>
  {link?<div className="staff-body"><div className="users-link"><code>{link}</code><button type="button" className="button secondary tiny" onClick={async()=>{try{await navigator.clipboard.writeText(link)}catch{}}}><Copy size={12}/>{__('Скопировать')}</button></div><p className="staff-note">{__('{0} · роль: {1}',[form.email,roleLabel(role)])}</p><footer><button type="button" className="button primary" onClick={onClose}>{__('Готово')}</button></footer></div>
  :!loaded?<div className="staff-body"><p className="staff-note">{error||__('Загружаем данные…')}</p></div>
  :<form className="staff-body" onSubmit={submit}>
   <fieldset><legend>{__('Личные данные')}</legend><div className="staff-grid">
    {field('lastName',__('Фамилия'),{required:true,autoFocus:true,maxLength:60,autoComplete:'off'})}{field('firstName',__('Имя'),{required:true,maxLength:60,autoComplete:'off'})}{field('middleName',__('Отчество'),{maxLength:60,autoComplete:'off'})}
    {field('birthDate',__('Дата рождения'),{required:true,type:'date'})}
    <label className="form-label">{__('Пол')}<SearchSelect aria-label={__('Пол')} disabled={busy} value={form.gender} onChange={set('gender')}><option value="">{__('Не указан')}</option><option value="male">{__('Мужской')}</option><option value="female">{__('Женский')}</option></SearchSelect></label>
    {field('citizenship',__('Гражданство'),{required:true,list:'staff-countries',maxLength:60})}
    {field('birthPlace',__('Место рождения'),{maxLength:120,wide:true})}
   </div></fieldset>
   <fieldset><legend>{__('Документ, удостоверяющий личность')}</legend><div className="staff-grid">
    <label className="form-label"><span>{__('Тип документа')}<b aria-hidden="true"> *</b></span><SearchSelect aria-label={__('Тип документа')} disabled={busy} value={form.documentType} onChange={set('documentType')}>{Object.entries(documentTypes()).map(([k,v])=><option key={k} value={k}>{v}</option>)}</SearchSelect></label>
    {field('documentNumber',__('Серия и номер'),{required:true,maxLength:30,autoComplete:'off'})}{field('documentIssuer',__('Кем выдан'),{maxLength:160})}
    {field('documentIssued',__('Дата выдачи'),{type:'date'})}{field('documentExpires',__('Действует до'),{type:'date'})}{field('taxId',__('ИНН / ПИНФЛ / SSN'),{maxLength:20,autoComplete:'off'})}
   </div><p className="staff-note"><ShieldCheck size={13}/>{__('Данные документов хранятся в зашифрованном виде и видны только владельцу.')}</p></fieldset>
   <fieldset><legend>{__('Контакты')}</legend><div className="staff-grid">
    {field('email','Email',{required:true,type:'email',maxLength:160,readOnly:editing||member,autoComplete:'off'})}{field('phone',__('Телефон'),{type:'tel',maxLength:40})}{field('address',__('Адрес проживания'),{maxLength:200})}
   </div></fieldset>
   <fieldset><legend>{__('Работа и доступ')}</legend><div className="staff-grid">
    {field('position',__('Должность'),{maxLength:80,placeholder:__('Диспетчер')})}{field('hireDate',__('Дата приёма'),{type:'date'})}
    {!editing&&!member&&<label className="form-label"><span>{__('Роль в Lanilot')}<b aria-hidden="true"> *</b></span><SearchSelect aria-label={__('Роль в Lanilot')} disabled={busy} value={role} onChange={e=>setRole(e.target.value)}>{['dispatcher','viewer','owner'].map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</SearchSelect></label>}
   </div></fieldset>
   <fieldset><legend>{__('Экстренный контакт')}</legend><div className="staff-grid">{field('emergencyName',__('Имя и родство'),{maxLength:100})}{field('emergencyPhone',__('Телефон'),{type:'tel',maxLength:40})}</div>
    <label className="form-label">{__('Примечание')}<textarea value={form.notes} maxLength={1000} disabled={busy} onChange={set('notes')}/></label></fieldset>
   <datalist id="staff-countries">{countries.map(c=><option key={c} value={c}/>)}</datalist>
   {error&&<p className="chat-error" role="alert">{error}</p>}
   <footer>
    {editing&&(confirm?<span className="lane-confirm">{__('Удалить карточку?')}<button type="button" className="text-button danger" disabled={busy} onClick={async()=>{setBusy(true);try{await request('/users/staff/'+id,'DELETE');onDone(__('Карточка удалена'))}catch(err){setError(err.message);setBusy(false)}}}>{__('Да')}</button><button type="button" className="text-button" onClick={()=>setConfirm(false)}>{__('Нет')}</button></span>:<button type="button" className="button danger-outline" disabled={busy} onClick={()=>setConfirm(true)}><Trash2 size={14}/>{__('Удалить карточку')}</button>)}
    <span className="staff-spacer"/>
    <button type="button" className="button secondary" disabled={busy} onClick={onClose}>{__('Отмена')}</button>
    <button className="button primary" disabled={busy}>{editing||member?<><Save size={14}/>{__('Сохранить')}</>:<><UserPlus size={14}/>{__('Пригласить')}</>}</button>
   </footer>
  </form>}
 </section></div>,document.body);
}
