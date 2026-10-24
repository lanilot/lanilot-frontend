import {useEffect,useRef,useState} from 'react';
import {Mic,X,Ear} from 'lucide-react';
import {__,lang,appLocale} from './i18n.js';
import {voiceLangs,parseVoiceCommand,spokenLang,isEcho,speechText,parseWake,normalize} from './voice-commands.js';
import {demoMatches} from './assistant-demo.js';
import {findControl,actOn,typeInto,editable,splitTarget} from './voice-page.js';
const Recognition=typeof window==='undefined'?null:window.SpeechRecognition||window.webkitSpeechRecognition||null;
export const voiceSupported=!!Recognition;
const langKey='lanilot-voice-lang';
export function initialVoiceLang(){try{const saved=localStorage.getItem(langKey);if(voiceLangs.some(v=>v[0]===saved))return saved}catch{}return ['ru','es'].includes(lang)?lang:'en'}
export function saveVoiceLang(code){try{localStorage.setItem(langKey,code)}catch{}}
// Voice replies use the language the user speaks (the recognition language), not the interface language.
const dicts={ru:{}};
export async function loadVoiceDict(code){if(dicts[code])return;try{dicts[code]=(await import(`./locales/${code}.json`)).default}catch{dicts[code]={}}}
// Names of controls said in another language than the interface: "click company name" on a Russian screen looks for
// «Название компании» too, through the same dictionaries (Russian source key ↔ translation).
function labelVariants(target){const want=splitTarget(target).text,out=new Set([target]);if(!want)return [...out];
 for(const dict of Object.values(dicts))for(const [key,value] of Object.entries(dict)){if(typeof value!=='string'||value.length>60)continue;if(normalize(value)===want||normalize(key)===want){out.add(key);for(const d of Object.values(dicts))if(d[key])out.add(d[key])}}
 return [...out]}
const tr=(code,key,vars)=>{let s=dicts[code]?.[key]??key;if(vars)s=s.replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m);return s};
const plural=(code,n,one,few,many)=>`${n} ${tr(code,code==='ru'?(n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many):n===1?one:many)}`;
// Spoken replies are switched off for now (actions answer with chime()); speak() and say() stay for when they return.
// While a reply is spoken (and briefly after) the microphone would hear our own voice, so phrases are dropped.
// The pause is capped by the reply length in case the browser never reports the end of speech; onDone runs once either way.
let quietUntil=0;const speaking=()=>Date.now()<quietUntil;
export function speak(text,code=lang,onDone){let done=false;const finish=()=>{if(done)return;done=true;quietUntil=Date.now()+600;onDone?.()};const max=Math.min(9000,1200+text.length*80);
 try{const synth=window.speechSynthesis;if(!synth||!text)return finish();synth.cancel();const u=new SpeechSynthesisUtterance(speechText(text));u.lang=voiceLangs.find(v=>v[0]===code)?.[1]||appLocale;const voice=synth.getVoices().find(v=>v.lang?.toLowerCase().startsWith(code));if(voice)u.voice=voice;quietUntil=Date.now()+max;u.onend=u.onerror=finish;setTimeout(finish,max);synth.speak(u)}catch{finish()}}
const SPOKEN_REPLIES=false;
// Feedback sounds instead of spoken replies: a rising two-note tone when listening starts, a bright bell ("ting") on success,
// a soft low tone on errors.
let audio=null;
export function unlockAudio(){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume?.().catch(()=>{})}catch{}}
export function chime(kind='ok'){try{unlockAudio();if(!audio)return;const t=audio.currentTime+.01,out=audio.createGain();out.gain.value=kind==='error'?.14:.16;out.connect(audio.destination);
 const notes=kind==='error'?[[440,0,.22],[330,.13,.35]]:kind==='start'?[[659.3,0,.45],[987.8,.09,.8]]:[[1318.5,0,1.1],[1975.5,.075,1.4]],partials=kind==='error'?[[1,1]]:[[1,1],[2.76,.16],[5.4,.05]];
 for(const [freq,at,len] of notes)for(const [mult,vol] of partials){const o=audio.createOscillator(),g=audio.createGain();o.type=kind==='error'?'triangle':'sine';o.frequency.value=freq*mult;g.gain.setValueAtTime(0,t+at);g.gain.linearRampToValueAtTime(vol,t+at+.006);g.gain.exponentialRampToValueAtTime(.0001,t+at+len/mult**.3);o.connect(g).connect(out);o.start(t+at);o.stop(t+at+len+.05)}}catch{}}
