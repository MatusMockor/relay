import type { EngineDeps } from '../../../engine-deps';
import type { MessageActionsService } from '../../actions/message-actions-service';
import { AutomationActivityRecorder } from './automation-activity-recorder';
import { AutomationActivityUndo } from './automation-activity-undo';
import { AutomationHistoryService } from './automation-history-service';
import { addLabelReverser, markReadReverser, pinReverser } from './flag-reversers';
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
      markRead: markReadReverser(actions, repositories.messages),
      pin: pinReverser(actions, repositories.messages),
      addLabel: addLabelReverser(actions, repositories.messages),
      moveTo: new MoveToReverser(actions, probe, repositories.messages),
      archive: new ArchiveReverser(actions, probe),
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
