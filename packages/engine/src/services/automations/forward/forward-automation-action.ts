import type { AutomationActionOf, Message, UserId } from '@relay/shared/domain';
import type { AccountRepository } from '../../../ports/account-repository';
import { type ActionEffect, NO_EFFECT } from '../action-effect';
import type { AutomationActionContext, AutomationActionHandler } from '../automation-action';
import { AutomationActionRefusal } from '../automation-action-refusal';
import { autoForwardBlockOf } from './auto-forward-guard';
import type { ForwardRateLimit } from './forward-rate-limit';
import type { MailForwarder } from './mail-forwarder';

export interface ForwardAutomationActionDeps {
  readonly forwarder: MailForwarder;
  readonly accounts: AccountRepository;
  readonly limit: ForwardRateLimit;
}

export class ForwardAutomationAction
  implements AutomationActionHandler<AutomationActionOf<'forward'>>
{
  constructor(private readonly deps: ForwardAutomationActionDeps) {}

  async run(
    { userId, automation, arrival }: AutomationActionContext,
    { to }: AutomationActionOf<'forward'>,
  ): Promise<ActionEffect> {
    const { message, live, headers } = arrival;
    if (!live) {
      throw new AutomationActionRefusal('Preposiela sa iba novo prijatý mail');
    }
    if (automation.accountId !== message.accountId) {
      throw new AutomationActionRefusal('Preposielať vie iba pravidlo pre účet tohto mailu');
    }
    if (await this.fromOwnAccount(userId, message)) {
      throw new AutomationActionRefusal('Mail z vlastného účtu sa automaticky nepreposiela');
    }
    const blocked = autoForwardBlockOf(headers);
    if (blocked !== null) {
      throw new AutomationActionRefusal(blocked);
    }
    await this.deps.limit.assert(userId, message.accountId);
    await this.deps.forwarder.forward(userId, message, to);
    return NO_EFFECT;
  }

  private async fromOwnAccount(userId: UserId, message: Message): Promise<boolean> {
    const sender = message.from?.email.toLowerCase() ?? null;
    if (sender === null) {
      return false;
    }
    const own = await this.deps.accounts.listByUser(userId);
    return own.some((account) => account.email.toLowerCase() === sender);
  }
}
