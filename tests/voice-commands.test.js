import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceCommand,normalize,spokenLang,isEcho,speechText} from '../src/voice-commands.js';
const loads=[{id:'LD-2046',origin:'Chicago, IL',destination:'Dallas, TX',equipment:'Reefer'},{id:'LD-3110',origin:'Dallas, TX',destination:'Phoenix, AZ',equipment:'Dry Van'}];
const page=t=>{const c=parseVoiceCommand(t,loads);return c.type==='navigate'?c.page:c.type};

test('voice: sections in Russian, English and Spanish',()=>{
 for(const [text,expected] of [
  ['Открой рейсы','trips'],['покажи грузы','loads'],['Карта автопарка','eld'],['перейди в автопарк','fleet'],['грузовики','fleet'],['открой настройки','settings'],['Финансы','finances'],['выделенные линии','lanes'],['проверка брокеров','brokers'],['переписка','chat'],['Load Radar','radar'],['главная','overview'],
  ['Open trips','trips'],['go to the fleet map','eld'],['show me the loads','loads'],['open settings','settings'],['dashboard','overview'],['open inbox','chat'],['integrations','integrations'],
  ['Abre los viajes','trips'],['ir a la configuración','settings'],['mostrar las cargas','loads'],['abre el mapa','eld'],['finanzas','finances'],['ofertas','offers'],['ir al inicio','overview'],['usuarios','users'],['открой ИИ помощник','assistant'],['open the AI assistant','assistant'],['abre el asistente','assistant'],['справка','help'],['посмотри оферы','offers'],['покажи офферы','offers'],['открой лоуды','loads'],['трипы','trips'],['открой сеттинги','settings'],['настроики','settings'],['open setings','settings'],['open the ofers','offers'],['finanses','finances'],
 ])assert.equal(page(text),expected,text);
});

test('voice: control words, load numbers and searches',()=>{
 for(const [text,expected] of [['стоп','stop'],['Stop','stop'],['basta','stop'],['назад','back'],['go back','back'],['volver','back'],['новый чат','newChat'],['new chat','newChat'],['nuevo chat','newChat'],['что ты умеешь?','skills'],['What can you do','skills'],['¿Qué puedes hacer?','skills'],['','empty']])assert.equal(page(text),expected,text);
 assert.equal(parseVoiceCommand('открой груз 2046',loads).load.id,'LD-2046');
 assert.equal(parseVoiceCommand('load LD 3110',loads).load.id,'LD-3110');
 assert.equal(parseVoiceCommand('carga número 2046',loads).load.id,'LD-2046');
 assert.equal(parseVoiceCommand('груз 9999',loads).load,null);
 const ru=parseVoiceCommand('найди грузы из Чикаго в Даллас',loads);assert.equal(ru.type,'search');assert.equal(ru.criteria.origin,'Chicago, IL');assert.equal(ru.criteria.destination,'Dallas, TX');
 const es=parseVoiceCommand('cargas refrigeradas desde Dallas a Phoenix',loads);assert.equal(es.type,'search');assert.equal(es.criteria.origin,'Dallas, TX');assert.equal(es.criteria.destination,'Phoenix, AZ');assert.equal(es.criteria.equipment,'Reefer');
 assert.equal(parseVoiceCommand('Dry Van loads from Dallas',loads).criteria.equipment,'Dry Van');
 assert.equal(page('расскажи анекдот'),'unknown');
 assert.equal(normalize('Configuración — ¡ya!'),'configuracion ya');
});

test('voice: scrolling inside the page',()=>{
 for(const [text,dir] of [['вниз','down'],['прокрути вниз','down'],['scroll down','down'],['baja','down'],['вверх','up'],['scroll up','up'],['arriba','up'],['наверх','top'],['scroll to top','top'],['al principio','top']]){const c=parseVoiceCommand(text,[]);assert.equal(c.type,'scroll',text);assert.equal(c.dir,dir,text)}
});

test('voice: reply language follows the phrase',()=>{
 for(const [text,sel,exp] of [['посмотри оферы','en','ru'],['open finances','ru','en'],['abre los viajes','ru','es'],['¿qué puedes hacer?','en','es'],['configuración','en','es'],['show trips','es','en'],['2046','es','es']])assert.equal(spokenLang(text,sel),exp,text);
});

test('voice: own replies heard by the microphone are recognised as echo',()=>{
 assert.ok(isEcho('открываю предложения','Открываю «Предложения»'));
 assert.ok(isEcho('opening offers','Opening “Offers”'));
 assert.ok(isEcho('abriendo viajes','Abriendo «Viajes»'));
 assert.ok(isEcho('найдено 2 подходящих груза','Найдено 2 подходящих груза'));
 assert.ok(!isEcho('открой настройки','Открываю «Предложения»'));
 assert.ok(!isEcho('open settings','Opening “Offers”'));
});

test('voice: symbols are never spoken',()=>{
 assert.equal(speechText('Не понял команду. Скажите «что ты умеешь», чтобы услышать примеры.'),'Не понял команду. Скажите что ты умеешь, чтобы услышать примеры.');
 assert.equal(speechText('Opening “Offers”'),'Opening Offers');
 assert.equal(speechText('Открываю груз LD-2046'),'Открываю груз LD 2046');
 assert.equal(speechText('Path \\ a/b → c * "x" (y) [z] {w} #1 @ $ % ^ & | ~ `'),'Path a b c x y z w 1');
 assert.equal(speechText('¿Qué puedes hacer?'),'Qué puedes hacer?');
});
