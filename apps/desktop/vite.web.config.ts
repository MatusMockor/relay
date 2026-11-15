import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { rendererCspPlugin } from './renderer-csp';

export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), rendererCspPlugin()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
