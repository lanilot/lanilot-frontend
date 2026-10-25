import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The API is ../backend. The original Host must reach it: it selects the company (subdomain) and is checked against Origin.
const api={'/api':{target:`http://127.0.0.1:${process.env.LANILOT_API_PORT||3001}`,changeOrigin:false}};
export default defineConfig({plugins:[react()],build:{rollupOptions:{output:{manualChunks:{'vue-controls':['vue'],'maps':['leaflet']}}}},server:{proxy:api},preview:{proxy:api}});
