import {
  type ApplyAutomationResponse,
  type AutomationInput,
  type AutomationPreviewBody,
  type AutomationPreviewResponse,
  MAX_AUTOMATIONS,
  type ReplaceAutomationsBody,
  replaceInputsOf,
} from '@relay/shared/api';
import type { Automation, AutomationEntry, AutomationId, UserId } from '@relay/shared/domain';
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
import type { AutomationForwardValidator } from './automation-forward-validator';
import { inputRules } from './automation-input';
import type { AutomationPreview } from './automation-preview';
import { resolveReplacement, withUnsupported } from './automation-replacement';
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
  readonly forwards: AutomationForwardValidator;
  readonly backlog: AutomationBacklog;
  readonly preview: AutomationPreview;
}

export class AutomationService {
  private readonly serializer = new KeyedSerializer();
  private readonly applies = new KeyedSerializer();

  constructor(private readonly deps: AutomationServiceDeps) {}

  list(userId: UserId): Promise<AutomationEntry[]> {
    return this.serializer.run(userId, async () => this.entries(userId, await this.seeded(userId)));
  }

  replace(userId: UserId, body: ReplaceAutomationsBody): Promise<AutomationEntry[]> {
    return this.serializer.run(userId, () => this.replaceNow(userId, body));
  }

  restoreDefault(userId: UserId): Promise<AutomationEntry[]> {
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

  private async replaceNow(
    userId: UserId,
    body: ReplaceAutomationsBody,
  ): Promise<AutomationEntry[]> {
    const inputs = replaceInputsOf(body.automations);
    inputs.forEach((input) => {
      assertRulePatterns(inputRules(input), this.deps.patterns);
    });
    await this.assertAccounts(userId, inputs);
    await this.deps.forwards.assert(userId, inputs);
    const current = await this.seeded(userId);
    const known = new Map(current.map((automation) => [automation.id, automation]));
    await this.deps.targets.assert(userId, inputs, known);
    const { automations, keep } = resolveReplacement(body.automations, {
      userId,
      known,
      unsupported: await this.deps.automations.listUnsupported(userId),
      newId: () => this.deps.ids.generate('automation'),
    });
    if (hasJiraTasksPreset(current) && !hasJiraTasksPreset(automations)) {
      await this.deps.automations.markPresetRemoved(userId, 'jiraTasks');
    }
    await this.deps.automations.replaceAll(userId, automations, keep);
    return this.published(userId);
  }

  private async restoreNow(userId: UserId): Promise<AutomationEntry[]> {
    const stored = await this.deps.automations.listByUser(userId);
    if (hasJiraTasksPreset(stored)) {
      return this.entries(userId, stored);
    }
    const total = stored.length + (await this.deps.automations.listUnsupported(userId)).length;
    if (total >= MAX_AUTOMATIONS) {
      throw new ValidationError(`At most ${String(MAX_AUTOMATIONS)} automations are allowed`);
    }
    await this.deps.automations.restorePreset(await this.presetFor(userId, total));
    return this.published(userId);
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

  private async entries(userId: UserId, stored: Automation[]): Promise<AutomationEntry[]> {
    return withUnsupported(stored, await this.deps.automations.listUnsupported(userId));
  }

  private async published(userId: UserId): Promise<AutomationEntry[]> {
    const automations = await this.entries(userId, await this.deps.automations.listByUser(userId));
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
