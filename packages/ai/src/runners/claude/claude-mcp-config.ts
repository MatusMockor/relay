import type { AiMailToolsEndpoint } from '@relay/engine';
import { MAIL_MCP_SERVER_NAME } from '../../prompts/mail-tools';
import { endpointEnv, requireCommand, requireUrl } from '../mail-tools-endpoint';

export function claudeMcpConfig(endpoint: AiMailToolsEndpoint): string {
  return JSON.stringify({ mcpServers: { [MAIL_MCP_SERVER_NAME]: serverEntry(endpoint) } });
}

function serverEntry(endpoint: AiMailToolsEndpoint): Record<string, unknown> {
  if (endpoint.transport === 'http') {
    return { type: 'http', url: requireUrl(endpoint), headers: { ...endpoint.headers } };
  }
  return {
    type: 'stdio',
    command: requireCommand(endpoint),
    args: [...endpoint.args],
    env: { ...endpointEnv(endpoint) },
  };
}