const IDLE_MS=8000;
const fatal=['not-allowed','service-not-allowed','audio-capture'];
// Continuous listening in two modes. 'wake': only the wake phrase ("Hey Lani") is looked for, nothing else is acted on.
// 'active': every final phrase goes to onResult({text}); after 8 s of silence it returns to 'wake' (or stops when wakeRef is off)
// and reports onResult({idle:true}). Hearing the wake phrase reports onResult({wake:true}); words after it in the same breath are a command.
// The browser ends recognition after silence, so it is restarted; repeated instant failures stop it with onResult({error}).
export function useVoice(onResult,wakeRef){
 const rec=useRef(null),want=useRef(false),code=useRef('en'),latest=useRef(onResult),fails=useRef(0),timer=useRef(0),meter=useRef(null),orbs=useRef(new Set()),modeRef=useRef('off'),[mode,setModeState]=useState('off'),[interim,setInterim]=useState('');latest.current=onResult;
 const setMode=m=>{modeRef.current=m;setModeState(m)};
 const idle=useRef(0),paused=useRef(false),bump=()=>{clearTimeout(idle.current);idle.current=setTimeout(()=>{if(modeRef.current!=='active')return;if(speaking())return bump();if(wakeRef?.current)toWake();else stop();latest.current({idle:true})},IDLE_MS)};
 const activate=()=>{setMode('active');bump();startMeter()};
 function toWake(){setMode('wake');clearTimeout(idle.current);setInterim('');stopMeter()}
 const setLevel=v=>{for(const el of orbs.current)el.style.setProperty('--level',v.toFixed(3))};
 // Mic loudness drives the orb; without access the orb simply keeps its idle motion.
 const startMeter=async()=>{if(meter.current||!navigator.mediaDevices?.getUserMedia)return;const m={stopped:false};meter.current=m;try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(m.stopped){stream.getTracks().forEach(t=>t.stop());return}const ctx=new (window.AudioContext||window.webkitAudioContext)(),analyser=ctx.createAnalyser();ctx.resume?.().catch(()=>{});analyser.fftSize=512;ctx.createMediaStreamSource(stream).connect(analyser);const data=new Uint8Array(analyser.fftSize);let smooth=0;
  const tick=()=>{if(m.stopped)return;analyser.getByteTimeDomainData(data);let sum=0;for(const v of data)sum+=(v-128)**2;const rms=Math.min(1,Math.sqrt(sum/data.length)/40);smooth=smooth*.7+rms*.3;setLevel(smooth);m.frame=requestAnimationFrame(tick)};tick();Object.assign(m,{stream,ctx})}catch{meter.current=null}};
 const stopMeter=()=>{const m=meter.current;meter.current=null;if(!m)return;m.stopped=true;cancelAnimationFrame(m.frame);m.stream?.getTracks().forEach(t=>t.stop());m.ctx?.close().catch(()=>{});setLevel(0)};
 const begin=()=>{if(!want.current||paused.current)return;const r=new Recognition(),started=Date.now();r.lang=voiceLangs.find(v=>v[0]===code.current)?.[1]||'en-US';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
  r.onresult=e=>{if(rec.current!==r)return;fails.current=0;
   if(modeRef.current==='wake'){for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i],w=parseWake(x[0].transcript);if(!w)continue;activate();latest.current({wake:true});if(x.isFinal){if(w.rest)latest.current({text:w.rest})}return}return}
   bump();let live='';for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i];let text=x[0].transcript.trim();const w=parseWake(text);if(w)text=w.rest;if(x.isFinal){if(text&&!speaking())latest.current({text})}else live+=(live?' ':'')+text}setInterim(speaking()?'':live)};
  r.onerror=e=>{if(rec.current!==r)return;if(fatal.includes(e.error)){stop();latest.current({error:e.error})}};
  r.onend=()=>{if(rec.current!==r)return;rec.current=null;setInterim('');if(!want.current)return;fails.current=Date.now()-started<1500?fails.current+1:0;if(fails.current>=5){stop();latest.current({error:'network'});return}timer.current=setTimeout(begin,fails.current?600:150)};
  rec.current=r;try{r.start()}catch{rec.current=null;timer.current=setTimeout(begin,600)}};
 // The microphone is switched off while a reply is spoken, so the orb never hears and repeats itself.
 const say=(text,lang)=>{paused.current=true;clearTimeout(timer.current);const r=rec.current;rec.current=null;r?.abort();setInterim('');speak(text,lang,()=>{paused.current=false;bump();if(want.current&&!rec.current)timer.current=setTimeout(begin,400)})};
 function stop(){want.current=false;paused.current=false;setMode('off');clearTimeout(timer.current);clearTimeout(idle.current);const r=rec.current;rec.current=null;r?.abort();setInterim('');stopMeter()}
 const start=(c,m='active')=>{if(!Recognition)return;code.current=c;want.current=true;fails.current=0;clearTimeout(timer.current);const old=rec.current;rec.current=null;old?.abort();if(m==='active')activate();else toWake();begin()};
 useEffect(()=>()=>{want.current=false;clearTimeout(timer.current);clearTimeout(idle.current);rec.current?.abort();rec.current=null;stopMeter()},[]);
 const orb=el=>{if(el)orbs.current.add(el)};
 return {supported:!!Recognition,mode,listening:mode==='active',interim,start,stop,activate,toWake,orb,say};
}
export const voicePageLabels={overview:"Обзор",loads:"Грузы",trips:"Рейсы",offers:"Предложения",chat:"Переписка",radar:'Load Radar',lanes:"Выделенные линии",brokers:"Проверка брокеров",fleet:"Автопарк",eld:"Карта автопарка",finances:"Финансы",telegram:'Telegram',integrations:"Интеграции",settings:"Настройки",users:"Пользователи",help:"Помощь"};
const wakeKey='lanilot-voice-wake',posKey='lanilot-voice-position-v2',size=60,gap=12;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
// Default is 30px from the bottom-right corner. Position is kept as the distance from the right and bottom edges and is always clamped to the viewport.
function fit(p){return {right:clamp(p.right,gap,window.innerWidth-size-gap),bottom:clamp(p.bottom,gap,window.innerHeight-size-gap)}}
function initialPosition(){try{const p=JSON.parse(localStorage.getItem(posKey));if(Number.isFinite(p?.right)&&Number.isFinite(p?.bottom))return fit(p)}catch{}return fit({right:30,bottom:30})}
// Floating voice orb on every dashboard screen, the AI assistant included. Every command calls the app's own handlers,
// so voice control never leaves the page; the listening session survives switching sections.
export function FloatingVoice({state,isOwner,labels,assistantOpen,assistant,onNavigate,onOpenLoad,onSearch,onBack}){
 const [code,setCode]=useState(initialVoiceLang),[pos,setPos]=useState(initialPosition),[note,setNote]=useState(null),drag=useRef(null),moved=useRef(false),lastLang=useRef(null),lastReply=useRef(null),lastCommand=useRef(null);
 const [wake,setWake]=useState(()=>{try{return localStorage.getItem(wakeKey)!=='off'}catch{return true}}),wakeRef=useRef(wake);wakeRef.current=wake;
 // Reply texts are shown in the language of the phrase just heard; actions are confirmed with a chime, not speech (errors: in the selected recognition language).
 let sp=code;const t=(key,vars)=>tr(sp,key,vars),reply=(text,heard,tone='ok')=>{setNote({text,heard,tone,id:Math.random()});lastReply.current={text,at:Date.now()};chime(tone==='error'?'error':'ok')};
 useEffect(()=>{for(const c of new Set([...voiceLangs.map(v=>v[0]),lang]))loadVoiceDict(c)},[]);
 // The field the user last worked in, so "type …" still reaches it after a click on the orb took the focus.
 const lastField=useRef(null);useEffect(()=>{const track=e=>{if(editable(e.target))lastField.current=e.target};document.addEventListener('focusin',track);return()=>document.removeEventListener('focusin',track)},[]);
 const voice=useVoice(({text,error,idle,wake:woke})=>{
  if(woke){chime('start');lastLang.current=null;return setNote(null)}
  if(idle)return setNote({text:tr(lastLang.current||code,wakeRef.current?"Скажите «Привет, Лани», чтобы продолжить":"Голосовое управление выключено"),heard:'',tone:'ok',id:Math.random()});
  if(error)return reply(fatal.includes(error)?t("Нет доступа к микрофону. Разрешите его в настройках браузера."):t("Распознавание речи недоступно. Проверьте интернет и включите микрофон снова."),'','error');
  // Our own reply caught by the microphone, or the same command repeated within 4 s, is ignored.
  if(SPOKEN_REPLIES&&lastReply.current&&Date.now()-lastReply.current.at<15000&&isEcho(text,lastReply.current.text))return;
  sp=lastLang.current=spokenLang(text,code);const c=parseVoiceCommand(text,state.loads);
  const key=JSON.stringify([c.type,c.page,c.id,c.dir,c.text]);if(!['scroll','click','type','clear'].includes(c.type)&&lastCommand.current?.key===key&&Date.now()-lastCommand.current.at<4000)return;lastCommand.current={key,at:Date.now()};
  if(c.type==='empty')return;
  // A list may still be loading after the previous click, so a missing control is looked for once more a moment later.
  if(c.type==='click'){const variants=labelVariants(c.target),go=retry=>{const el=findControl(variants),done=actOn(el);if(!done&&retry)return setTimeout(()=>go(false),800);if(done==='external')return reply(t("Эта ссылка ведёт за пределы Lanilot"),text,'error');if(!done)return reply(t("Не нашёл на странице «{0}»",[c.target]),text,'error');if(done==='focused')lastField.current=el;reply(done==='focused'?t("Поле выбрано. Скажите «введи» и текст."):t("Нажимаю «{0}»",[c.target]),text)};return go(true)}
  if(c.type==='type'||c.type==='clear'){const field=editable(document.activeElement)?document.activeElement:lastField.current;if(!typeInto(field,c.type==='type'?c.text:''))return reply(t("Сначала выберите поле: скажите «нажми» и его название."),text,'error');return reply(c.type==='type'?t("Ввёл: {0}",[c.text]):t("Поле очищено"),text)}
  if(c.type==='stop'){if(wakeRef.current){voice.toWake();return reply(t("Скажите «Привет, Лани», чтобы продолжить"),text)}voice.stop();return reply(t("Голосовое управление выключено"),text)}
  if(c.type==='skills')return reply(t("Скажите раздел: «открой рейсы», «настройки». Груз: «груз 2046». Поиск: «Reefer из Чикаго в Даллас». На странице: «нажми Сохранить», «нажми название компании», затем «введи …». А также «вниз», «назад» и «стоп»."),text);
  if(c.type==='scroll'){const area=assistantOpen?document.querySelector('.assistant-conversation'):null,target=area||window,step=Math.round((area?.clientHeight||window.innerHeight)*.7);if(c.dir==='top')target.scrollTo({top:0,behavior:'smooth'});else target.scrollBy({top:c.dir==='down'?step:-step,behavior:'smooth'});return setNote({text:c.dir==='down'?'↓':'↑',heard:text,tone:'ok',id:Math.random()})}
  if(c.type==='back'){onBack();return reply(t("Назад"),text)}
  if(c.type==='newChat'){onNavigate('assistant');setTimeout(()=>assistant.current?.newChat());return reply(t("Новый чат"),text)}
  if(c.type==='openLoad'){if(!c.load)return reply(t("Груз {0} не найден",[c.id]),text,'error');onOpenLoad(c.load);return reply(t("Открываю груз {0}",[c.load.id]),text)}
  if(c.type==='navigate'){if(c.page==='users'&&!isOwner)return reply(t("Раздел доступен только владельцу компании"),text,'error');onNavigate(c.page);return reply(t("Открываю «{0}»",[c.page==='assistant'?t("ИИ-помощник"):t(labels[c.page])]),text)}
  if(c.type==='search'){const found=demoMatches(c.criteria,state.loads,state.defaultCosts).length;if(assistantOpen&&assistant.current)assistant.current.submit(c.text,c.criteria);else onSearch(c.criteria);return reply(found?t("Найдено")+' '+plural(sp,found,"подходящий груз","подходящих груза","подходящих грузов"):t("Ничего не найдено. Измените условия."),text)}
  reply(t("Не понял команду. Скажите «что ты умеешь», чтобы услышать примеры."),text,'error');
 },wakeRef);
 // With the wake phrase on and the microphone already allowed, waiting for "Hey Lani" starts with the page.
 useEffect(()=>{if(!wakeRef.current||!voice.supported)return;let gone=false;navigator.permissions?.query({name:'microphone'}).then(p=>{if(!gone&&p.state==='granted')voice.start(code,'wake')}).catch(()=>{});return()=>{gone=true}},[]);
 useEffect(()=>{if(!note)return;const t=setTimeout(()=>setNote(null),note.tone==='error'?9000:5000);return()=>clearTimeout(t)},[note]);
 useEffect(()=>{const resize=()=>setPos(p=>fit(p));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const down=e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,start:pos};moved.current=false;e.currentTarget.setPointerCapture(e.pointerId)};
 const move=e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!moved.current&&Math.hypot(dx,dy)<5)return;moved.current=true;setPos(fit({right:d.start.right-dx,bottom:d.start.bottom-dy}))};
 const up=()=>{if(!drag.current)return;drag.current=null;if(moved.current)setPos(p=>{try{localStorage.setItem(posKey,JSON.stringify(p))}catch{}return p})};
 const toggle=()=>{if(moved.current){moved.current=false;return}unlockAudio();lastLang.current=null;setNote(null);
  if(voice.mode==='active'){if(wake)voice.toWake();else voice.stop()}else{if(voice.mode==='wake')voice.activate();else voice.start(code);chime('start')}};
 const toggleWake=()=>{unlockAudio();const on=!wake;setWake(on);try{localStorage.setItem(wakeKey,on?'on':'off')}catch{}
  if(on){if(voice.mode==='off')voice.start(code,'wake');setNote({text:__("Скажите «Привет, Лани», чтобы начать"),heard:'',tone:'ok',id:Math.random()})}else{if(voice.mode==='wake')voice.stop();setNote({text:__("«Привет, Лани» выключено"),heard:'',tone:'ok',id:Math.random()})}};
 const nextLang=()=>{const i=voiceLangs.findIndex(v=>v[0]===code),n=voiceLangs[(i+1)%voiceLangs.length][0];setCode(n);saveVoiceLang(n);if(voice.mode!=='off')voice.start(n,voice.mode)};
 if(!voice.supported)return null;
 // The bubble opens toward the middle of the screen so it is never cut off.
 const left=window.innerWidth-pos.right-size,top=window.innerHeight-pos.bottom-size,width=Math.min(320,window.innerWidth-gap*2);
 const bubble={width,left:clamp(left+size/2<window.innerWidth/2?left:left+size-width,gap,window.innerWidth-width-gap),...(top+size/2>window.innerHeight/2?{bottom:pos.bottom+size+12}:{top:top+size+12})};
 const label=voiceLangs.find(v=>v[0]===code)?.[2],live=voice.listening&&voice.interim;
 return <div className="voice-float">{(live||note)&&<div className={'voice-float-bubble'+(note?.tone==='error'&&!live?' is-error':'')} style={bubble} role="status" aria-live="polite">{live?<p className="voice-float-live">{voice.interim}</p>:<><p>{note.heard&&<q>{note.heard}</q>}<span>{note.text}</span></p><button type="button" aria-label={__("Скрыть ответ")} onClick={()=>setNote(null)}><X size={14}/></button></>}</div>}
  <div className={'voice-float-anchor'+(voice.listening?' is-listening':voice.mode==='wake'?' is-waiting':'')} style={{right:pos.right,bottom:pos.bottom}}>
   <button type="button" className="voice-orb-button" aria-pressed={voice.listening} aria-label={voice.listening?__("Выключить голосовое управление"):__("Включить голосовое управление")} title={(voice.listening?__("Выключить голосовое управление"):voice.mode==='wake'?__("Скажите «Привет, Лани» или нажмите, чтобы начать"):__("Включить голосовое управление"))+' · '+__("перетащите, чтобы переместить")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={toggle}>
    <span className="voice-orb" ref={voice.orb} aria-hidden="true"><i/><i/><i/><i/></span>{!voice.listening&&<Mic className="voice-orb-icon" size={22} aria-hidden="true"/>}
   </button>
   <button type="button" className="voice-float-lang" onClick={nextLang} title={__("Язык голосовых команд")} aria-label={__("Язык голосовых команд: {0}",[label])}>{label}</button>
   <button type="button" className={'voice-float-wake'+(wake?' is-on':'')} aria-pressed={wake} onClick={toggleWake} title={wake?__("«Привет, Лани» включено — нажмите, чтобы выключить"):__("Включить «Привет, Лани»")} aria-label={__("Голосовая активация «Привет, Лани»")}><Ear size={12}/></button>
  </div></div>;
}
