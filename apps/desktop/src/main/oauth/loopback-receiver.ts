import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FAILURE_PAGE, SUCCESS_PAGE } from './callback-page';
import { OAuthFlowError } from './oauth-errors';

const CALLBACK_PATH = '/oauth/callback';
const LOOPBACK_HOST = '127.0.0.1';

export interface LoopbackReceiverOptions {
  readonly expectedState: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface LoopbackReceiver {
  readonly redirectUri: string;
  readonly code: Promise<string>;
  close(): Promise<void>;
}

type Outcome = { readonly code: string } | { readonly error: OAuthFlowError };

const readOutcome = (url: URL, expectedState: string): Outcome | null => {
  if (url.searchParams.get('state') !== expectedState) {
    return null;
  }
  const error = url.searchParams.get('error');
  if (error !== null) {
    return { error: new OAuthFlowError(`Google odmietol prihlásenie (${error})`) };
  }
  const code = url.searchParams.get('code');
  if (code === null || code === '') {
    return { error: new OAuthFlowError('OAuth odpoveď neobsahuje autorizačný kód') };
  }
  return { code };
};

const respond = (response: ServerResponse, status: number, html: string): void => {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  response.end(html);
};

export const startLoopbackReceiver = async (
  options: LoopbackReceiverOptions,
): Promise<LoopbackReceiver> => {
  let settle: (outcome: Outcome) => void = () => undefined;
  const code = new Promise<string>((resolve, reject) => {
    settle = (outcome) => {
      if ('code' in outcome) {
        resolve(outcome.code);
        return;
      }
      reject(outcome.error);
    };
  });
  code.catch(() => undefined);

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const base = `http://${LOOPBACK_HOST}`;
    if (!URL.canParse(request.url ?? '', base)) {
      respond(response, 400, FAILURE_PAGE);
      return;
    }
    const url = new URL(request.url ?? '', base);
    if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
      respond(response, 404, FAILURE_PAGE);
      return;
    }
    const outcome = readOutcome(url, options.expectedState);
    if (outcome === null) {
      respond(response, 400, FAILURE_PAGE);
      return;
    }
    respond(
      response,
      'code' in outcome ? 200 : 400,
      'code' in outcome ? SUCCESS_PAGE : FAILURE_PAGE,
    );
    settle(outcome);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const timeout = setTimeout(() => {
    settle({ error: new OAuthFlowError('Prihlásenie cez Google vypršalo') });
  }, options.timeoutMs);
  const onAbort = () => {
    settle({ error: new OAuthFlowError('Prihlásenie cez Google bolo zrušené') });
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted === true) {
    onAbort();
  }
  const close = () =>
    new Promise<void>((resolve) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      server.closeAllConnections();
      server.close(() => {
        resolve();
      });
    });

  const { port } = server.address() as AddressInfo;
  return {
    redirectUri: `http://${LOOPBACK_HOST}:${String(port)}${CALLBACK_PATH}`,
    code,
    close,
  };
};
