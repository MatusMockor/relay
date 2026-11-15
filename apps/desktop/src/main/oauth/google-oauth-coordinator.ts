import type { MailAccount } from '@relay/shared/domain';
import type { GoogleAuthorizeInput, GoogleAuthorizeOutput } from '@relay/shared/ipc';
import type { GoogleAuthorization, GoogleLoopbackFlow } from './google-loopback-flow';
import { OAuthFlowError } from './oauth-errors';

export interface GoogleAccountConnector {
  connect(
    authorization: GoogleAuthorization,
    loginHint: string | undefined,
    signal: AbortSignal,
  ): Promise<MailAccount>;
}

export class GoogleOAuthCoordinator {
  private active: AbortController | null = null;
  private readonly running = new Set<Promise<unknown>>();

  constructor(
    private readonly flow: GoogleLoopbackFlow,
    private readonly localConnector: GoogleAccountConnector,
  ) {}

  authorize(input: GoogleAuthorizeInput): Promise<GoogleAuthorizeOutput> {
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    const operation = this.run(input, controller);
    const settled = operation
      .catch(() => undefined)
      .finally(() => {
        this.running.delete(settled);
      });
    this.running.add(settled);
    return operation;
  }

  cancel(): void {
    this.active?.abort();
    this.active = null;
  }

  async shutdown(): Promise<void> {
    this.cancel();
    await Promise.all(this.running);
  }

  private async run(
    input: GoogleAuthorizeInput,
    controller: AbortController,
  ): Promise<GoogleAuthorizeOutput> {
    try {
      const authorization = await this.flow.authorize({
        signal: controller.signal,
        ...(input.loginHint === undefined ? {} : { loginHint: input.loginHint }),
      });
      if (controller.signal.aborted) {
        throw new OAuthFlowError('Prihlásenie cez Google bolo zrušené');
      }
      if (input.mode === 'synced') {
        return { mode: 'synced', grant: authorization.grant };
      }
      return {
        mode: 'local',
        account: await this.localConnector.connect(
          authorization,
          input.loginHint,
          controller.signal,
        ),
      };
    } finally {
      if (this.active === controller) {
        this.active = null;
      }
    }
  }
}
