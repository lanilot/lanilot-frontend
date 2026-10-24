// Voice page actions: find a visible control by what the user called it and click it, or type into the field they chose.
// Only the current page is touched: the voice orb itself, hidden or inert parts and links that leave Lanilot are skipped.
import {normalize} from './voice-commands.js';
const SELECTOR='button,a[href],[role=button],[role=tab],[role=menuitem],[role=option],[role=link],[role=checkbox],[role=switch],[role=radio],input:not([type=hidden]),textarea,select,summary,[contenteditable=true]';
// Words that only describe the kind of control ("save button", «поле имя», "campo nombre"); they hint at it but are not its label.
const fieldWords=new Set(['field','input','box','поле','поля','полю','строку','строка','campo','casilla']),buttonWords=new Set(['button','btn','кнопку','кнопка','кнопке','boton']),otherWords=new Set(['link','tab','ссылку','ссылка','вкладку','вкладка','enlace','pestana','the','on','на','по','в','el','la','los','las','de','del']);
// Spelled-out letters ("t q l", "c h robinson") are joined back into one word.
const joinLetters=words=>{const out=[];let run=false;for(const w of words){if(w.length===1&&run)out[out.length-1]+=w;else{out.push(w);run=w.length===1}}return out};
// Words naming what kind of thing it is ("TQL broker", «водитель Алекс», "carga 2046") point to the section to look in.
const sectionWords=[['fleet',['driver','водител','conductor','truck','грузовик','тягач','camion']],['brokers',['broker','брокер','corredor']],['loads',['load','груз','carga']],['trips',['trip','рейс','viaje']],['lanes',['lane','лини','ruta']],['offers',['offer','предложени','oferta']],['chat',['message','chat','переписк','сообщени','чат','mensaje','conversacion']]];
const sectionOf=w=>sectionWords.find(([,stems])=>stems.some(x=>w.startsWith(x)))?.[0];
export function splitTarget(target){const words=joinLetters(normalize(target).split(' ').filter(Boolean)),kind=words.some(w=>fieldWords.has(w))?'field':words.some(w=>buttonWords.has(w))?'button':null;const rest=words.filter(w=>!fieldWords.has(w)&&!buttonWords.has(w)&&!otherWords.has(w));
 const section=rest.map(sectionOf).find(Boolean)||null,named=rest.filter(w=>!sectionOf(w));return {text:(named.length?named:rest.length?rest:words).join(' '),kind,section}}
// Names said in one alphabet and written in another («арайв логистикс» ≈ "Arrive Logistics"): words are transliterated
// to Latin and compared by their sound skeleton — first letter plus consonants, with look-alike sounds merged.
const lat={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'u',я:'a'};
export function skeleton(word){const w=[...normalize(word)].map(ch=>lat[ch]??ch).join('').replace(/sch/g,'sh').replace(/gh/g,'').replace(/ph/g,'f').replace(/ck|c|q/g,'k').replace(/x/g,'ks').replace(/w/g,'v').replace(/[yj]/g,'i').replace(/(.)\1+/g,'$1');return w[0]+w.slice(1).replace(/[aeiouh]/g,'')}
const soundsAlike=(a,b)=>{if(a.length<4||b.length<4)return false;const x=skeleton(a),y=skeleton(b);return x.length>=3&&(x===y||x.length>=4&&(x.startsWith(y)||y.startsWith(x)))};
// Word stems so Russian and Spanish endings still match ("названию компании" ≈ "Название компании").
const stem=w=>w.length>5?w.slice(0,w.length-2):w;
export function scoreLabel(label,target){const a=normalize(label),b=normalize(target);if(!a||!b)return 0;if(a===b)return 100;if(a.startsWith(b+' ')||a.startsWith(b)&&b.length>=4)return 85;const words=b.split(' ').filter(w=>w.length>1),have=a.split(' ');if(!words.length)return 0;
 const hits=words.filter(w=>have.some(x=>stem(x).startsWith(stem(w))||stem(w).startsWith(stem(x))&&x.length>=3||soundsAlike(x,w))).length;if(!hits)return 0;
 // All spoken words found, and the label is not much longer than what was said.
 return Math.round(70*hits/words.length*Math.min(1,(words.length+1)/have.length))}
