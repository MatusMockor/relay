import type { AccountId, SplitId } from '@relay/shared/domain';
import type { SplitInput } from '@relay/shared/api';
import { describe, expect, it, vi } from 'vitest';
import { deliverMail, seedAccount } from '../support/fixtures';
import { GatedSplitMatcher } from '../support/mail/gated-split-matcher';
import { RuleSplitMatcher } from '../support/mail/rule-split-matcher';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const partners: SplitInput = {
  accountId: null,
  name: 'Partneri',
  order: 0,
  rules: [{ type: 'fromDomain', domain: 'partner.test' }],
  exclusive: false,
};

const jira: SplitInput = {
  accountId: null,
  name: 'Jira',
  order: 1,
  rules: [{ type: 'jira', projectKeys: ['REL'] }],
  exclusive: true,
};

const syncedInbox = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'p1' });
  deliverMail(server, 'INBOX', { id: 'n1', from: { name: null, email: 'news@other.test' } });
  deliverMail(server, 'INBOX', {
    id: 'j1',
    from: { name: 'Jira', email: 'jira@company.test' },
    subject: '[REL-3] Fix login',
  });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  engine.events.clear();
  return account;
};

const splitIdsBySubject = (engine: TestEngine) => {
  const threads = [...engine.db.tables.threads.values()];
  return Object.fromEntries(threads.map((thread) => [thread.subject, thread.splitIds]));
};

describe('SplitService', () => {
  it('applies the membership of the latest splits when replacements overlap', async () => {
    const matcher = new GatedSplitMatcher(new RuleSplitMatcher());
    const engine = createTestEngine({ splitMatcher: matcher });
    await syncedInbox(engine);

    matcher.hold();
    const stale = engine.services.splits.replace(USER_ID, { splits: [partners] });
    await vi.waitFor(() => {
      expect(matcher.heldCount).toBeGreaterThan(0);
    });
    matcher.stopHolding();
    const newer = engine.services.splits.replace(USER_ID, { splits: [jira] });
    matcher.releaseHeld();
    const [, latest] = await Promise.all([stale, newer]);

    expect(splitIdsBySubject(engine)).toEqual({
      'Subject p1': [],
      'Subject n1': [],
      '[REL-3] Fix login': latest.map((split) => split.id),
    });
  });

  it('replaces splits and re-evaluates existing threads', async () => {
    const engine = createTestEngine();
    await syncedInbox(engine);

    const stored = await engine.services.splits.replace(USER_ID, { splits: [partners, jira] });

    const [partnerSplit, jiraSplit] = stored;
    expect(stored.map((split) => split.name)).toEqual(['Partneri', 'Jira']);
    expect(splitIdsBySubject(engine)).toEqual({
      'Subject p1': [partnerSplit?.id],
      'Subject n1': [],
      '[REL-3] Fix login': [jiraSplit?.id],
    });
    expect(engine.events.ofType('splits.updated')).toHaveLength(1);
    expect(engine.events.ofType('thread.upserted')).toHaveLength(2);
    const main = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(main.items.map((thread) => thread.subject).sort()).toEqual(['Subject n1', 'Subject p1']);
  });

  it('keeps ids of existing splits and clears memberships of removed ones', async () => {
    const engine = createTestEngine();
    await syncedInbox(engine);
    const [first] = await engine.services.splits.replace(USER_ID, { splits: [partners, jira] });

    const kept = await engine.services.splits.replace(USER_ID, {
      splits: [{ ...partners, id: first?.id, name: 'Partners' }],
    });

    expect(kept.map((split) => [split.id, split.name])).toEqual([[first?.id, 'Partners']]);
    expect(splitIdsBySubject(engine)['[REL-3] Fix login']).toEqual([]);
    expect(await engine.services.splits.list(USER_ID)).toEqual(kept);
  });

  it('rejects invalid patterns, foreign accounts and unknown ids', async () => {
    const engine = createTestEngine();
    await syncedInbox(engine);

    await expect(
      engine.services.splits.replace(USER_ID, {
        splits: [
          {
            ...partners,
            rules: [{ type: 'subjectRegex', pattern: '([a-z', caseSensitive: false }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      engine.services.splits.replace(USER_ID, {
        splits: [{ ...partners, accountId: 'account_foreign' as AccountId }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      engine.services.splits.replace(USER_ID, {
        splits: [{ ...partners, id: 'split_x' as SplitId }],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(await engine.services.splits.list(USER_ID)).toEqual([]);
  });
});
