import type { AutomationInput } from '@relay/shared/api';
import {
  type Automation,
  type AutomationActionOf,
  isParameterizedAction,
  type MailboxRole,
  type UserId,
} from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { LabelRepository } from '../../ports/label-repository';
import type { MailboxRepository } from '../../ports/mailbox-repository';

type TargetAction = AutomationActionOf<'moveTo' | 'addLabel'>;

export const AUTOMATION_MOVE_ROLES: readonly MailboxRole[] = [
  'custom',
  'label',
  'inbox',
  'archive',
];

const ALL_ACCOUNTS_MESSAGE = 'Pravidlo pre všetky účty nemôže presúvať ani štítkovať, vyber účet';

const targetKey = (action: TargetAction): string =>
  action.type === 'moveTo' ? `moveTo:${action.mailboxId}` : `addLabel:${action.labelId}`;

const storedTargets = (input: AutomationInput, stored: Automation | undefined): Set<string> => {
  if (stored === undefined || stored.accountId !== input.accountId) {
    return new Set();
  }
  return new Set(stored.actions.filter(isParameterizedAction).map(targetKey));
};

export class AutomationTargetValidator {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly labels: LabelRepository,
  ) {}

  async assert(
    userId: UserId,
    inputs: readonly AutomationInput[],
    stored: ReadonlyMap<string, Automation>,
  ): Promise<void> {
    for (const input of inputs) {
      const targets = input.actions.filter(isParameterizedAction);
      if (targets.length === 0) {
        continue;
      }
      if (input.accountId === null) {
        throw new ValidationError(ALL_ACCOUNTS_MESSAGE);
      }
      const known = storedTargets(input, input.id === undefined ? undefined : stored.get(input.id));
      for (const action of targets.filter((target) => !known.has(targetKey(target)))) {
        await this.assertTarget(userId, input, input.accountId, action);
      }
    }
  }

  private async assertTarget(
    userId: UserId,
    input: AutomationInput,
    accountId: string,
    action: TargetAction,
  ): Promise<void> {
    if (action.type === 'addLabel') {
      const label = await this.labels.findById(userId, action.labelId);
      if (label?.accountId !== accountId) {
        throw new ValidationError(`Štítok pravidla ${input.name} na tomto účte neexistuje`);
      }
      return;
    }
    const mailbox = await this.mailboxes.findById(action.mailboxId);
    if (mailbox?.accountId !== accountId) {
      throw new ValidationError(`Priečinok pravidla ${input.name} na tomto účte neexistuje`);
    }
    if (!AUTOMATION_MOVE_ROLES.includes(mailbox.role)) {
      throw new ValidationError(`Do priečinka ${mailbox.name} pravidlo presúvať nemôže`);
    }
  }
}
