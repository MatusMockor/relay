import type { EngineDeps } from '../../engine-deps';
import type { MessageActionsService } from '../actions/message-actions-service';
import type { AiJobFactory } from '../ai/ai-job-factory';
import type { EngineEvents } from '../shared/engine-events';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { PERMISSIVE_PATTERN_POLICY } from '../splits/split-rule-validator';
import type { JiraTaskSink } from '../sync/jira-task-sink';
import type { TaskService } from '../tasks/task-service';
import {
  DraftReplyAutomationAction,
  SummaryAutomationAction,
  TaskAutomationAction,
} from './ai-automation-actions';
import { AutomationActionExecutor } from './automation-action-executor';
import { AutomationBacklog } from './automation-backlog';
import { AutomationBacklogMatcher } from './automation-backlog-matcher';
import { AutomationPreview } from './automation-preview';
import { AutomationRunner } from './automation-runner';
import { AutomationService } from './automation-service';
import { AutomationForwardValidator } from './automation-forward-validator';
import { AutomationTargetValidator } from './automation-target-validator';
import { ForwardAutomationAction } from './forward/forward-automation-action';
import { ForwardRateLimit } from './forward/forward-rate-limit';
import type { MailForwarder } from './forward/mail-forwarder';
import type { AutomationHistoryService } from './history/automation-history-service';
import { createAutomationHistory } from './history/create-automation-history';
import { JiraTaskAutomation } from './jira-task-automation';
import {
  AddLabelAutomationAction,
  MoveToAutomationAction,
  NotifyAutomationAction,
  TrackedAutomationAction,
} from './mail-automation-actions';
import { RemindAutomationAction } from './remind-automation-action';

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
    readonly forwarder: MailForwarder;
  },
): AutomationComponents => {
  const { repositories } = deps;
  const executor = new AutomationActionExecutor(
    {
      notify: new NotifyAutomationAction(shared.events),
      summary: new SummaryAutomationAction(shared.factory),
      task: new TaskAutomationAction(shared.factory),
      draftReply: new DraftReplyAutomationAction(shared.factory),
      forward: new ForwardAutomationAction({
        forwarder: shared.forwarder,
        accounts: repositories.accounts,
        limit: new ForwardRateLimit(repositories.automationActivity, deps.clock),
      }),
      markRead: new TrackedAutomationAction(shared.actions, { type: 'markRead' }),
      pin: new TrackedAutomationAction(shared.actions, { type: 'pin' }),
      addLabel: new AddLabelAutomationAction(shared.actions),
      remind: new RemindAutomationAction(shared.actions, repositories.reminders, deps.clock),
      moveTo: new MoveToAutomationAction(shared.actions),
      archive: new TrackedAutomationAction(shared.actions, { type: 'archive' }),
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
      forwards: new AutomationForwardValidator(repositories.accounts),
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
