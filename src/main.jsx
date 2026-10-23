import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {loadLocale,lang,__} from './i18n.js';

// The dictionary must be ready before app modules evaluate: they build translated labels at import time.
loadLocale().catch(()=>{}).then(async()=>{
 document.documentElement.lang=lang;
 document.title=__('Lanilot — рабочее место диспетчера');
 const [{default:LoadingBoundary,Skeleton},{default:App}]=await Promise.all([import('./Loading.jsx'),import('./App.jsx')]);
 const Pitch=lazy(()=>import('./Pitch.jsx'));
 const isPitch=window.location.pathname.replace(/\/+$/,'')==='/pitch';
 createRoot(document.getElementById('root')).render(isPitch?<Suspense fallback={<Skeleton/>}><LoadingBoundary className="pitch-loading"><Pitch/></LoadingBoundary></Suspense>:<App/>);
});
