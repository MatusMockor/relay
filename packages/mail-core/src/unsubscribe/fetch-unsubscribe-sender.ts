import { ProviderError, type UnsubscribeSender, ValidationError } from '@relay/engine';
import { type UnsubscribeUrl, UnsubscribeUrlSchema } from '@relay/shared/domain';
import { type HostResolver, resolvesPublicly, systemResolver } from './public-host-guard';

export type UnsubscribeFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface FetchUnsubscribeSenderOptions {
  readonly fetch?: UnsubscribeFetch;
  readonly timeoutMs?: number;
  readonly resolver?: HostResolver;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const accepted = (status: number): boolean => status >= 200 && status < 300;

export class FetchUnsubscribeSender implements UnsubscribeSender {
  private readonly fetch: UnsubscribeFetch;
  private readonly timeoutMs: number;
  private readonly resolver: HostResolver;

  constructor(options: FetchUnsubscribeSenderOptions = {}) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.resolver = options.resolver ?? systemResolver;
  }

  async sendOneClick(url: UnsubscribeUrl): Promise<void> {
    if (!UnsubscribeUrlSchema.safeParse(url).success) {
      throw new ValidationError('Unsubscribe URL must be a public https URL');
    }
    await this.assertPublicHost(new URL(url).hostname);
    const response = await this.post(url);
    if (!accepted(response.status)) {
      throw new ProviderError(`Unsubscribe request failed with HTTP ${String(response.status)}`);
    }
  }

  private async assertPublicHost(hostname: string): Promise<void> {
    const isPublic = await resolvesPublicly(this.resolver, hostname).catch((error: unknown) => {
      throw new ProviderError('Unsubscribe host could not be resolved', { cause: error });
    });
    if (!isPublic) {
      throw new ValidationError('Unsubscribe URL must point to a public host');
    }
  }

  private async post(url: UnsubscribeUrl): Promise<Response> {
    try {
      return await this.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        redirect: 'manual',
        credentials: 'omit',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderError('Unsubscribe request could not be sent', { cause: error });
    }
  }
}
