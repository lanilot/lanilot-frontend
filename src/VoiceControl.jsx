import {useEffect,useRef,useState} from 'react';
import {Mic,X} from 'lucide-react';
import {__,lang,appLocale} from './i18n.js';
import {voiceLangs,parseVoiceCommand,spokenLang,isEcho,speechText} from './voice-commands.js';
import {demoMatches} from './assistant-demo.js';
const Recognition=typeof window==='undefined'?null:window.SpeechRecognition||window.webkitSpeechRecognition||null;
export const voiceSupported=!!Recognition;
const langKey='lanilot-voice-lang';
export function initialVoiceLang(){try{const saved=localStorage.getItem(langKey);if(voiceLangs.some(v=>v[0]===saved))return saved}catch{}return ['ru','es'].includes(lang)?lang:'en'}
export function saveVoiceLang(code){try{localStorage.setItem(langKey,code)}catch{}}
// Voice replies use the language the user speaks (the recognition language), not the interface language.
const dicts={ru:{}};
export async function loadVoiceDict(code){if(dicts[code])return;try{dicts[code]=(await import(`./locales/${code}.json`)).default}catch{dicts[code]={}}}
const tr=(code,key,vars)=>{let s=dicts[code]?.[key]??key;if(vars)s=s.replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m);return s};
const plural=(code,n,one,few,many)=>`${n} ${tr(code,code==='ru'?(n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many):n===1?one:many)}`;
// While a reply is spoken (and briefly after) the microphone would hear our own voice, so phrases are dropped.
// The pause is capped by the reply length in case the browser never reports the end of speech; onDone runs once either way.
let quietUntil=0;const speaking=()=>Date.now()<quietUntil;
export function speak(text,code=lang,onDone){let done=false;const finish=()=>{if(done)return;done=true;quietUntil=Date.now()+600;onDone?.()};const max=Math.min(9000,1200+text.length*80);
 try{const synth=window.speechSynthesis;if(!synth||!text)return finish();synth.cancel();const u=new SpeechSynthesisUtterance(speechText(text));u.lang=voiceLangs.find(v=>v[0]===code)?.[1]||appLocale;const voice=synth.getVoices().find(v=>v.lang?.toLowerCase().startsWith(code));if(voice)u.voice=voice;quietUntil=Date.now()+max;u.onend=u.onerror=finish;setTimeout(finish,max);synth.speak(u)}catch{finish()}}
