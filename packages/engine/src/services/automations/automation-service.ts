import type { AutomationInput, ReplaceAutomationsBody } from '@relay/shared/api';
import type { Automation, UserId } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { AutomationRepository } from '../../ports/automation-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';
import type { EngineEvents } from '../shared/engine-events';
import { KeyedSerializer } from '../shared/keyed-serializer';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { assertRulePatterns } from '../splits/split-rule-validator';
import { hasJiraTasksPreset, jiraTasksPreset } from './automation-presets';

export interface AutomationServiceDeps {
  readonly automations: AutomationRepository;
  readonly accounts: AccountRepository;
  readonly settings: UserSettingsReader;
  readonly events: EngineEvents;
  readonly ids: IdGenerator;
  readonly patterns: SplitPatternPolicy;
}

export class AutomationService {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: AutomationServiceDeps) {}

  list(userId: UserId): Promise<Automation[]> {
    return this.serializer.run(userId, () => this.seeded(userId));
  }

  replace(userId: UserId, body: ReplaceAutomationsBody): Promise<Automation[]> {
    return this.serializer.run(userId, () => this.replaceNow(userId, body));
  }

  private async replaceNow(userId: UserId, body: ReplaceAutomationsBody): Promise<Automation[]> {
    body.automations.forEach((input) => {
      assertRulePatterns(
        { kind: 'Automation', name: input.name, rules: input.conditions },
        this.deps.patterns,
      );
    });
    await this.assertAccounts(userId, body.automations);
    const current = await this.seeded(userId);
    const known = new Map(current.map((automation) => [automation.id, automation]));
    const automations = body.automations.map((input): Automation => {
      if (input.id !== undefined && !known.has(input.id)) {
        throw new ValidationError(`Unknown automation id ${input.id}`);
      }
      const preset = input.id === undefined ? null : (known.get(input.id)?.preset ?? null);
      return { ...input, id: input.id ?? this.deps.ids.generate('automation'), userId, preset };
    });
    if (new Set(automations.map((automation) => automation.id)).size !== automations.length) {
      throw new ValidationError('Automation ids must be unique');
    }
    if (hasJiraTasksPreset(current) && !hasJiraTasksPreset(automations)) {
      throw new ValidationError('The default Jira automation can be turned off but not removed');
    }
    const stored = await this.deps.automations.replaceAll(userId, automations);
    await this.deps.events.emit(userId, 'automations.updated', { automations: stored });
    return stored;
  }

  private async seeded(userId: UserId): Promise<Automation[]> {
    const stored = await this.deps.automations.listByUser(userId);
    if (hasJiraTasksPreset(stored)) {
      return stored;
    }
    const settings = await this.deps.settings.read(userId);
    await this.deps.automations.createPresetIfAbsent(
      jiraTasksPreset(
        userId,
        this.deps.ids.generate('automation'),
        settings.ai.defaultRunner,
        stored.length,
      ),
    );
    return this.deps.automations.listByUser(userId);
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
