import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { bakedMainDefines } from './build-time-env';
import { rendererCspPlugin } from './renderer-csp';
import { workspaceDependencies } from './workspace-packages';

const esmDirnameBanner = [
  "import { fileURLToPath as __relayFileUrlToPath } from 'node:url';",
  "import { dirname as __relayDirname } from 'node:path';",
  'const __filename = __relayFileUrlToPath(import.meta.url);',
  'const __dirname = __relayDirname(__filename);',
].join('\n');

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
        output: { banner: (chunk) => (chunk.name === 'index' ? esmDirnameBanner : '') },
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
