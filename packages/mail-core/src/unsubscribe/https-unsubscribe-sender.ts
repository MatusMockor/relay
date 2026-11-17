import { ProviderError, type UnsubscribeSender, ValidationError } from '@relay/engine';
import { type UnsubscribeUrl, UnsubscribeUrlSchema } from '@relay/shared/domain';
import { pinnedHttpsTransport, type UnsubscribeTransport } from './pinned-https-transport';
import {
  type HostResolver,
  type ResolvedAddress,
  resolvePublicAddress,
  systemResolver,
} from './public-host-guard';

export interface HttpsUnsubscribeSenderOptions {
  readonly transport?: UnsubscribeTransport;
  readonly resolver?: HostResolver;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const ONE_CLICK_BODY = 'List-Unsubscribe=One-Click';

const accepted = (status: number): boolean => status >= 200 && status < 300;

const timedOut = (): ProviderError => new ProviderError('Unsubscribe request timed out');

const beforeDeadline = <T>(work: Promise<T>, deadline: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => {
        reject(timedOut());
      },
      Math.max(0, deadline - Date.now()),
    );
  });
  return Promise.race([work, expired]).finally(() => {
    clearTimeout(timer);
  });
};

export class HttpsUnsubscribeSender implements UnsubscribeSender {
  private readonly transport: UnsubscribeTransport;
  private readonly resolver: HostResolver;
  private readonly timeoutMs: number;

  constructor(options: HttpsUnsubscribeSenderOptions = {}) {
    this.transport = options.transport ?? pinnedHttpsTransport;
    this.resolver = options.resolver ?? systemResolver;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async sendOneClick(url: UnsubscribeUrl): Promise<void> {
    if (!UnsubscribeUrlSchema.safeParse(url).success) {
      throw new ValidationError('Unsubscribe URL must be a public https URL');
    }
    const parsed = new URL(url);
    const deadline = Date.now() + this.timeoutMs;
    const target = await beforeDeadline(this.publicTarget(parsed.hostname), deadline);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw timedOut();
    }
    const status = await this.post(parsed, target, remaining);
    if (!accepted(status)) {
      throw new ProviderError(`Unsubscribe request failed with HTTP ${String(status)}`);
    }
  }

  private async publicTarget(hostname: string): Promise<ResolvedAddress> {
    const target = await resolvePublicAddress(this.resolver, hostname).catch((error: unknown) => {
      throw new ProviderError('Unsubscribe host could not be resolved', { cause: error });
    });
    if (target === null) {
      throw new ValidationError('Unsubscribe URL must point to a public host');
    }
    return target;
  }

  private async post(url: URL, target: ResolvedAddress, timeoutMs: number): Promise<number> {
    try {
      return await this.transport({
        url,
        target,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: ONE_CLICK_BODY,
        timeoutMs,
      });
    } catch (error) {
      throw new ProviderError('Unsubscribe request could not be sent', { cause: error });
    }
  }
}
