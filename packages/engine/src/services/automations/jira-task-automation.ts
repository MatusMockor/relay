import type { Task, UserId } from '@relay/shared/domain';
import type { AutomationMatcher } from '../../ports/automation-matcher';
import type { AutomationRepository } from '../../ports/automation-repository';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import type { JiraEventOrigin, JiraTaskEvent, JiraTaskSink } from '../sync/jira-task-sink';
import {
  appliesToAccount,
  effectiveJiraTasksPreset,
  runsLegacyJiraTasks,
} from './automation-presets';

export interface JiraTaskApplier {
  applyJiraEvent(userId: UserId, event: JiraTaskEvent): Promise<Task | null>;
}

export interface JiraTaskAutomationDeps {
  readonly automations: AutomationRepository;
  readonly settings: UserSettingsReader;
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
    const stored = await this.deps.automations.listByUser(userId);
    const settings = await this.deps.settings.read(userId);
    const preset = effectiveJiraTasksPreset(userId, stored, settings.ai.defaultRunner);
    if (!runsLegacyJiraTasks(preset) || !appliesToAccount(preset, origin.accountId)) {
      return false;
    }
    return this.deps.matcher.matches({
      message: {
        from: event.from ?? null,
        subject: event.title,
        headers: new Map(event.headers ?? []),
      },
      jira: event.classification,
      conditions: preset.conditions,
    });
  }
}
