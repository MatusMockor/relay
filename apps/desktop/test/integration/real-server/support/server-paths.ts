import { fileURLToPath } from 'node:url';

export const SERVER_DIR = fileURLToPath(new URL('../../../../../server/', import.meta.url));

export const VITE_NODE_BIN = fileURLToPath(
  new URL('../../../../../server/node_modules/vite-node/vite-node.mjs', import.meta.url),
);

export const SERVER_ENTRY = 'src/main.ts';
