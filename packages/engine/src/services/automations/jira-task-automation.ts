import type { Task, UserId } from '@relay/shared/domain';
import type { SplitMatchSubject } from '../../model/split-match-subject';
import type { AutomationMatcher } from '../../ports/automation-matcher';
import type { AutomationRepository } from '../../ports/automation-repository';
import type { MessageRepository } from '../../ports/message-repository';
import { matchSubjectOf } from '../../subjects/match-subject';
import type { JiraEventOrigin, JiraTaskEvent, JiraTaskSink } from '../sync/jira-task-sink';
import { appliesToAccount, runsLegacyJiraTasks, storedJiraTasksPreset } from './automation-presets';

export interface JiraTaskApplier {
  applyJiraEvent(userId: UserId, event: JiraTaskEvent): Promise<Task | null>;
}

export interface JiraTaskAutomationDeps {
  readonly automations: AutomationRepository;
  readonly messages: MessageRepository;
  readonly matcher: AutomationMatcher;
  readonly tasks: JiraTaskApplier;
}

export class JiraTaskAutomation implements JiraTaskSink {
  constructor(private readonly deps: JiraTaskAutomationDeps) {}

  async applyJiraEvent(
    userId: UserId,
    event: JiraTaskEvent,
    origin: JiraEventOrigin,
  ): Promise<Task | null> {
    if (!(await this.enabledFor(userId, event, origin))) {
      return null;
    }
    return this.deps.tasks.applyJiraEvent(userId, event);
  }

  private async enabledFor(
    userId: UserId,
    event: JiraTaskEvent,
    origin: JiraEventOrigin,
  ): Promise<boolean> {
    const preset = storedJiraTasksPreset(await this.deps.automations.listByUser(userId));
    if (
      preset === null ||
      !runsLegacyJiraTasks(preset) ||
      !appliesToAccount(preset, origin.accountId)
    ) {
      return false;
    }
    return this.deps.matcher.matches({
      message: await this.subjectOf(userId, event, origin),
      jira: event.classification,
      criteria: preset,
    });
  }

  private async subjectOf(
    userId: UserId,
    event: JiraTaskEvent,
    origin: JiraEventOrigin,
  ): Promise<SplitMatchSubject> {
    const headers = new Map(event.headers ?? []);
    const message = await this.deps.messages.findById(userId, origin.messageId);
    if (message !== null) {
      return matchSubjectOf(message, headers);
    }
    return { from: event.from ?? null, subject: event.title, headers };
  }
}
