import type { AiMailToolsEndpoint } from '@relay/engine';
import { MAIL_MCP_SERVER_NAME, type MailToolName } from '../../prompts/mail-tools';
import { endpointEnv, requireCommand, requireUrl } from '../mail-tools-endpoint';
import { tomlInlineTable, tomlString, tomlStringArray } from './toml-value';

export const CODEX_MCP_BEARER_ENV = 'RELAY_MAIL_MCP_BEARER_TOKEN';
export const CODEX_MCP_HEADER_ENV_PREFIX = 'RELAY_MAIL_MCP_HEADER_';

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export interface CodexMcpOverrides {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export function codexMcpOverrides(
  endpoint: AiMailToolsEndpoint,
  tools: readonly MailToolName[],
): CodexMcpOverrides {
  const prefix = `mcp_servers.${MAIL_MCP_SERVER_NAME}`;
  const common = [`${prefix}.enabled_tools=${tomlStringArray(tools)}`];
  if (endpoint.transport === 'stdio') {
    const env = endpointEnv(endpoint);
    return {
      args: configArgs([
        `${prefix}.command=${tomlString(requireCommand(endpoint))}`,
        `${prefix}.args=${tomlStringArray(endpoint.args)}`,
        `${prefix}.env_vars=${tomlStringArray(Object.keys(env))}`,
        ...common,
      ]),
      env,
    };
  }
  const { bearer, headers } = splitHeaders(endpoint.headers);
  const headerEnv = Object.fromEntries(
    Object.keys(headers).map((name, index) => [
      name,
      `${CODEX_MCP_HEADER_ENV_PREFIX}${String(index + 1)}`,
    ]),
  );
  return {
    args: configArgs([
      `${prefix}.url=${tomlString(requireUrl(endpoint))}`,
      `${prefix}.env_http_headers=${tomlInlineTable(headerEnv)}`,
      ...(bearer === null
        ? []
        : [`${prefix}.bearer_token_env_var=${tomlString(CODEX_MCP_BEARER_ENV)}`]),
      ...common,
    ]),
    env: {
      ...Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [headerEnv[name] ?? name, value]),
      ),
      ...(bearer === null ? {} : { [CODEX_MCP_BEARER_ENV]: bearer }),
    },
  };
}

function configArgs(overrides: readonly string[]): string[] {
  return overrides.flatMap((override) => ['-c', override]);
}

function splitHeaders(all: Readonly<Record<string, string>>): {
  bearer: string | null;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  let bearer: string | null = null;
  for (const [name, value] of Object.entries(all)) {
    const match = name.toLowerCase() === 'authorization' ? BEARER_PATTERN.exec(value) : null;
    if (match?.[1] !== undefined) {
      bearer = match[1];
      continue;
    }
    headers[name] = value;
  }
  return { bearer, headers };
}
