import {seedLoads} from './seed.js';
import {defaultCosts,brokerDraft} from './domain.js';

// Stable IDs make startup seeding additive: user edits and cancellations survive.
export function seedDemoData(db){
 const loads=db.prepare('SELECT data FROM loads').all().map(r=>JSON.parse(r.data));
 const fixtures=[
  ['LD-2042','draft',2950],['LD-2043','awaiting',1850],
  ['LD-2044','accepted',2850,'planned','Daniel Brooks','TRK-204'],
  ['LD-2046','accepted',2250,'in_transit','Alex Morgan','TRK-108'],
  ['LD-2047','accepted',2450,'delivered','Michael Davis','TRK-302'],
  ['LD-2048','accepted',1150,'completed','Sam Wilson','TRK-156'],
  ['LD-2052','rejected',3000],['LD-2049','accepted',1750],['LD-2050','accepted',1450,'cancelled','Casey Taylor','TRK-402'],['LD-2051','accepted',1550,'cancelled','Alex Morgan','TRK-108']
 ];
 for(const [id,name] of [['DRV-108','Alex Morgan'],['DRV-204','Daniel Brooks'],['DRV-302','Michael Davis'],['DRV-156','Sam Wilson'],['DRV-401','Jordan Miller'],['DRV-402','Casey Taylor']])db.prepare('INSERT OR IGNORE INTO drivers(id,name) VALUES(?,?)').run(id,name);
 for(const [id,equipment] of [['TRK-108','Dry Van'],['TRK-204','Reefer'],['TRK-302','Dry Van'],['TRK-156','Dry Van'],['TRK-401','Flatbed'],['TRK-402','Box Truck']])db.prepare('INSERT OR IGNORE INTO trucks(id,equipment) VALUES(?,?)').run(id,equipment);
 db.prepare('INSERT OR IGNORE INTO drivers(id,name,phone,location,equipment,availability,notes) VALUES(?,?,?,?,?,?,?)').run('DRV-501','Taylor Reed','+1 312 555 0151','Chicago, IL','Reefer','vacation','Демо: в отпуске, недоступен для назначений.');
 db.prepare('INSERT OR IGNORE INTO drivers(id,name,phone,location,equipment,availability,notes) VALUES(?,?,?,?,?,?,?)').run('DRV-502','Morgan Lee','+1 312 555 0152','Dallas, TX','Dry Van','off_duty','Демо: не на смене.');
 db.prepare('INSERT OR IGNORE INTO trucks(id,equipment,plate,location,availability,notes) VALUES(?,?,?,?,?,?)').run('TRK-501','Reefer','DEMO-501','Chicago, IL','maintenance','Демо: плановое обслуживание.');
 db.prepare('INSERT OR IGNORE INTO trucks(id,equipment,plate,location,availability,notes) VALUES(?,?,?,?,?,?)').run('TRK-502','Cargo Van','DEMO-502','Dallas, TX','inactive','Демо: машина временно неактивна.');
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const [loadId,status,rate,tripStatus,driver,truck] of fixtures){
   const l=loads.find(x=>x.id===loadId);if(!l)continue;
   const id=`seed-offer-${loadId}`;
   const existing=db.prepare("SELECT id FROM offers WHERE load_id=? AND status IN ('draft','awaiting','accepted')").get(loadId);
   if(!existing||existing.id===id){
    db.prepare('INSERT OR IGNORE INTO offers VALUES(?,?,?,?,?,?,?)').run(id,loadId,rate,status,brokerDraft(l,rate),JSON.stringify(defaultCosts),new Date(Date.now()-3600000*4).toISOString());
   }
   const offer=db.prepare('SELECT * FROM offers WHERE id=?').get(id);
   if(tripStatus&&offer?.status==='accepted'&&!db.prepare('SELECT id FROM trips WHERE load_id=?').get(loadId)){
    db.prepare('INSERT OR IGNORE INTO trips(id,offer_id,load_id,status,driver,truck,created_at,pickup,delivery,cancellation_reason,cancelled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(`seed-trip-${loadId}`,id,loadId,tripStatus,driver,truck,new Date(Date.now()-3600000*3).toISOString(),l.pickup,l.delivery,tripStatus==='cancelled'?'Брокер отменил погрузку: груз не готов. Демо-сценарий.':null,tripStatus==='cancelled'?new Date(Date.now()-3600000).toISOString():null);
   }
  }
  for(const loadId of ['LD-2050','LD-2051']){
   const trip=db.prepare('SELECT * FROM trips WHERE id=?').get(`seed-trip-${loadId}`);
   if(trip?.status==='cancelled'&&!db.prepare("SELECT id FROM trip_history WHERE trip_id=? AND action='cancelled'").get(trip.id))db.prepare('INSERT OR IGNORE INTO trip_history VALUES(?,?,?,?,?,?)').run(`seed-cancel-${loadId}`,trip.id,'cancelled','cancelled',trip.cancellation_reason,trip.cancelled_at);
  }
  for(const l of loads){
   const offer=db.prepare("SELECT * FROM offers WHERE load_id=? AND status NOT IN ('cancelled','rejected') ORDER BY created_at DESC LIMIT 1").get(l.id);
   const rate=offer?.rate??l.rate;
   const inquiry=`Hi ${l.broker} team, is your ${l.equipment} load from ${l.origin} to ${l.destination} still available? Can you do $${rate.toLocaleString('en-US')} all-in?`;
   const response=offer?.status==='accepted'
    ?`Confirmed at $${rate.toLocaleString('en-US')} all-in. Pickup is ${l.window} on ${l.pickup}. Please review the appointment details before dispatching your driver.`
    :`Hi! This load is available. We have $${l.rate.toLocaleString('en-US')} all-in for ${l.origin} → ${l.destination}. Pickup ${l.window}. What is your truck's availability?`;
   const entries=[['dispatcher',inquiry,90],['broker',response,65]];
   if(l.id==='LD-2045')entries.push(['dispatcher','Our truck will be empty nearby. Is the pickup appointment firm, and is there any flexibility on the rate?',30],['broker','The appointment is firm. Let me check with our pricing team. Please send your target rate and empty location.',12]);
   entries.forEach(([sender,body,minutes],i)=>{
    db.prepare('INSERT OR IGNORE INTO messages(id,load_id,offer_id,sender,body,client_key,created_at,read_at) VALUES(?,?,?,?,?,?,?,?)').run(`seed-message-${l.id}-${i}`,l.id,offer?.id??null,sender,body,null,new Date(Date.now()-minutes*60000).toISOString(),sender==='dispatcher'?new Date().toISOString():null);
   });
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
}
export function seedMissingLoads(db){
 const insert=db.prepare('INSERT OR IGNORE INTO loads VALUES(?,?)');
 for(const l of seedLoads())insert.run(l.id,JSON.stringify(l));
}
