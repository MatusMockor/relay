import type {
  AccountScope,
  RendererSessionKey,
  ReportedAccount,
  TrayReport,
} from '@relay/shared/ipc';
import { EventHub } from '../events/event-hub';

const EMPTY: TrayReport = { session: null, scope: 'all', accounts: [] };

const sameReport = (left: TrayReport, right: TrayReport): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export class RendererView {
  readonly changes = new EventHub<undefined>();
  private report: TrayReport = EMPTY;

  session(): RendererSessionKey | null {
    return this.report.session;
  }

  scope(): AccountScope {
    return this.report.scope;
  }

  accounts(): readonly ReportedAccount[] {
    return this.report.accounts;
  }

  endSession(): void {
    this.update({ ...this.report, session: null });
  }

  update(report: TrayReport): void {
    if (sameReport(report, this.report)) {
      return;
    }
    this.report = report;
    this.changes.publish(undefined);
  }
}
