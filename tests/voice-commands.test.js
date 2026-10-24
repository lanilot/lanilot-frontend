import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceCommand,normalize,spokenLang,isEcho,speechText,parseWake} from '../src/voice-commands.js';
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

test('voice: wake phrase in English, Spanish and Russian',()=>{
 for(const t of ['Lani','Hey Lani','hello lani','Hi, Lani!','Hola Lani','Привет, Лани','привет лани','Эй, Лени','Лени','hey lonnie','ok lani'])assert.deepEqual(parseWake(t),{rest:''},t);
 assert.deepEqual(parseWake('Hey Lani open trips'),{rest:'open trips'});
 assert.equal(parseVoiceCommand(parseWake('Привет Лани открой рейсы').rest,[]).page,'trips');
 for(const t of ['открой рейсы','из-за лени ничего','hello world','plan a trip with lani'])assert.equal(parseWake(t),null,t);
});

test('voice: page actions — click, type, clear',()=>{
 for(const [text,target] of [['Click company name','company name'],['click on the Save button','save button'],['press Save','save'],['нажми на Сохранить','сохранить'],['Кликни по названию компании','названию компании'],['выбери Reefer','reefer'],['haz clic en Guardar','guardar'],['pulsa el botón guardar','boton guardar']]){const c=parseVoiceCommand(text,[]);assert.equal(c.type,'click',text);assert.equal(c.target,target,text)}
 assert.deepEqual(parseVoiceCommand('type Demo Haul LLC',[]),{type:'type',text:'Demo Haul LLC'});
 assert.deepEqual(parseVoiceCommand('Введи «Демо Хол»',[]),{type:'type',text:'Демо Хол'});
 assert.deepEqual(parseVoiceCommand('escribe Transportes Núñez.',[]),{type:'type',text:'Transportes Núñez'});
 for(const t of ['clear the field','очисти поле','borra el campo'])assert.equal(parseVoiceCommand(t,[]).type,'clear',t);
 assert.equal(parseVoiceCommand('открой рейсы',[]).page,'trips');
});

test('voice: control labels match spoken names',async()=>{
 const {scoreLabel,splitTarget}=await import('../src/voice-page.js');
 assert.deepEqual(splitTarget('company name field'),{text:'company name',kind:'field'});
 assert.deepEqual(splitTarget('кнопку сохранить'),{text:'сохранить',kind:'button'});
 assert.ok(scoreLabel('Company name','company name')===100);
 assert.ok(scoreLabel('Название компании','названию компании')>=45);
 assert.ok(scoreLabel('Save changes','save')>=45);
 assert.ok(scoreLabel('Guardar cambios','guardar')>=45);
 assert.equal(scoreLabel('Delete company','company name'),Math.round(70*1/2*Math.min(1,3/2)));
 assert.ok(scoreLabel('Delete company','company name')<45);
 assert.equal(scoreLabel('Fleet','company name'),0);
});
