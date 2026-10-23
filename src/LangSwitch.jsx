import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown,Check} from 'lucide-react';
import {LANGS,lang,setLang,__} from './i18n.js';
import {FLAGS} from './flags.js';
const Flag=({code})=><span className="lang-flag" dangerouslySetInnerHTML={{__html:FLAGS[code]}}/>;
// Interface language dropdown: flag + language name; choosing reloads the workspace in that language.
export default function LangSwitch(){
 const [open,setOpen]=useState(false),root=useRef(null),items=useRef([]);
 useEffect(()=>{if(!open)return;const close=e=>{if(!root.current?.contains(e.target))setOpen(false)};const key=e=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector('.lang-switch-button')?.focus()}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);(items.current[LANGS.findIndex(([c])=>c===lang)]||items.current[0])?.focus();return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[open]);
 const move=(e,i)=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items.current[(i+(e.key==='ArrowDown'?1:-1)+LANGS.length)%LANGS.length]?.focus()}};
 const current=LANGS.find(([c])=>c===lang);
 return <div className="lang-switch" ref={root}><button type="button" className="lang-switch-button" aria-haspopup="true" aria-expanded={open} aria-label={__('Язык интерфейса')} title={__('Язык интерфейса')} onClick={()=>setOpen(!open)}><Flag code={lang}/><span className="lang-switch-name">{current[1]}</span><ChevronDown size={13}/></button>
 {open&&<div className="lang-switch-menu" role="menu">{LANGS.map(([code,name],i)=><button type="button" key={code} role="menuitemradio" aria-checked={code===lang} ref={el=>items.current[i]=el} onKeyDown={e=>move(e,i)} onClick={()=>{setOpen(false);if(code!==lang)setLang(code)}}><Flag code={code}/><span>{name}</span>{code===lang&&<Check size={14}/>}</button>)}</div>}</div>;
}