const isField=el=>el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]');
export function labelOf(el){const parts=[el.getAttribute('aria-label')];const by=el.getAttribute('aria-labelledby');if(by)parts.push(...by.split(' ').map(id=>document.getElementById(id)?.textContent));
 if(isField(el)||el.matches('input')){for(const l of el.labels||[])parts.push(l.textContent);parts.push(el.getAttribute('placeholder'),el.closest('label')?.textContent)}else{const text=el.innerText||'';parts.push(text.slice(0,120),...text.split(/[\n\t]+/).slice(0,40))}
 parts.push(el.getAttribute('title'),el.matches('input[type=button],input[type=submit]')?el.value:null);return parts.filter(Boolean).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length<=120)}
export function visible(el){if(el.closest('.voice-float,[inert],[hidden],[aria-hidden=true]')||el.disabled)return false;const r=el.getBoundingClientRect();if(!r.width&&!r.height)return false;const cs=getComputedStyle(el);return cs.visibility!=='hidden'&&cs.display!=='none'}
// An open modal dialog takes precedence: only its controls are considered.
function scope(){const dialogs=[...document.querySelectorAll('[role=dialog][aria-modal=true],dialog[open]')].filter(d=>visible(d));return dialogs.at(-1)||document}
// Table rows, list items and cards that open something on click (pointer cursor) count too; real controls win ties.
const ROWS='tr,li,article,[class*=card],[class*=row],[class*=item],[class*=thread]';
function clickableRows(root){const out=[];for(const el of root.querySelectorAll(ROWS)){if(el.matches(SELECTOR)||el.parentElement?.closest(SELECTOR)||!visible(el))continue;if(getComputedStyle(el).cursor!=='pointer'||(el.innerText||'').length>600)continue;out.push(el)}return out}
export function findControl(variants,min=45){const {kind}=splitTarget(variants[0]),targets=[...new Set(variants.map(v=>splitTarget(v).text).filter(Boolean))];let best=null;const root=scope();
 for(const el of [...root.querySelectorAll(SELECTOR),...clickableRows(root)]){if(!visible(el))continue;const labels=labelOf(el);if(!labels.length)continue;let score=0;for(const l of labels)for(const t of targets)score=Math.max(score,scoreLabel(l,t));if(!score)continue;
  if(kind==='field'&&isField(el)||kind==='button'&&!isField(el))score+=10;if(!el.matches(SELECTOR))score-=5;if(!best||score>best.score)best={el,score}}
 return best&&best.score>=min?best.el:null}
const leaves=el=>{const a=el.closest('a[href]');if(!a)return false;try{const url=new URL(a.href,location.href);return a.target==='_blank'||url.origin!==location.origin}catch{return true}};
function flash(el){el.classList.add('voice-flash');setTimeout(()=>el.classList.remove('voice-flash'),1200)}
// Returns 'focused' | 'clicked' | 'external' | null (nothing matched).
// Waits up to `ms` for a control to appear (a section that was just opened may still be loading).
export async function waitForControl(variants,ms=2000){const until=Date.now()+ms;for(;;){const el=findControl(variants);if(el||Date.now()>=until)return el;await new Promise(r=>setTimeout(r,150))}}
export function actOn(el){if(!el)return null;if(leaves(el))return 'external';el.scrollIntoView({block:'center',behavior:'smooth'});flash(el);if(isField(el)){el.focus({preventScroll:true});if(el.matches('select'))el.showPicker?.();return 'focused'}el.click();return 'clicked'}
// React keeps its own copy of input values, so the native setter is used and an input event is fired.
export function typeInto(el,text){if(!el||!document.contains(el)||el.readOnly||el.disabled)return false;if(el.isContentEditable){el.focus();el.textContent=text;el.dispatchEvent(new InputEvent('input',{bubbles:true}));return true}
 if(!el.matches('input,textarea'))return false;const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value')?.set;setter?setter.call(el,text):(el.value=text);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.focus({preventScroll:true});flash(el);return true}
export const editable=el=>!!el&&el!==document.body&&!el.closest('.voice-float')&&(el.isContentEditable||el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea'));
