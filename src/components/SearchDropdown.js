import {__} from '../i18n.js';
import {SKELETON_DELAY_MS} from '../loading-config.js';
import {defineComponent,h,ref,computed,nextTick,onMounted,onBeforeUnmount} from 'vue';
export default defineComponent({
 name:'SearchDropdown',props:{model:{type:Object,required:true}},
 setup(props){
  let loadingTimer;const pending=ref(false);
  const root=ref(),trigger=ref(),search=ref(),open=ref(false),query=ref(''),active=ref(-1),position=ref({});
  const m=()=>props.model;
  const filtered=computed(()=>m().options.filter(o=>!(o.disabled&&o.value==='')).filter(o=>o.label.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
  const selected=computed(()=>m().options.find(o=>o.value===m().value));
  const place=()=>{if(!trigger.value)return;const r=trigger.value.getBoundingClientRect(),bottom=window.innerHeight-r.bottom,up=bottom<220&&r.top>bottom,space=up?r.top-12:bottom-12;position.value={left:Math.max(8,Math.min(r.left,window.innerWidth-r.width-8))+'px',width:Math.min(r.width,window.innerWidth-16)+'px',maxHeight:Math.max(110,Math.min(310,space))+'px',...(up?{bottom:window.innerHeight-r.top+6+'px'}:{top:r.bottom+6+'px'})}};
  const close=(focus=false)=>{clearTimeout(loadingTimer);pending.value=false;open.value=false;if(focus)trigger.value?.focus()};
  const show=async()=>{if(m().disabled)return;document.dispatchEvent(new CustomEvent('lanilot-dropdown-open',{detail:m().id}));query.value='';pending.value=true;clearTimeout(loadingTimer);loadingTimer=setTimeout(()=>{pending.value=false},SKELETON_DELAY_MS);open.value=true;place();active.value=filtered.value.findIndex(o=>o.value===m().value&&!o.disabled);await nextTick();search.value?.focus()};
  const choose=o=>{if(o.disabled||pending.value)return;m().choose(o.value);close(true)};
  const step=async delta=>{const list=filtered.value;if(!list.some(o=>!o.disabled))return;let i=active.value;for(let n=0;n<list.length;n++){i=(i+delta+list.length)%list.length;if(!list[i].disabled){active.value=i;break}}await nextTick();root.value?.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'})};
  const key=e=>{if(e.key==='Escape'&&open.value){e.preventDefault();e.stopPropagation();close(true)}else if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open.value?step(e.key==='ArrowDown'?1:-1):show()}else if(e.key==='Enter'&&open.value){e.preventDefault();const option=filtered.value[active.value];if(option)choose(option)}else if(e.key==='Tab')close()};
  const outside=e=>{if(open.value&&!root.value?.contains(e.target))close()};
  const another=e=>{if(e.detail!==m().id)close()};
  const scroll=e=>{if(open.value&&!root.value?.contains(e.target))place()};
  onMounted(()=>{document.addEventListener('lanilot-dropdown-open',another);document.addEventListener('pointerdown',outside);window.addEventListener('resize',place);document.addEventListener('scroll',scroll,true)});
  onBeforeUnmount(()=>{clearTimeout(loadingTimer);document.removeEventListener('lanilot-dropdown-open',another);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',place);document.removeEventListener('scroll',scroll,true)});
  return()=>h('span',{ref:root,class:'vue-dropdown',onKeydown:key},[
   h('button',{ref:trigger,type:'button',class:['dropdown-trigger',!m().value&&'placeholder'],disabled:m().disabled,'aria-label':m().label,'aria-required':!!m().required,'aria-haspopup':'listbox','aria-expanded':open.value,'aria-controls':m().id+'-list',onClick:()=>open.value?close():show()},[h('span',selected.value?.label||__("Выберите значение")),h('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.8,'aria-hidden':true},[h('path',{d:'m6 9 6 6 6-6'})])]),
   open.value&&h('span',{class:'dropdown-popup',style:position.value},[
    h('span',{class:'dropdown-search'},[h('span',{'aria-hidden':true},'⌕'),h('input',{ref:search,role:'combobox','aria-label':__("Поиск: ")+m().label,'aria-expanded':true,'aria-controls':m().id+'-list','aria-autocomplete':'list','aria-activedescendant':active.value>=0?m().id+'-option-'+active.value:undefined,placeholder:__("Поиск…"),value:query.value,onInput:e=>{query.value=e.target.value;active.value=filtered.value.findIndex(o=>!o.disabled)}})]),
    h('span',{role:'listbox',id:m().id+'-list','aria-label':m().label,class:'dropdown-options'},pending.value?h('span',{class:'dropdown-skeleton',role:'status','aria-label':__("Загрузка вариантов")},Array.from({length:4},(_,i)=>h('i',{key:i,class:'sk-block'}))):filtered.value.length?filtered.value.map((o,i)=>h('button',{key:o.value,id:m().id+'-option-'+i,type:'button',role:'option',tabindex:-1,'aria-selected':o.value===m().value,'aria-disabled':o.disabled,'data-active':i===active.value,onPointermove:()=>{if(!o.disabled)active.value=i},onClick:()=>choose(o)},[h('span',o.label),o.value===m().value&&h('span',{'aria-hidden':true},'✓')])):h('span',{class:'dropdown-empty',role:'status'},__("Ничего не найдено"))),
    h('span',{class:'dropdown-hint'},__("↑ ↓ выбрать · Enter подтвердить · Esc закрыть"))])]);
 }
});
