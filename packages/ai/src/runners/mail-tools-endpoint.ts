import type { AiMailToolsEndpoint } from '@relay/engine';

export type MailToolsEndpointWithEnv = AiMailToolsEndpoint & {
  readonly env?: Readonly<Record<string, string>>;
};

export function endpointEnv(endpoint: MailToolsEndpointWithEnv): Readonly<Record<string, string>> {
  return endpoint.env ?? {};
}

export function requireCommand(endpoint: AiMailToolsEndpoint): string {
  if (endpoint.command === null || endpoint.command.length === 0) {
    throw new Error('Mail tools stdio endpoint is missing a command');
  }
  return endpoint.command;
}

export function requireUrl(endpoint: AiMailToolsEndpoint): string {
  if (endpoint.url === null || endpoint.url.length === 0) {
    throw new Error('Mail tools http endpoint is missing a url');
  }
  return endpoint.url;
}
