// Employee records (personal data, identity document, job, emergency contact) kept with company members and invitations.
// Only names, email and role are stored in clear text; everything else is sealed with AES-256-GCM (key file next to the database).
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {currentTenant} from './tenancy.js';

export const staffOptions={gender:['male','female'],documentType:['passport','id_card','foreign_passport','residence_permit','green_card'],role:['owner','dispatcher','updater','viewer']};
const textFields={middleName:60,birthPlace:120,documentIssuer:160,taxId:20,phone:40,address:200,position:80,emergencyName:100,emergencyPhone:40,notes:1000};
const dateFields=['birthDate','documentIssued','documentExpires','hireDate'];
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;

export function validateStaff(b={}){
 const fail=m=>{throw Error(m)},str=(v,max)=>typeof v==='string'&&v.trim().length<=max?v.trim():fail('Проверьте поля сотрудника'),p={};
 for(const [k,max] of [['lastName',60],['firstName',60],['citizenship',60],['documentNumber',30],['email',160]])p[k]=str(b[k]??'',max);
 if(!p.lastName||!p.firstName)fail('Укажите фамилию и имя');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))fail('Укажите корректный email');
 if(!p.citizenship)fail('Укажите гражданство');
 for(const [k,max] of Object.entries(textFields))p[k]=str(b[k]??'',max);
 for(const k of dateFields){p[k]=str(b[k]??'',10);if(p[k]&&!validDate(p[k]))fail('Проверьте даты')}
 const today=new Date().toISOString().slice(0,10);
 if(!p.birthDate)fail('Укажите дату рождения');
 const age=(Date.now()-Date.parse(p.birthDate))/31557600000;if(age<16||age>100)fail('Дата рождения: возраст от 16 до 100 лет');
 p.gender=b.gender??'';if(p.gender&&!staffOptions.gender.includes(p.gender))fail('Проверьте поля сотрудника');
 p.documentType=b.documentType;if(!staffOptions.documentType.includes(p.documentType))fail('Выберите тип документа');
 p.documentNumber=p.documentNumber.toUpperCase();if(!/^[A-Z0-9][A-Z0-9 -]{3,29}$/.test(p.documentNumber))fail('Номер документа: буквы и цифры');
 if(p.documentIssued&&p.documentIssued>today)fail('Дата выдачи не может быть в будущем');
 if(p.documentIssued&&p.documentExpires&&p.documentExpires<p.documentIssued)fail('Срок действия документа раньше даты выдачи');
 return p;
}

export function installStaff(db,dbPath){
 db.exec('CREATE TABLE IF NOT EXISTS staff(id TEXT PRIMARY KEY,email TEXT NOT NULL,first_name TEXT NOT NULL,last_name TEXT NOT NULL,sealed TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)');
 let key;if(dbPath===':memory:')key=randomBytes(32);else{const path=dbPath+'.staff.key';if(!existsSync(path))writeFileSync(path,randomBytes(32),{flag:'wx',mode:0o600});key=readFileSync(path)}if(key.length!==32)throw Error('Invalid staff key');
 const seal=data=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(JSON.stringify(data),'utf8'),c.final()]);return [iv,c.getAuthTag(),body].map(b=>b.toString('base64')).join('.')};
 const open=s=>{const [iv,tag,body]=s.split('.').map(v=>Buffer.from(v,'base64'));const c=createDecipheriv('aes-256-gcm',key,iv);c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(body),c.final()]).toString())};
 return {seal,open};
}

export function registerStaffRoutes(app,db,vault,access){
 const owner=(req,res)=>{if(currentTenant()?.role!=='owner'){res.status(403).json({error:'Это действие доступно только владельцу'});return false}return true};
 const companyId=()=>currentTenant().companyId;
 const byEmail=email=>db.prepare('SELECT * FROM staff WHERE lower(email)=lower(?)').get(email);
 const member=email=>db.raw.prepare('SELECT u.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.email=?').get(companyId(),email);
 const full=row=>({id:row.id,...vault.open(row.sealed),email:row.email,firstName:row.first_name,lastName:row.last_name,updatedAt:row.updated_at});
 const masked=v=>v?'•••• '+v.slice(-4):'';
 app.get('/api/users/staff',(req,res)=>{if(!owner(req,res))return;res.json(db.prepare('SELECT * FROM staff ORDER BY last_name,first_name').all().map(row=>{const d=vault.open(row.sealed);return {id:row.id,email:row.email,firstName:row.first_name,lastName:row.last_name,position:d.position,citizenship:d.citizenship,document:masked(d.documentNumber),documentExpires:d.documentExpires}}))});
 app.get('/api/users/staff/:id',(req,res)=>{if(!owner(req,res))return;const row=db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({error:'Сотрудник не найден'});res.json(full(row))});
 // New employee: saves the record and, unless the person is already a member, creates an invitation with the chosen role.
 app.post('/api/users/staff',(req,res,next)=>{try{
  if(!owner(req,res))return;const p=validateStaff(req.body),{role}=req.body??{};
  if(byEmail(p.email))return res.status(409).json({error:'Сотрудник с таким email уже есть'});
  const isMember=!!member(p.email);if(!isMember&&!staffOptions.role.includes(role))return res.status(400).json({error:'Укажите роль'});
  const id='stf-'+randomBytes(8).toString('hex'),now=new Date().toISOString(),{email,firstName,lastName,...rest}=p;
  db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,?,?)').run(id,email,firstName,lastName,vault.seal(rest),now,now);
  res.status(201).json({id,path:isMember?null:access.createInvite(companyId(),email,role),role:isMember?null:role});
 }catch(e){next(e)}});
 app.put('/api/users/staff/:id',(req,res,next)=>{try{
  if(!owner(req,res))return;const row=db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({error:'Сотрудник не найден'});
  const p=validateStaff(req.body);if(p.email.toLowerCase()!==row.email.toLowerCase())return res.status(400).json({error:'Email сотрудника изменить нельзя'});
  const {email,firstName,lastName,...rest}=p;db.prepare('UPDATE staff SET first_name=?,last_name=?,sealed=?,updated_at=? WHERE id=?').run(firstName,lastName,vault.seal(rest),new Date().toISOString(),row.id);res.json({ok:true});
 }catch(e){next(e)}});
 app.delete('/api/users/staff/:id',(req,res)=>{if(!owner(req,res))return;const row=db.prepare('SELECT id FROM staff WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({error:'Сотрудник не найден'});db.prepare('DELETE FROM staff WHERE id=?').run(row.id);res.json({ok:true})});
}
