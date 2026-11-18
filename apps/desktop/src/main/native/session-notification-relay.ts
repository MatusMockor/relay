import type { ThreadId } from '@relay/shared/domain';
import type { NotificationRequest, RendererSessionKey } from '@relay/shared/ipc';
import type { NotificationPresenter } from './new-mail-notifier';
import type { PauseGate } from './pausable-notification-presenter';
import type { RendererView } from './renderer-view';

export interface SessionPresenter extends NotificationPresenter {
  dispose(): void;
}

export interface SessionNotificationRelayDeps {
  readonly view: Pick<RendererView, 'session' | 'changes'>;
  readonly gate: PauseGate;
  readonly createPresenter: (openThread: (threadId: ThreadId) => void) => SessionPresenter;
  readonly openThread: (threadId: ThreadId) => void;
}

interface SessionSlot {
  readonly session: RendererSessionKey;
  readonly presenter: SessionPresenter;
}

export class SessionNotificationRelay {
  private slot: SessionSlot | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: SessionNotificationRelayDeps) {}

  start(): void {
    this.unsubscribe ??= this.deps.view.changes.subscribe(() => {
      this.forgetEndedSession();
    });
  }

  show(request: NotificationRequest): void {
    if (this.deps.gate.isPaused() || request.session !== this.deps.view.session()) {
      return;
    }
    this.presenterFor(request.session).show({
      title: request.title,
      body: request.body,
      threadId: request.threadId,
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.slot?.presenter.dispose();
    this.slot = null;
  }

  private presenterFor(session: RendererSessionKey): SessionPresenter {
    if (this.slot?.session === session) {
      return this.slot.presenter;
    }
    this.slot?.presenter.dispose();
    const presenter = this.deps.createPresenter((threadId) => {
      if (this.deps.view.session() !== session) {
        return;
      }
      this.deps.openThread(threadId);
    });
    this.slot = { session, presenter };
    return presenter;
  }

  private forgetEndedSession(): void {
    if (this.slot === null || this.slot.session === this.deps.view.session()) {
      return;
    }
    this.slot.presenter.dispose();
    this.slot = null;
  }
}
