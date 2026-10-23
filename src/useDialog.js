import {useEffect,useRef} from 'react';
const dialogs=[];
let originalOverflow='';
export default function useDialog(active,close){
 const closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{
  if(!active)return;
  const previousFocus=document.activeElement,token={};
  if(!dialogs.length)originalOverflow=document.body.style.overflow;
  dialogs.push(token);
  document.body.style.overflow='hidden';
  const handler=e=>{
   if(dialogs.at(-1)!==token)return;
   if(e.key==='Escape'){e.stopPropagation();closeRef.current();return}
   if(e.key!=='Tab')return;
   const dialog=[...document.querySelectorAll('[role="dialog"]')].at(-1);if(!dialog)return;
   const items=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length&&!el.closest('[inert]')&&el.getAttribute('tabindex')!=='-1');
   const first=items[0],last=items.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  };
  document.addEventListener('keydown',handler);
  return()=>{document.removeEventListener('keydown',handler);dialogs.splice(dialogs.indexOf(token),1);if(!dialogs.length)document.body.style.overflow=originalOverflow;requestAnimationFrame(()=>previousFocus?.focus())};
 },[active]);
}