const IDLE_MS=8000;
const fatal=['not-allowed','service-not-allowed','audio-capture'];
// Continuous listening: once started it keeps hearing phrases until stop() or 8 s of silence ({idle:true}); each final phrase goes to onResult({text}).
// The browser ends recognition after silence, so it is restarted; repeated instant failures stop it with onResult({error}).
export function useVoice(onResult){
 const rec=useRef(null),want=useRef(false),code=useRef('en'),latest=useRef(onResult),fails=useRef(0),timer=useRef(0),meter=useRef(null),orbs=useRef(new Set()),[listening,setListening]=useState(false),[interim,setInterim]=useState('');latest.current=onResult;
 // Voice control switches itself off after this long without any speech; replies extend it while they are spoken.
 const idle=useRef(0),paused=useRef(false),bump=()=>{clearTimeout(idle.current);idle.current=setTimeout(()=>{if(!want.current)return;if(speaking())return bump();stop();latest.current({idle:true})},IDLE_MS)};
 const setLevel=v=>{for(const el of orbs.current)el.style.setProperty('--level',v.toFixed(3))};
 // Mic loudness drives the orb; without access the orb simply keeps its idle motion.
 const startMeter=async()=>{if(meter.current||!navigator.mediaDevices?.getUserMedia)return;const m={stopped:false};meter.current=m;try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(m.stopped){stream.getTracks().forEach(t=>t.stop());return}const ctx=new (window.AudioContext||window.webkitAudioContext)(),analyser=ctx.createAnalyser();ctx.resume?.().catch(()=>{});analyser.fftSize=512;ctx.createMediaStreamSource(stream).connect(analyser);const data=new Uint8Array(analyser.fftSize);let smooth=0;
  const tick=()=>{if(m.stopped)return;analyser.getByteTimeDomainData(data);let sum=0;for(const v of data)sum+=(v-128)**2;const rms=Math.min(1,Math.sqrt(sum/data.length)/40);smooth=smooth*.7+rms*.3;setLevel(smooth);m.frame=requestAnimationFrame(tick)};tick();Object.assign(m,{stream,ctx})}catch{meter.current=null}};
 const stopMeter=()=>{const m=meter.current;meter.current=null;if(!m)return;m.stopped=true;cancelAnimationFrame(m.frame);m.stream?.getTracks().forEach(t=>t.stop());m.ctx?.close().catch(()=>{});setLevel(0)};
 const begin=()=>{if(!want.current||paused.current)return;const r=new Recognition(),started=Date.now();r.lang=voiceLangs.find(v=>v[0]===code.current)?.[1]||'en-US';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
  r.onresult=e=>{if(rec.current!==r)return;fails.current=0;bump();let live='';for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i];if(x.isFinal){const text=x[0].transcript.trim();if(text&&!speaking())latest.current({text})}else live+=x[0].transcript}setInterim(speaking()?'':live)};
  r.onerror=e=>{if(rec.current!==r)return;if(fatal.includes(e.error)){stop();latest.current({error:e.error})}};
  r.onend=()=>{if(rec.current!==r)return;rec.current=null;setInterim('');if(!want.current)return;fails.current=Date.now()-started<1500?fails.current+1:0;if(fails.current>=5){stop();latest.current({error:'network'});return}timer.current=setTimeout(begin,fails.current?600:150)};
  rec.current=r;try{r.start()}catch{rec.current=null;timer.current=setTimeout(begin,600)}};
 // The microphone is switched off while a reply is spoken, so the orb never hears and repeats itself.
 const say=(text,lang)=>{paused.current=true;clearTimeout(timer.current);const r=rec.current;rec.current=null;r?.abort();setInterim('');speak(text,lang,()=>{paused.current=false;bump();if(want.current&&!rec.current)timer.current=setTimeout(begin,400)})};
 function stop(){want.current=false;paused.current=false;clearTimeout(timer.current);clearTimeout(idle.current);const r=rec.current;rec.current=null;r?.abort();setListening(false);setInterim('');stopMeter()}
 const start=c=>{if(!Recognition)return;code.current=c;want.current=true;fails.current=0;clearTimeout(timer.current);const old=rec.current;rec.current=null;old?.abort();setListening(true);bump();begin();startMeter()};
 useEffect(()=>()=>{want.current=false;clearTimeout(timer.current);clearTimeout(idle.current);rec.current?.abort();rec.current=null;stopMeter()},[]);
 const orb=el=>{if(el)orbs.current.add(el)};
 return {supported:!!Recognition,listening,interim,start,stop,orb,say};
}
export const voicePageLabels={overview:"Обзор",loads:"Грузы",trips:"Рейсы",offers:"Предложения",chat:"Переписка",radar:'Load Radar',lanes:"Выделенные линии",brokers:"Проверка брокеров",fleet:"Автопарк",eld:"Карта автопарка",finances:"Финансы",telegram:'Telegram',integrations:"Интеграции",settings:"Настройки",users:"Пользователи",help:"Помощь"};
const posKey='lanilot-voice-position-v2',size=60,gap=12;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
// Default is 30px from the bottom-right corner. Position is kept as the distance from the right and bottom edges and is always clamped to the viewport.
function fit(p){return {right:clamp(p.right,gap,window.innerWidth-size-gap),bottom:clamp(p.bottom,gap,window.innerHeight-size-gap)}}
function initialPosition(){try{const p=JSON.parse(localStorage.getItem(posKey));if(Number.isFinite(p?.right)&&Number.isFinite(p?.bottom))return fit(p)}catch{}return fit({right:30,bottom:30})}
// Floating voice orb on every dashboard screen, the AI assistant included. Every command calls the app's own handlers,
// so voice control never leaves the page; the listening session survives switching sections.
export function FloatingVoice({state,isOwner,labels,assistantOpen,assistant,onNavigate,onOpenLoad,onSearch,onBack}){
 const [code,setCode]=useState(initialVoiceLang),[pos,setPos]=useState(initialPosition),[note,setNote]=useState(null),drag=useRef(null),moved=useRef(false),lastLang=useRef(null),lastReply=useRef(null),lastCommand=useRef(null),voiceRef=useRef(null);
 // Replies are given in the language of the phrase just heard (errors: in the selected recognition language).
 let sp=code;const t=(key,vars)=>tr(sp,key,vars),reply=(text,heard,tone='ok')=>{setNote({text,heard,tone,id:Math.random()});lastReply.current={text,at:Date.now()};voiceRef.current?.say(text,sp)};
 useEffect(()=>{for(const [c] of voiceLangs)loadVoiceDict(c)},[]);
 const voice=useVoice(({text,error,idle})=>{
  if(idle)return setNote({text:tr(lastLang.current||code,"Голосовое управление выключено"),heard:'',tone:'ok',id:Math.random()});
  if(error)return reply(fatal.includes(error)?t("Нет доступа к микрофону. Разрешите его в настройках браузера."):t("Распознавание речи недоступно. Проверьте интернет и включите микрофон снова."),'','error');
  // Our own reply caught by the microphone, or the same command repeated within 4 s, is ignored.
  if(lastReply.current&&Date.now()-lastReply.current.at<15000&&isEcho(text,lastReply.current.text))return;
  sp=lastLang.current=spokenLang(text,code);const c=parseVoiceCommand(text,state.loads);
  const key=JSON.stringify([c.type,c.page,c.id,c.dir,c.text]);if(c.type!=='scroll'&&lastCommand.current?.key===key&&Date.now()-lastCommand.current.at<4000)return;lastCommand.current={key,at:Date.now()};
  if(c.type==='empty')return;
  if(c.type==='stop'){voice.stop();return reply(t("Голосовое управление выключено"),text)}
  if(c.type==='skills')return reply(t("Скажите раздел: «открой рейсы», «карта автопарка», «настройки». Груз по номеру: «груз 2046». Поиск: «Reefer из Чикаго в Даллас». А также «вниз», «наверх», «назад» и «стоп»."),text);
  if(c.type==='scroll'){const area=assistantOpen?document.querySelector('.assistant-conversation'):null,target=area||window,step=Math.round((area?.clientHeight||window.innerHeight)*.7);if(c.dir==='top')target.scrollTo({top:0,behavior:'smooth'});else target.scrollBy({top:c.dir==='down'?step:-step,behavior:'smooth'});return setNote({text:c.dir==='down'?'↓':'↑',heard:text,tone:'ok',id:Math.random()})}
  if(c.type==='back'){onBack();return reply(t("Назад"),text)}
  if(c.type==='newChat'){onNavigate('assistant');setTimeout(()=>assistant.current?.newChat());return reply(t("Новый чат"),text)}
  if(c.type==='openLoad'){if(!c.load)return reply(t("Груз {0} не найден",[c.id]),text,'error');onOpenLoad(c.load);return reply(t("Открываю груз {0}",[c.load.id]),text)}
  if(c.type==='navigate'){if(c.page==='users'&&!isOwner)return reply(t("Раздел доступен только владельцу компании"),text,'error');onNavigate(c.page);return reply(t("Открываю «{0}»",[c.page==='assistant'?t("ИИ-помощник"):t(labels[c.page])]),text)}
  if(c.type==='search'){const found=demoMatches(c.criteria,state.loads,state.defaultCosts).length;if(assistantOpen&&assistant.current)assistant.current.submit(c.text,c.criteria);else onSearch(c.criteria);return reply(found?t("Найдено")+' '+plural(sp,found,"подходящий груз","подходящих груза","подходящих грузов"):t("Ничего не найдено. Измените условия."),text)}
  reply(t("Не понял команду. Скажите «что ты умеешь», чтобы услышать примеры."),text,'error');
 });
 voiceRef.current=voice;
 useEffect(()=>{if(!note)return;const t=setTimeout(()=>setNote(null),note.tone==='error'?9000:5000);return()=>clearTimeout(t)},[note]);
 useEffect(()=>{const resize=()=>setPos(p=>fit(p));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const down=e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,start:pos};moved.current=false;e.currentTarget.setPointerCapture(e.pointerId)};
 const move=e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!moved.current&&Math.hypot(dx,dy)<5)return;moved.current=true;setPos(fit({right:d.start.right-dx,bottom:d.start.bottom-dy}))};
 const up=()=>{if(!drag.current)return;drag.current=null;if(moved.current)setPos(p=>{try{localStorage.setItem(posKey,JSON.stringify(p))}catch{}return p})};
 const toggle=()=>{if(moved.current){moved.current=false;return}lastLang.current=null;if(voice.listening){voice.stop();setNote(null)}else{setNote(null);voice.start(code)}};
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
