import {useEffect,useRef,useState} from 'react';
import {Mic,X} from 'lucide-react';
import {__,lang,appLocale} from './i18n.js';
import {voiceLangs,parseVoiceCommand} from './voice-commands.js';
import {demoMatches} from './assistant-demo.js';
import {counted} from './ui.js';
const Recognition=typeof window==='undefined'?null:window.SpeechRecognition||window.webkitSpeechRecognition||null;
export const voiceSupported=!!Recognition;
const langKey='lanilot-voice-lang';
export function initialVoiceLang(){try{const saved=localStorage.getItem(langKey);if(voiceLangs.some(v=>v[0]===saved))return saved}catch{}return ['ru','es'].includes(lang)?lang:'en'}
export function saveVoiceLang(code){try{localStorage.setItem(langKey,code)}catch{}}
// While a reply is spoken (and briefly after) the microphone hears our own voice, so those phrases are dropped.
// The pause is capped by the reply length in case the browser never reports the end of speech.
let quietUntil=0;const speaking=()=>Date.now()<quietUntil;
// Replies are written in the interface language, so they are spoken with its voice.
export function speak(text){try{const synth=window.speechSynthesis;if(!synth||!text)return;synth.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=appLocale;const voice=synth.getVoices().find(v=>v.lang?.toLowerCase().startsWith(lang));if(voice)u.voice=voice;quietUntil=Date.now()+Math.min(9000,900+text.length*75);u.onend=u.onerror=()=>{quietUntil=Date.now()+400};synth.speak(u)}catch{quietUntil=0}}
const fatal=['not-allowed','service-not-allowed','audio-capture'];
// Continuous listening: once started it keeps hearing phrases until stop(); each final phrase goes to onResult({text}).
// The browser ends recognition after silence, so it is restarted; repeated instant failures stop it with onResult({error}).
export function useVoice(onResult){
 const rec=useRef(null),want=useRef(false),code=useRef('en'),latest=useRef(onResult),fails=useRef(0),timer=useRef(0),meter=useRef(null),orbs=useRef(new Set()),[listening,setListening]=useState(false),[interim,setInterim]=useState('');latest.current=onResult;
 const setLevel=v=>{for(const el of orbs.current)el.style.setProperty('--level',v.toFixed(3))};
 // Mic loudness drives the orb; without access the orb simply keeps its idle motion.
 const startMeter=async()=>{if(meter.current||!navigator.mediaDevices?.getUserMedia)return;const m={stopped:false};meter.current=m;try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(m.stopped){stream.getTracks().forEach(t=>t.stop());return}const ctx=new (window.AudioContext||window.webkitAudioContext)(),analyser=ctx.createAnalyser();ctx.resume?.().catch(()=>{});analyser.fftSize=512;ctx.createMediaStreamSource(stream).connect(analyser);const data=new Uint8Array(analyser.fftSize);let smooth=0;
  const tick=()=>{if(m.stopped)return;analyser.getByteTimeDomainData(data);let sum=0;for(const v of data)sum+=(v-128)**2;const rms=Math.min(1,Math.sqrt(sum/data.length)/40);smooth=smooth*.7+rms*.3;setLevel(smooth);m.frame=requestAnimationFrame(tick)};tick();Object.assign(m,{stream,ctx})}catch{meter.current=null}};
 const stopMeter=()=>{const m=meter.current;meter.current=null;if(!m)return;m.stopped=true;cancelAnimationFrame(m.frame);m.stream?.getTracks().forEach(t=>t.stop());m.ctx?.close().catch(()=>{});setLevel(0)};
 const begin=()=>{if(!want.current)return;const r=new Recognition(),started=Date.now();r.lang=voiceLangs.find(v=>v[0]===code.current)?.[1]||'en-US';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
  r.onresult=e=>{if(rec.current!==r)return;fails.current=0;let live='';for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i];if(x.isFinal){const text=x[0].transcript.trim();if(text&&!speaking())latest.current({text})}else live+=x[0].transcript}setInterim(speaking()?'':live)};
  r.onerror=e=>{if(rec.current!==r)return;if(fatal.includes(e.error)){stop();latest.current({error:e.error})}};
  r.onend=()=>{if(rec.current!==r)return;rec.current=null;setInterim('');if(!want.current)return;fails.current=Date.now()-started<1500?fails.current+1:0;if(fails.current>=5){stop();latest.current({error:'network'});return}timer.current=setTimeout(begin,fails.current?600:150)};
  rec.current=r;try{r.start()}catch{rec.current=null;timer.current=setTimeout(begin,600)}};
 function stop(){want.current=false;clearTimeout(timer.current);const r=rec.current;rec.current=null;r?.abort();setListening(false);setInterim('');stopMeter()}
 const start=c=>{if(!Recognition)return;code.current=c;want.current=true;fails.current=0;clearTimeout(timer.current);const old=rec.current;rec.current=null;old?.abort();setListening(true);begin();startMeter()};
 useEffect(()=>()=>{want.current=false;clearTimeout(timer.current);rec.current?.abort();rec.current=null;stopMeter()},[]);
 const orb=el=>{if(el)orbs.current.add(el)};
 return {supported:!!Recognition,listening,interim,start,stop,orb};
}
export const voicePageLabels={overview:__("Обзор"),loads:__("Грузы"),trips:__("Рейсы"),offers:__("Предложения"),chat:__("Переписка"),radar:'Load Radar',lanes:__("Выделенные линии"),brokers:__("Проверка брокеров"),fleet:__("Автопарк"),eld:__("Карта автопарка"),finances:__("Финансы"),telegram:'Telegram',integrations:__("Интеграции"),settings:__("Настройки"),users:__("Пользователи"),help:__("Помощь")};
const posKey='lanilot-voice-position',size=60,gap=12;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
// Default sits above the action bars of drawers and the assistant composer. Position is kept as the distance from the right and bottom edges and is always clamped to the viewport.
function fit(p){return {right:clamp(p.right,gap,window.innerWidth-size-gap),bottom:clamp(p.bottom,gap,window.innerHeight-size-gap)}}
function initialPosition(){try{const p=JSON.parse(localStorage.getItem(posKey));if(Number.isFinite(p?.right)&&Number.isFinite(p?.bottom))return fit(p)}catch{}return fit({right:24,bottom:96})}
// Floating voice orb on every dashboard screen, the AI assistant included. Every command calls the app's own handlers,
// so voice control never leaves the page; the listening session survives switching sections.
export function FloatingVoice({state,isOwner,labels,assistantOpen,assistant,onNavigate,onOpenLoad,onSearch,onBack}){
 const [code,setCode]=useState(initialVoiceLang),[pos,setPos]=useState(initialPosition),[note,setNote]=useState(null),drag=useRef(null),moved=useRef(false);
 const reply=(text,heard,tone='ok')=>{setNote({text,heard,tone,id:Math.random()});speak(text)};
 const voice=useVoice(({text,error})=>{
  if(error)return reply(fatal.includes(error)?__("Нет доступа к микрофону. Разрешите его в настройках браузера."):__("Распознавание речи недоступно. Проверьте интернет и включите микрофон снова."),'','error');
  const c=parseVoiceCommand(text,state.loads);
  if(c.type==='empty')return;
  if(c.type==='stop'){voice.stop();return reply(__("Голосовое управление выключено"),text)}
  if(c.type==='skills')return reply(__("Скажите раздел: «открой рейсы», «карта автопарка», «настройки». Груз по номеру: «груз 2046». Поиск: «Reefer из Чикаго в Даллас». А также «вниз», «наверх», «назад» и «стоп»."),text);
  if(c.type==='scroll'){const area=assistantOpen?document.querySelector('.assistant-conversation'):null,target=area||window,step=Math.round((area?.clientHeight||window.innerHeight)*.7);if(c.dir==='top')target.scrollTo({top:0,behavior:'smooth'});else target.scrollBy({top:c.dir==='down'?step:-step,behavior:'smooth'});return setNote({text:c.dir==='down'?'↓':'↑',heard:text,tone:'ok',id:Math.random()})}
  if(c.type==='back'){onBack();return reply(__("Назад"),text)}
  if(c.type==='newChat'){onNavigate('assistant');setTimeout(()=>assistant.current?.newChat());return reply(__("Новый чат"),text)}
  if(c.type==='openLoad'){if(!c.load)return reply(__("Груз {0} не найден",[c.id]),text,'error');onOpenLoad(c.load);return reply(__("Открываю груз {0}",[c.load.id]),text)}
  if(c.type==='navigate'){if(c.page==='users'&&!isOwner)return reply(__("Раздел доступен только владельцу компании"),text,'error');onNavigate(c.page);return reply(__("Открываю «{0}»",[c.page==='assistant'?__("ИИ-помощник"):labels[c.page]]),text)}
  if(c.type==='search'){const found=demoMatches(c.criteria,state.loads,state.defaultCosts).length;if(assistantOpen&&assistant.current)assistant.current.submit(c.text,c.criteria);else onSearch(c.criteria);return reply(found?__("Найдено")+' '+counted(found,__("подходящий груз"),__("подходящих груза"),__("подходящих грузов")):__("Ничего не найдено. Измените условия."),text)}
  reply(__("Не понял команду. Скажите «что ты умеешь», чтобы услышать примеры."),text,'error');
 });
 useEffect(()=>{if(!note)return;const t=setTimeout(()=>setNote(null),note.tone==='error'?9000:5000);return()=>clearTimeout(t)},[note]);
 useEffect(()=>{const resize=()=>setPos(p=>fit(p));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const down=e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,start:pos};moved.current=false;e.currentTarget.setPointerCapture(e.pointerId)};
 const move=e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!moved.current&&Math.hypot(dx,dy)<5)return;moved.current=true;setPos(fit({right:d.start.right-dx,bottom:d.start.bottom-dy}))};
 const up=()=>{if(!drag.current)return;drag.current=null;if(moved.current)setPos(p=>{try{localStorage.setItem(posKey,JSON.stringify(p))}catch{}return p})};
 const toggle=()=>{if(moved.current){moved.current=false;return}if(voice.listening){voice.stop();setNote(null)}else{setNote(null);voice.start(code)}};
 const nextLang=()=>{const i=voiceLangs.findIndex(v=>v[0]===code),n=voiceLangs[(i+1)%voiceLangs.length][0];setCode(n);saveVoiceLang(n);if(voice.listening)voice.start(n)};
 if(!voice.supported)return null;
 // The bubble opens toward the middle of the screen so it is never cut off.
 const left=window.innerWidth-pos.right-size,top=window.innerHeight-pos.bottom-size,width=Math.min(320,window.innerWidth-gap*2);
 const bubble={width,left:clamp(left+size/2<window.innerWidth/2?left:left+size-width,gap,window.innerWidth-width-gap),...(top+size/2>window.innerHeight/2?{bottom:pos.bottom+size+12}:{top:top+size+12})};
 const label=voiceLangs.find(v=>v[0]===code)?.[2],live=voice.listening&&voice.interim;
 return <div className="voice-float">{(live||note)&&<div className={'voice-float-bubble'+(note?.tone==='error'&&!live?' is-error':'')} style={bubble} role="status" aria-live="polite">{live?<p className="voice-float-live">{voice.interim}</p>:<><p>{note.heard&&<q>{note.heard}</q>}<span>{note.text}</span></p><button type="button" aria-label={__("Скрыть ответ")} onClick={()=>setNote(null)}><X size={14}/></button></>}</div>}
  <div className={'voice-float-anchor'+(voice.listening?' is-listening':'')} style={{right:pos.right,bottom:pos.bottom}}>
   <button type="button" className="voice-orb-button" aria-pressed={voice.listening} aria-label={voice.listening?__("Выключить голосовое управление"):__("Включить голосовое управление")} title={(voice.listening?__("Выключить голосовое управление"):__("Включить голосовое управление"))+' · '+__("перетащите, чтобы переместить")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={toggle}>
    <span className="voice-orb" ref={voice.orb} aria-hidden="true"><i/><i/><i/><i/></span>{!voice.listening&&<Mic className="voice-orb-icon" size={22} aria-hidden="true"/>}
   </button>
   <button type="button" className="voice-float-lang" onClick={nextLang} title={__("Язык голосовых команд")} aria-label={__("Язык голосовых команд: {0}",[label])}>{label}</button>
  </div></div>;
}
