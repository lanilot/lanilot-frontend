// White-label branding: accent color, logo and the public landing of a company (shown on its own subdomain).
import express from 'express';
import {asCompany} from './tenancy.js';

// logoMode: the uploaded picture ('image') or the company name written as a wordmark ('text', logoText).
export const defaultBranding={color:'#2858ef',landingEnabled:true,headline:'',description:'',logoMode:'image',logoText:''};
export const LOGO_MAX=512*1024;
// Accent colors must keep white button text readable (contrast ≥ 3:1 against white).
const luminance=hex=>{const [r,g,b]=[1,3,5].map(i=>{const c=parseInt(hex.slice(i,i+2),16)/255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
export function validateBranding(b={}){
 const out={...defaultBranding};
 if(b.color!==undefined){if(typeof b.color!=='string'||!/^#[0-9a-f]{6}$/i.test(b.color))throw Error('Цвет бренда: формат #RRGGBB');if(1.05/(luminance(b.color)+.05)<3)throw Error('Цвет бренда слишком светлый: текст на кнопках не будет читаться');out.color=b.color.toLowerCase()}
 if(b.landingEnabled!==undefined){if(typeof b.landingEnabled!=='boolean')throw Error('Проверьте настройки страницы компании');out.landingEnabled=b.landingEnabled}
 if(b.logoMode!==undefined){if(!['image','text'].includes(b.logoMode))throw Error('Выберите вид логотипа');out.logoMode=b.logoMode}
 if(b.logoText!==undefined){if(typeof b.logoText!=='string'||b.logoText.trim().length>40)throw Error('Логотип текстом: до 40 символов');out.logoText=b.logoText.trim().replace(/\s+/g,' ')}
 if(out.logoMode==='text'&&!out.logoText)throw Error('Напишите текст логотипа');
 for(const [k,max] of [['headline',120],['description',600]]){const v=b[k]??'';if(typeof v!=='string'||v.trim().length>max)throw Error('Проверьте тексты страницы компании');out[k]=v.trim()}
 return out;
}
// PNG, JPEG or WebP by signature; SVG is refused because it can carry scripts.
export function imageType(buf){
 if(buf.length>8&&buf[0]===0x89&&buf.toString('ascii',1,4)==='PNG')return 'image/png';
 if(buf.length>3&&buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff)return 'image/jpeg';
 if(buf.length>12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
export function installBranding(db){db.exec('CREATE TABLE IF NOT EXISTS brand_assets(id TEXT PRIMARY KEY,mime TEXT NOT NULL,data BLOB NOT NULL,updated_at TEXT NOT NULL)')}

export function brandingReader(db,readSettings){
 // Public brand of a company: what its sign-in screen, sidebar and landing show.
 return companyId=>asCompany(companyId,()=>{
  const s=readSettings(),b=s.branding,logo=db.prepare("SELECT updated_at FROM brand_assets WHERE id='logo'").get();
  const ops=s.operations,c=s.company;
  const text=b.logoMode==='text'&&b.logoText?b.logoText:null;
  return {name:c.name,color:b.color,logo:logo&&!text?`/api/brand/logo?v=${encodeURIComponent(logo.updated_at)}`:null,logoText:text,
   landing:b.landingEnabled?{headline:b.headline,description:b.description,phone:c.phone,email:c.email,website:c.website,city:c.city,mc:c.mc,dot:c.dot,businessType:c.businessType,equipment:ops.equipment,fleetSize:ops.fleetSize,
    // Public facts only: lane routes without brokers or rates, and the fleet size.
    lanes:db.prepare('SELECT origin,destination,equipment,days FROM lanes WHERE active=1 ORDER BY created_at LIMIT 6').all().map(l=>({origin:l.origin,destination:l.destination,equipment:l.equipment,perWeek:String(l.days).split(',').filter(Boolean).length})),
    trucks:db.prepare('SELECT count(*) n FROM trucks').get().n}:null};
 });
}

export function registerBrandingRoutes(app,db){
 // Public: the sign-in screen shows the logo before anyone signs in.
 app.get('/api/brand/logo',(req,res)=>{
  const row=asCompany(req.company.id,()=>db.prepare("SELECT * FROM brand_assets WHERE id='logo'").get());if(!row)return res.status(404).json({error:'Логотип не загружен'});
  res.set({'Content-Type':row.mime,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});res.send(Buffer.from(row.data));
 });
}
export function registerLogoRoutes(app,db){
 // Owner-only (see ownerOnly in auth.js): raw image body.
 app.put('/api/settings/logo',express.raw({type:()=>true,limit:LOGO_MAX}),(req,res)=>{
  const buf=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0),mime=imageType(buf);
  if(!mime)return res.status(400).json({error:'Логотип: PNG, JPEG или WebP до 512 КБ'});
  const now=new Date().toISOString();db.prepare("DELETE FROM brand_assets WHERE id='logo'").run();db.prepare("INSERT INTO brand_assets VALUES('logo',?,?,?)").run(mime,buf,now);res.json({ok:true,logo:`/api/brand/logo?v=${encodeURIComponent(now)}`});
 });
 app.delete('/api/settings/logo',(req,res)=>{db.prepare("DELETE FROM brand_assets WHERE id='logo'").run();res.json({ok:true})});
}
