import LoadingBoundary,{Skeleton} from './Loading.jsx';
import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';

const Pitch=lazy(()=>import('./Pitch.jsx'));
const isPitch=window.location.pathname.replace(/\/+$/,'')==='/pitch';
createRoot(document.getElementById('root')).render(isPitch?<Suspense fallback={<Skeleton/>}><LoadingBoundary className="pitch-loading"><Pitch/></LoadingBoundary></Suspense>:<App/>);
