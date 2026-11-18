import type { Clock } from '@relay/engine';
import { EventHub } from '../events/event-hub';
import type { AccountOverview } from './account-overview';
import type { AccountOverviewView } from './account-overview-updater';
import type { RendererView } from './renderer-view';
import { trayAccountsOf } from './tray-accounts';
import type { NotificationPause } from './notification-pause';
import type { TrayMenuItem } from './tray-menu-items';
import { buildTrayMenu } from './tray-menu-model';

export interface TrayMenuDeps {
  readonly appName: string;
  readonly clock: Clock;
  readonly view: RendererView;
  readonly pause: NotificationPause;
}

export class TrayMenu implements AccountOverviewView {
  readonly changes = new EventHub<undefined>();
  private local: readonly AccountOverview[] = [];
  private readonly unsubscribes: readonly (() => void)[];

  constructor(private readonly deps: TrayMenuDeps) {
    const changed = () => {
      this.changes.publish(undefined);
    };
    this.unsubscribes = [
      deps.view.changes.subscribe(changed),
      deps.pause.changes.subscribe(changed),
    ];
  }

  show(accounts: readonly AccountOverview[]): void {
    this.local = accounts;
    this.changes.publish(undefined);
  }

  items(): TrayMenuItem[] {
    return buildTrayMenu({
      appName: this.deps.appName,
      accounts: trayAccountsOf(this.deps.view.accounts(), this.local),
      scope: this.deps.view.scope(),
      pause: this.deps.pause.state(),
      now: this.deps.clock.now(),
    });
  }

  dispose(): void {
    this.unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
  }
}
