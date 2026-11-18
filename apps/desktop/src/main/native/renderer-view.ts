import type { AccountScope, ReportedAccount, TrayReport } from '@relay/shared/ipc';
import { EventHub } from '../events/event-hub';

const EMPTY: TrayReport = { scope: 'all', accounts: [] };

const sameReport = (left: TrayReport, right: TrayReport): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export class RendererView {
  readonly changes = new EventHub<undefined>();
  private report: TrayReport = EMPTY;

  scope(): AccountScope {
    return this.report.scope;
  }

  accounts(): readonly ReportedAccount[] {
    return this.report.accounts;
  }

  update(report: TrayReport): void {
    if (sameReport(report, this.report)) {
      return;
    }
    this.report = report;
    this.changes.publish(undefined);
  }
}
