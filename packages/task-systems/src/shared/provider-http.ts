import { ProviderError } from '@relay/engine';
import type { z } from 'zod';

export interface ProviderHttpOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface ProviderHttpMessages {
  readonly unreachable: string;
  readonly invalid: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class ProviderHttp {
  constructor(
    private readonly messages: ProviderHttpMessages,
    private readonly options: ProviderHttpOptions = {},
  ) {}

  request(url: string, init: RequestInit): Promise<Response> {
    const fetchFn = this.options.fetch ?? fetch;
    return fetchFn(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new ProviderError(this.messages.unreachable, { cause: error });
    });
  }

  json(response: Response): Promise<unknown> {
    return response.json().catch(() => null);
  }

  parse<Schema extends z.ZodType>(payload: unknown, schema: Schema): z.output<Schema> {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError(this.messages.invalid, { cause: parsed.error });
    }
    return parsed.data;
  }
}
