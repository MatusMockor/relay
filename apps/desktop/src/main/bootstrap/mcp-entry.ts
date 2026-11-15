import { fileURLToPath } from 'node:url';
import type { McpEntryCommand } from '../ai/local-mail-tools-server';

export const electronMcpEntry = (): McpEntryCommand => ({
  command: process.execPath,
  args: [fileURLToPath(new URL('./mcp-mail-stdio.js', import.meta.url))],
  env: { ELECTRON_RUN_AS_NODE: '1' },
});
