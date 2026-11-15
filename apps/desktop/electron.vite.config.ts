import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { rendererCspPlugin } from './renderer-csp';

const workspacePackages = [
  '@relay/ai',
  '@relay/engine',
  '@relay/mail-core',
  '@relay/shared',
  '@relay/store-sqlite',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
  },
  preload: {
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), rendererCspPlugin()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  },
});
