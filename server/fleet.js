export const equipmentTypes=['Dry Van','Reefer','Flatbed','Box Truck','Cargo Van','Power Only'];
export const driverAvailability={available:'Доступен',off_duty:'Не на смене',vacation:'В отпуске',inactive:'Неактивен'};
export const truckAvailability={available:'Доступна',maintenance:'На обслуживании',inactive:'Неактивна'};
export function installFleet(db){
 for(const [table,columns] of Object.entries({drivers:{phone:"TEXT NOT NULL DEFAULT ''",location:"TEXT NOT NULL DEFAULT ''",equipment:"TEXT NOT NULL DEFAULT 'Any'",availability:"TEXT NOT NULL DEFAULT 'available'",notes:"TEXT NOT NULL DEFAULT ''"},trucks:{plate:"TEXT NOT NULL DEFAULT ''",location:"TEXT NOT NULL DEFAULT ''",availability:"TEXT NOT NULL DEFAULT 'available'",notes:"TEXT NOT NULL DEFAULT ''"}})){
  const existing=db.prepare(`PRAGMA table_info(${table})`).all();for(const [name,type] of Object.entries(columns))if(!existing.some(c=>c.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
 }
}
export function registerFleetRoutes(app,db){
 for(const kind of ['drivers','trucks']){
  const save=(req,res,next)=>{try{
   const editing=req.method==='PUT',body=req.body??{},old=editing?db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(req.params.id):null;
   if(editing&&!old)return res.status(404).json({error:'Запись не найдена'});
   const clean={};const fields=kind==='drivers'?{name:100,phone:40,location:100,equipment:40,availability:30,notes:1000}:{id:40,plate:40,location:100,equipment:40,availability:30,notes:1000};
   for(const [key,max] of Object.entries(fields)){const value=key==='id'&&editing?old.id:body[key]??'';if(typeof value!=='string'||value.trim().length>max)return res.status(400).json({error:'Проверьте поля формы'});clean[key]=value.trim()}
   const statuses=kind==='drivers'?driverAvailability:truckAvailability;
   if(!Object.hasOwn(statuses,clean.availability)||!(kind==='drivers'?['Any',...equipmentTypes]:equipmentTypes).includes(clean.equipment))return res.status(400).json({error:'Выберите доступность и тип техники из списка'});
   if(kind==='drivers'&&!clean.name||kind==='trucks'&&!/^[\p{L}\p{N} _.-]{1,40}$/u.test(clean.id))return res.status(400).json({error:kind==='drivers'?'Укажите имя водителя':'Укажите номер машины (буквы, цифры, пробел, дефис, точка)'});
   const column=kind==='drivers'?'name':'id',key=kind==='drivers'?clean.name:clean.id;
   const duplicate=db.prepare(`SELECT id FROM ${kind} WHERE lower(trim(${column}))=lower(?) AND id<>?`).get(key,old?.id??'');if(duplicate)return res.status(409).json({error:kind==='drivers'?'Водитель с таким именем уже существует':'Машина с таким номером уже существует'});
   const tripColumn=kind==='drivers'?'driver':'truck',oldValue=kind==='drivers'?old?.name:old?.id;
   const assigned=old&&db.prepare(`SELECT id FROM trips WHERE lower(trim(${tripColumn}))=lower(?) AND status IN ('planned','in_transit')`).get(oldValue);
   if(assigned&&(clean.availability!=='available'||clean.equipment!==old.equipment))return res.status(409).json({error:'Есть активные назначения. Сначала переназначьте или завершите рейсы, затем меняйте доступность или тип техники.'});
   const id=old?.id??(kind==='drivers'?'DRV-'+crypto.randomUUID():clean.id);
   db.exec('BEGIN IMMEDIATE');try{
    if(kind==='drivers'){
     if(editing){db.prepare('UPDATE drivers SET name=?,phone=?,location=?,equipment=?,availability=?,notes=? WHERE id=?').run(clean.name,clean.phone,clean.location,clean.equipment,clean.availability,clean.notes,id);if(clean.name!==old.name)db.prepare('UPDATE trips SET driver=? WHERE lower(trim(driver))=lower(?)').run(clean.name,old.name)}
     else db.prepare('INSERT INTO drivers(id,name,phone,location,equipment,availability,notes) VALUES(?,?,?,?,?,?,?)').run(id,clean.name,clean.phone,clean.location,clean.equipment,clean.availability,clean.notes);
    }else{
     if(editing)db.prepare('UPDATE trucks SET plate=?,location=?,equipment=?,availability=?,notes=? WHERE id=?').run(clean.plate,clean.location,clean.equipment,clean.availability,clean.notes,id);
     else db.prepare('INSERT INTO trucks(id,plate,location,equipment,availability,notes) VALUES(?,?,?,?,?,?)').run(id,clean.plate,clean.location,clean.equipment,clean.availability,clean.notes);
    }
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e}
   res.status(editing?200:201).json(db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(id));
  }catch(e){next(e)}};
  app.post('/api/'+kind,save);app.put('/api/'+kind+'/:id',save);
 }
}
export function assignmentAvailabilityError(db,driver,truck,status){
 if(!['planned','in_transit'].includes(status))return null;
 const d=db.prepare('SELECT availability FROM drivers WHERE lower(trim(name))=lower(?)').get(driver.trim()),t=db.prepare('SELECT availability FROM trucks WHERE lower(trim(id))=lower(?)').get(truck.trim());
 if(d&&d.availability!=='available')return 'Водитель недоступен для назначения. Проверьте его доступность в автопарке.';
 if(t&&t.availability!=='available')return 'Машина недоступна для назначения. Проверьте её доступность в автопарке.';
 return null;
}
