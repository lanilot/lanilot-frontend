import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The original Host must reach the API: it selects the company (subdomain) and is checked against Origin.
export default defineConfig({plugins:[react()],build:{rollupOptions:{output:{manualChunks:{'vue-controls':['vue'],'maps':['leaflet']}}}},server:{proxy:{'/api':{target:`http://127.0.0.1:${process.env.LANILOT_API_PORT||3001}`,changeOrigin:false}}}});
