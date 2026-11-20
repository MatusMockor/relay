import {
  type ApplyAutomationResponse,
  type AutomationInput,
  type AutomationPreviewBody,
  type AutomationPreviewResponse,
  MAX_AUTOMATIONS,
  type ReplaceAutomationsBody,
} from '@relay/shared/api';
import type { Automation, AutomationId, UserId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { AutomationRepository, PresetAutomation } from '../../ports/automation-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';
import type { EngineEvents } from '../shared/engine-events';
import { KeyedSerializer } from '../shared/keyed-serializer';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { assertRulePatterns } from '../splits/split-rule-validator';
import type { AutomationBacklog } from './automation-backlog';
import { inputRules, storedAutomationOf } from './automation-input';
import type { AutomationPreview } from './automation-preview';
import { hasJiraTasksPreset, jiraTasksPreset } from './automation-presets';
import type { AutomationTargetValidator } from './automation-target-validator';

export interface AutomationServiceDeps {
  readonly automations: AutomationRepository;
  readonly accounts: AccountRepository;
  readonly settings: UserSettingsReader;
  readonly events: EngineEvents;
  readonly ids: IdGenerator;
  readonly patterns: SplitPatternPolicy;
  readonly targets: AutomationTargetValidator;
  readonly backlog: AutomationBacklog;
  readonly preview: AutomationPreview;
}

export class AutomationService {
  private readonly serializer = new KeyedSerializer();
  private readonly applies = new KeyedSerializer();

  constructor(private readonly deps: AutomationServiceDeps) {}

  list(userId: UserId): Promise<Automation[]> {
    return this.serializer.run(userId, () => this.seeded(userId));
  }

  replace(userId: UserId, body: ReplaceAutomationsBody): Promise<Automation[]> {
    return this.serializer.run(userId, () => this.replaceNow(userId, body));
  }

  restoreDefault(userId: UserId): Promise<Automation[]> {
    return this.serializer.run(userId, () => this.restoreNow(userId));
  }

  preview(userId: UserId, body: AutomationPreviewBody): Promise<AutomationPreviewResponse> {
    return this.deps.preview.preview(userId, body);
  }

  applyToExisting(userId: UserId, id: AutomationId): Promise<ApplyAutomationResponse> {
    return this.applies.run(`${userId}:${id}`, () => this.applyNow(userId, id));
  }

  private async applyNow(userId: UserId, id: AutomationId): Promise<ApplyAutomationResponse> {
    const stored = await this.deps.automations.listByUser(userId);
    const automation = stored.find((item) => item.id === id);
    if (automation === undefined) {
      throw new NotFoundError('Automation', id);
    }
    return this.deps.backlog.apply(userId, automation);
  }

  private async replaceNow(userId: UserId, body: ReplaceAutomationsBody): Promise<Automation[]> {
    body.automations.forEach((input) => {
      assertRulePatterns(inputRules(input), this.deps.patterns);
    });
    await this.assertAccounts(userId, body.automations);
    const current = await this.seeded(userId);
    const known = new Map(current.map((automation) => [automation.id, automation]));
    await this.deps.targets.assert(userId, body.automations, known);
    const automations = body.automations.map((input): Automation => {
      if (input.id !== undefined && !known.has(input.id)) {
        throw new ValidationError(`Unknown automation id ${input.id}`);
      }
      const existing = input.id === undefined ? undefined : known.get(input.id);
      return storedAutomationOf(
        input,
        input.id ?? this.deps.ids.generate('automation'),
        userId,
        existing,
      );
    });
    if (new Set(automations.map((automation) => automation.id)).size !== automations.length) {
      throw new ValidationError('Automation ids must be unique');
    }
    if (hasJiraTasksPreset(current) && !hasJiraTasksPreset(automations)) {
      await this.deps.automations.markPresetRemoved(userId, 'jiraTasks');
    }
    return this.published(userId, await this.deps.automations.replaceAll(userId, automations));
  }

  private async restoreNow(userId: UserId): Promise<Automation[]> {
    const stored = await this.deps.automations.listByUser(userId);
    if (hasJiraTasksPreset(stored)) {
      return stored;
    }
    if (stored.length >= MAX_AUTOMATIONS) {
      throw new ValidationError(`At most ${String(MAX_AUTOMATIONS)} automations are allowed`);
    }
    await this.deps.automations.restorePreset(await this.presetFor(userId, stored.length));
    return this.published(userId, await this.deps.automations.listByUser(userId));
  }

  private async seeded(userId: UserId): Promise<Automation[]> {
    const stored = await this.deps.automations.listByUser(userId);
    if (
      hasJiraTasksPreset(stored) ||
      (await this.deps.automations.isPresetRemoved(userId, 'jiraTasks'))
    ) {
      return stored;
    }
    await this.deps.automations.createPresetIfAbsent(await this.presetFor(userId, stored.length));
    return this.deps.automations.listByUser(userId);
  }

  private async presetFor(userId: UserId, order: number): Promise<PresetAutomation> {
    const settings = await this.deps.settings.read(userId);
    return jiraTasksPreset(
      userId,
      this.deps.ids.generate('automation'),
      settings.ai.defaultRunner,
      order,
    );
  }

  private async published(userId: UserId, automations: Automation[]): Promise<Automation[]> {
    await this.deps.events.emit(userId, 'automations.updated', { automations });
    return automations;
  }

  private async assertAccounts(userId: UserId, inputs: readonly AutomationInput[]): Promise<void> {
    const accountIds = new Set(inputs.flatMap((input) => input.accountId ?? []));
    for (const accountId of accountIds) {
      if ((await this.deps.accounts.findById(userId, accountId)) === null) {
        throw new NotFoundError('Account', accountId);
      }
    }
  }
}
