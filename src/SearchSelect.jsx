import {__} from './i18n.js';
import React,{useLayoutEffect,useRef,useState,useId} from 'react';
import {createApp,shallowReactive} from 'vue';
import SearchDropdown from './components/SearchDropdown.js';
const textOf=node=>Array.isArray(node)?node.map(textOf).join(''):React.isValidElement(node)?textOf(node.props.children):node==null?'':String(node);
// A small bridge keeps the dispatcher app intact while Vue owns the dropdown UI.
export default function SearchSelect({children,value,defaultValue='',onChange,name,required,disabled,...attrs}){
 const host=useRef(null),bridge=useRef(null),change=useRef(onChange),[local,setLocal]=useState(defaultValue),id=useId();
 change.current=onChange;
 const options=React.Children.toArray(children).filter(React.isValidElement).map(o=>({value:String(o.props.value??textOf(o.props.children)),label:textOf(o.props.children),disabled:!!o.props.disabled}));
 const selected=String(value??local);
 const label=attrs['aria-label']||({driver:__("Водитель"),truck:__("Машина"),status:__("Статус рейса")}[name])||__("Выбор значения");
 useLayoutEffect(()=>{
  const model=shallowReactive({options,value:selected,label,disabled:!!disabled,required:!!required,id:id.replaceAll(':',''),choose:v=>{setLocal(v);change.current?.({target:{value:v,name}})}});
  const app=createApp(SearchDropdown,{model});app.mount(host.current);bridge.current=model;
  return()=>{app.unmount();bridge.current=null};
 },[]);
 useLayoutEffect(()=>{if(bridge.current)Object.assign(bridge.current,{options,value:selected,label,disabled:!!disabled,required:!!required})});
 return <span className={'search-select '+(attrs.className||'')}><span ref={host}/><input className="select-validation" aria-hidden="true" tabIndex={-1} name={name} value={selected} required={required} disabled={disabled} onChange={()=>{}} onInvalid={e=>{e.preventDefault();if(e.target.form?.querySelector('input:invalid')!==e.target)return;host.current?.querySelector('button')?.focus();if(host.current?.querySelector('button')?.getAttribute('aria-expanded')!=='true')host.current?.querySelector('button')?.click()}}/></span>;
}
