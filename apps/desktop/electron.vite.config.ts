import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { bakedMainDefines } from './build-time-env';
import { esmCommonJsShim } from './main-chunk-banner';
import { rendererCspPlugin } from './renderer-csp';
import { workspaceDependencies } from './workspace-packages';

const workspacePackages = workspaceDependencies(resolve(import.meta.dirname, 'package.json'));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    define: bakedMainDefines(process.env),
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          'mcp-mail-stdio': resolve(import.meta.dirname, 'src/main/mcp-mail-stdio.ts'),
        },
        output: { banner: esmCommonJsShim },
      },
    },
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
