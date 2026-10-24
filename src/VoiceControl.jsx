import {useEffect,useRef,useState} from 'react';
import {Mic,Square} from 'lucide-react';
import {__,lang,appLocale} from './i18n.js';
import {voiceLangs} from './voice-commands.js';
const Recognition=typeof window==='undefined'?null:window.SpeechRecognition||window.webkitSpeechRecognition||null;
const langKey='lanilot-voice-lang';
export function initialVoiceLang(){try{const saved=localStorage.getItem(langKey);if(voiceLangs.some(v=>v[0]===saved))return saved}catch{}return ['ru','es'].includes(lang)?lang:'en'}
export function saveVoiceLang(code){try{localStorage.setItem(langKey,code)}catch{}}
// Replies are written in the interface language, so they are spoken with its voice.
export function speak(text){try{const synth=window.speechSynthesis;if(!synth||!text)return;synth.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=appLocale;const voice=synth.getVoices().find(v=>v.lang?.toLowerCase().startsWith(lang));if(voice)u.voice=voice;synth.speak(u)}catch{}}
// One utterance per press: interim text is shown while speaking, the final phrase goes to onResult({text}) or onResult({error}).
export function useVoice(onResult){
 const rec=useRef(null),latest=useRef(onResult),[listening,setListening]=useState(false),[interim,setInterim]=useState('');latest.current=onResult;
 const stop=()=>{const r=rec.current;rec.current=null;setListening(false);setInterim('');r?.abort()};
 const start=code=>{if(!Recognition)return;stop();try{window.speechSynthesis?.cancel()}catch{}
  const r=new Recognition();let done=false;r.lang=voiceLangs.find(v=>v[0]===code)?.[1]||'en-US';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
  r.onresult=e=>{if(rec.current!==r)return;const text=[...e.results].map(x=>x[0].transcript).join('');setInterim(text);if(e.results[e.results.length-1].isFinal&&!done){done=true;latest.current({text})}};
  r.onerror=e=>{if(rec.current!==r||done)return;done=true;latest.current({error:e.error})};
  r.onend=()=>{if(rec.current!==r)return;rec.current=null;setListening(false);setInterim('');if(!done)latest.current({error:'no-speech'})};
  rec.current=r;setListening(true);try{r.start()}catch{rec.current=null;setListening(false);latest.current({error:'start'})}};
 useEffect(()=>()=>{const r=rec.current;rec.current=null;r?.abort()},[]);
 return {supported:!!Recognition,listening,interim,start,stop};
}
export function VoiceButtons({voice,code,onCode}){
 const next=()=>{const i=voiceLangs.findIndex(v=>v[0]===code),n=voiceLangs[(i+1)%voiceLangs.length][0];onCode(n);saveVoiceLang(n);if(voice.listening)voice.start(n)};
 const label=voiceLangs.find(v=>v[0]===code)?.[2];
 return <div className="ai-voice-controls"><button type="button" className="ai-voice-lang" onClick={next} title={__("Язык голосовых команд")} aria-label={__("Язык голосовых команд: {0}",[label])}>{label}</button><button type="button" className={'icon-button ai-voice-mic'+(voice.listening?' is-listening':'')} disabled={!voice.supported} aria-pressed={voice.listening} title={!voice.supported?__("Голосовое управление не поддерживается этим браузером"):voice.listening?__("Остановить запись"):__("Голосовая команда")} aria-label={voice.listening?__("Остановить запись"):__("Голосовая команда")} onClick={()=>voice.listening?voice.stop():voice.start(code)}>{voice.listening?<Square size={14} fill="currentColor"/>:<Mic size={19}/>}</button></div>;
}
