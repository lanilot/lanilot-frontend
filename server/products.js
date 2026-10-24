// Lanilot products. Each one lives at <product>.<company>.<domain>; only the dispatch dashboard (dash) is built yet,
// the others open a "coming soon" page. Access is bought per product by the company and inherited by all its members.
// After every sign-in the user picks a product (sessions.product); until then the client shows the product picker.
import {randomBytes,createHash} from 'node:crypto';
import {PRODUCT_HOSTS,hostInfo} from './tenancy.js';
import {PLANS} from './plans.js';
import {hostReady} from './provision.js';

// Monthly USD per plan tier; the tiers' limits (trucks, users) come from PLANS.
export const PRODUCTS=[
 {id:'dash',live:true,prices:{starter:49,pro:149,enterprise:399}},
 {id:'erp',live:false,prices:{starter:99,pro:249,enterprise:599}},
 {id:'crm',live:false,prices:{starter:39,pro:99,enterprise:249}},
 {id:'fuel',live:false,prices:{starter:29,pro:79,enterprise:199}},
 {id:'safety',live:false,prices:{starter:29,pro:79,enterprise:199}},
 {id:'driver',live:false,prices:{starter:19,pro:49,enterprise:149}},
];
if(PRODUCTS.some(p=>!PRODUCT_HOSTS.includes(p.id)))throw Error('Every product needs its host in PRODUCT_HOSTS');
export const productById=id=>PRODUCTS.find(p=>p.id===id);
const sha=v=>createHash('sha256').update(v).digest('hex');

export function installProducts(db){
 const raw=db.raw,fresh=!raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_products'").get();
 raw.exec(`CREATE TABLE IF NOT EXISTS company_products(company_id TEXT NOT NULL,product TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(company_id,product));
 CREATE TABLE IF NOT EXISTS product_requests(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,product TEXT NOT NULL,plan TEXT NOT NULL,user_id TEXT,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new');`);
 // Companies from before products existed keep the dispatch dashboard they already use (only on this first run,
 // so a product the platform admin later turns off stays off).
 if(fresh)raw.prepare("INSERT OR IGNORE INTO company_products SELECT id,'dash','included',? FROM companies").run(new Date().toISOString());
}
export const companyProducts=(db,companyId)=>db.raw.prepare('SELECT product FROM company_products WHERE company_id=?').all(companyId).map(r=>r.product);
export const hasProduct=(db,companyId,product)=>!!db.raw.prepare('SELECT 1 FROM company_products WHERE company_id=? AND product=?').get(companyId,product);
export function grantProduct(db,companyId,product,source='manual'){db.raw.prepare('INSERT OR IGNORE INTO company_products VALUES(?,?,?,?)').run(companyId,product,source,new Date().toISOString());db.raw.prepare("UPDATE product_requests SET status='done' WHERE company_id=? AND product=? AND status='new'").run(companyId,product)}
export const revokeProduct=(db,companyId,product)=>db.raw.prepare('DELETE FROM company_products WHERE company_id=? AND product=?').run(companyId,product);

// Paths that work without the dispatch dashboard: signing in, choosing or buying a product, public and admin APIs.
const OPEN=/^\/api\/(auth|tenant|products|public|onboarding|admin)(\/|$)/;
export function registerProductRoutes(app,db,{baseDomain='lanilot.com',env=process.env}={}){
 const raw=db.raw,url=(req,product,slug)=>{const h=hostInfo(req.get('host'),baseDomain);return `${req.protocol}://${product}.${slug}.${h.base??baseDomain}${h.port}`};
 // Dashboard data belongs to the dispatch product: without it the company (and so every member) is locked out.
 app.use((req,res,next)=>{if(!req.session||!req.path.startsWith('/api/')||OPEN.test(req.path))return next();
  if(!hasProduct(db,req.company.id,'dash'))return res.status(403).json({error:'У компании нет доступа к диспетчерской',code:'product_locked',product:'dash'});next()});
 app.get('/api/products',(req,res)=>{
  if(!req.session)return res.status(401).json({error:'Войдите в кабинет',code:'unauthenticated'});
  const owned=new Set(companyProducts(db,req.company.id)),h=hostInfo(req.get('host'),baseDomain),owner=raw.prepare("SELECT u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND m.role='owner' ORDER BY m.created_at LIMIT 1").get(req.company.id);
  const requested=new Set(raw.prepare("SELECT product FROM product_requests WHERE company_id=? AND status='new'").all(req.company.id).map(r=>r.product));
  res.json({products:PRODUCTS.map(p=>({...p,access:owned.has(p.id),requested:requested.has(p.id)})),plans:PLANS,chosen:req.session.product??null,current:h.product??null,canBuy:req.session.role==='owner',owner:owner??null});
 });
 // Picks the product for this sign-in. Another product's address gets a one-time handoff that signs in there.
 app.post('/api/products/choose',(req,res)=>{
  if(!req.session)return res.status(401).json({error:'Войдите в кабинет',code:'unauthenticated'});
  const p=productById(req.body?.product);if(!p)return res.status(400).json({error:'Неизвестный продукт'});
  if(!hasProduct(db,req.company.id,p.id))return res.status(403).json({error:'У компании нет доступа к этому продукту',code:'no_access',canBuy:req.session.role==='owner'});
  raw.prepare('UPDATE sessions SET product=? WHERE id=?').run(p.id,req.session.id);
  const h=hostInfo(req.get('host'),baseDomain),slug=req.company.slug;
  // Already there, or no subdomains to go to (an IP address or the platform's own company): stay on this host.
  if(h.product===p.id||!h.base||!slug||slug==='app')return res.json({url:null});
  if(!hostReady(slug,p.id,env))return res.json({url:null,pending:true});
  const t=randomBytes(24).toString('base64url'),now=Date.now();
  raw.prepare('INSERT INTO session_handoffs(id,user_id,company_id,created_at,expires_at,used_at,product) VALUES(?,?,?,?,?,NULL,?)').run(sha(t),req.session.user_id,req.company.id,new Date(now).toISOString(),new Date(now+120000).toISOString(),p.id);
  res.json({url:`${url(req,p.id,slug)}/?handoff=${encodeURIComponent(t)}`});
 });
 app.post('/api/products/reset',(req,res)=>{if(!req.session)return res.status(401).json({error:'Войдите в кабинет'});raw.prepare('UPDATE sessions SET product=NULL WHERE id=?').run(req.session.id);res.json({ok:true})});
 // Owner asks to buy a product on a plan; the platform admin sees it on the company and turns the product on.
 app.post('/api/products/request',(req,res)=>{
  if(!req.session)return res.status(401).json({error:'Войдите в кабинет'});
  if(req.session.role!=='owner')return res.status(403).json({error:'Подключить продукт может только владелец компании'});
  const p=productById(req.body?.product),plan=req.body?.plan;if(!p||!p.prices[plan])return res.status(400).json({error:'Выберите продукт и тариф'});
  if(hasProduct(db,req.company.id,p.id))return res.status(409).json({error:'Продукт уже подключён'});
  raw.prepare("UPDATE product_requests SET status='replaced' WHERE company_id=? AND product=? AND status='new'").run(req.company.id,p.id);
  raw.prepare('INSERT INTO product_requests(id,company_id,product,plan,user_id,created_at) VALUES(?,?,?,?,?,?)').run('prq-'+randomBytes(8).toString('hex'),req.company.id,p.id,plan,req.session.user_id,new Date().toISOString());
  res.status(201).json({ok:true});
 });
}
