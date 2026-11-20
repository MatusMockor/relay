import type { EngineDeps } from '../../engine-deps';
import type { MessageActionsService } from '../actions/message-actions-service';
import type { AiJobFactory } from '../ai/ai-job-factory';
import type { EngineEvents } from '../shared/engine-events';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { PERMISSIVE_PATTERN_POLICY } from '../splits/split-rule-validator';
import type { JiraTaskSink } from '../sync/jira-task-sink';
import type { TaskService } from '../tasks/task-service';
import { SummaryAutomationAction, TaskAutomationAction } from './ai-automation-actions';
import { AutomationActionExecutor } from './automation-action-executor';
import { AutomationBacklog } from './automation-backlog';
import { AutomationBacklogMatcher } from './automation-backlog-matcher';
import { AutomationPreview } from './automation-preview';
import { AutomationRunner } from './automation-runner';
import { AutomationService } from './automation-service';
import { AutomationTargetValidator } from './automation-target-validator';
import type { AutomationHistoryService } from './history/automation-history-service';
import { createAutomationHistory } from './history/create-automation-history';
import { JiraTaskAutomation } from './jira-task-automation';
import {
  AddLabelAutomationAction,
  ArchiveAutomationAction,
  FlagAutomationAction,
  LocationTracker,
  MoveToAutomationAction,
  NotifyAutomationAction,
} from './mail-automation-actions';

export interface AutomationComponents {
  readonly service: AutomationService;
  readonly runner: AutomationRunner;
  readonly history: AutomationHistoryService;
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
  const locations = new LocationTracker(shared.actions, repositories.messages, deps.logger);
  const executor = new AutomationActionExecutor(
    {
      notify: new NotifyAutomationAction(shared.events),
      summary: new SummaryAutomationAction(shared.factory),
      task: new TaskAutomationAction(shared.factory),
      markRead: new FlagAutomationAction(shared.actions, { type: 'markRead' }),
      pin: new FlagAutomationAction(shared.actions, { type: 'pin' }),
      addLabel: new AddLabelAutomationAction(shared.actions),
      moveTo: new MoveToAutomationAction(locations),
      archive: new ArchiveAutomationAction(locations),
    },
    deps.logger,
  );
  const history = createAutomationHistory(deps, shared.actions);
  const patterns = deps.splitPatternPolicy ?? PERMISSIVE_PATTERN_POLICY;
  const matcher = new AutomationBacklogMatcher({
    candidates: repositories.automationCandidates,
    matcher: deps.automationMatcher,
    classifier: deps.jiraClassifier,
  });
  return {
    service: new AutomationService({
      automations: repositories.automations,
      accounts: repositories.accounts,
      settings: shared.settings,
      events: shared.events,
      ids: deps.idGenerator,
      patterns,
      targets: new AutomationTargetValidator(repositories.mailboxes, repositories.labels),
      backlog: new AutomationBacklog({
        accounts: repositories.accounts,
        messages: repositories.messages,
        threads: repositories.threads,
        runs: repositories.automationRuns,
        matcher,
        executor,
        recorder: history.recorder,
        clock: deps.clock,
      }),
      preview: new AutomationPreview({
        accounts: repositories.accounts,
        messages: repositories.messages,
        candidates: repositories.automationCandidates,
        matcher,
        patterns,
        clock: deps.clock,
      }),
    }),
    runner: new AutomationRunner({
      automations: repositories.automations,
      runs: repositories.automationRuns,
      matcher: deps.automationMatcher,
      executor,
      recorder: history.recorder,
      clock: deps.clock,
    }),
    history: history.service,
    jiraTasks: new JiraTaskAutomation({
      automations: repositories.automations,
      messages: repositories.messages,
      matcher: deps.automationMatcher,
      tasks: shared.tasks,
    }),
  };
};
