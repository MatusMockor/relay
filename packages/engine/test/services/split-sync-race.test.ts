import type { SplitInput } from '@relay/shared/api';
import { describe, expect, it } from 'vitest';
import type { SplitMatcher, SplitMatchInput } from '../../src';
import { threadBySubject } from '../support/automation-filters';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { RuleSplitMatcher } from '../support/mail/rule-split-matcher';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const PARTNER = { name: 'Peter Kral', email: 'peter@partner.test' };

const partners: SplitInput = {
  accountId: null,
  name: 'Partneri',
  order: 0,
  rules: [{ type: 'fromDomain', domain: 'partner.test' }],
  exclusive: true,
  hideTasks: false,
};

class EditDuringIngest implements SplitMatcher {
  private readonly rules = new RuleSplitMatcher();
  engine: TestEngine | null = null;
  private edited = false;

  async match(input: SplitMatchInput) {
    if (this.engine !== null && !this.edited && input.message.subject === 'Ponuka') {
      this.edited = true;
      await this.engine.services.splits.replace(USER_ID, { splits: [partners] });
    }
    return this.rules.match(input);
  }
}

describe('a split edit racing a sync', () => {
  it('files mail ingested with the old splits by the new splits once the sync ends', async () => {
    const matcher = new EditDuringIngest();
    const engine = createTestEngine({ splitMatcher: matcher });
    matcher.engine = engine;
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'p1', from: PARTNER, subject: 'Ponuka' });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const split = present((await engine.services.splits.list(USER_ID))[0]);
    expect(threadBySubject(engine, 'Ponuka').splitIds).toEqual([split.id]);
    expect(
      engine.events
        .ofType('thread.upserted')
        .some((event) => event.data.thread.splitIds.includes(split.id)),
    ).toBe(true);
  });
});
