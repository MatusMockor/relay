import type { EngineDeps } from '../../engine-deps';
import type { MessageActionsService } from '../actions/message-actions-service';
import type { AiJobFactory } from '../ai/ai-job-factory';
import type { EngineEvents } from '../shared/engine-events';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { PERMISSIVE_PATTERN_POLICY } from '../splits/split-rule-validator';
import type { JiraTaskSink } from '../sync/jira-task-sink';
import type { TaskService } from '../tasks/task-service';
import { SummaryAutomationAction, TaskAutomationAction } from './ai-automation-actions';
import { AutomationRunner } from './automation-runner';
import { AutomationService } from './automation-service';
import { JiraTaskAutomation } from './jira-task-automation';
import {
  ArchiveAutomationAction,
  MarkReadAutomationAction,
  NotifyAutomationAction,
  PinAutomationAction,
} from './mail-automation-actions';

export interface AutomationComponents {
  readonly service: AutomationService;
  readonly runner: AutomationRunner;
  readonly jiraTasks: JiraTaskSink;
}

export const createAutomationComponents = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly settings: UserSettingsReader;
    readonly actions: MessageActionsService;
    readonly factory: AiJobFactory;
    readonly tasks: TaskService;
  },
): AutomationComponents => {
  const { repositories } = deps;
  return {
    service: new AutomationService({
      automations: repositories.automations,
      accounts: repositories.accounts,
      settings: shared.settings,
      events: shared.events,
      ids: deps.idGenerator,
      patterns: deps.splitPatternPolicy ?? PERMISSIVE_PATTERN_POLICY,
    }),
    runner: new AutomationRunner({
      automations: repositories.automations,
      runs: repositories.automationRuns,
      matcher: deps.automationMatcher,
      handlers: {
        notify: new NotifyAutomationAction(shared.events),
        summary: new SummaryAutomationAction(shared.factory),
        task: new TaskAutomationAction(shared.factory),
        markRead: new MarkReadAutomationAction(shared.actions),
        pin: new PinAutomationAction(shared.actions),
        archive: new ArchiveAutomationAction(shared.actions),
      },
      clock: deps.clock,
      logger: deps.logger,
    }),
    jiraTasks: new JiraTaskAutomation({
      automations: repositories.automations,
      settings: shared.settings,
      matcher: deps.automationMatcher,
      tasks: shared.tasks,
    }),
  };
};
