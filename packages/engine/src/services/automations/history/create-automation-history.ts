import type { EngineDeps } from '../../../engine-deps';
import type { MessageActionsService } from '../../actions/message-actions-service';
import { AutomationActivityRecorder } from './automation-activity-recorder';
import { AutomationActivityUndo } from './automation-activity-undo';
import { AutomationHistoryService } from './automation-history-service';
import { AddLabelReverser, MarkReadReverser, PinReverser } from './flag-reversers';
import { ArchiveReverser, MoveToReverser } from './location-reversers';
import { MoveTargetProbe } from './move-target-probe';

export interface AutomationHistoryComponents {
  readonly recorder: AutomationActivityRecorder;
  readonly service: AutomationHistoryService;
}

export const createAutomationHistory = (
  deps: EngineDeps,
  actions: MessageActionsService,
): AutomationHistoryComponents => {
  const { repositories } = deps;
  const probe = new MoveTargetProbe(
    repositories.mailboxes,
    repositories.labels,
    repositories.messages,
  );
  const undo = new AutomationActivityUndo(
    {
      markRead: new MarkReadReverser(actions),
      pin: new PinReverser(actions),
      addLabel: new AddLabelReverser(actions),
      moveTo: new MoveToReverser(actions, probe),
      archive: new ArchiveReverser(actions),
    },
    repositories.threads,
    deps.logger,
  );
  return {
    recorder: new AutomationActivityRecorder({
      activity: repositories.automationActivity,
      ids: deps.idGenerator,
      clock: deps.clock,
      logger: deps.logger,
    }),
    service: new AutomationHistoryService({
      automations: repositories.automations,
      activity: repositories.automationActivity,
      undo,
      clock: deps.clock,
    }),
  };
};
