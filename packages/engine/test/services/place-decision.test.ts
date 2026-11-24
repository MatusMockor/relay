import { describe, expect, it } from 'vitest';
import {
  claimedGates,
  decidePlacement,
  type MatchedDecision,
  type PlacementCandidates,
  placedKindOf,
  placementWriteOf,
} from '../../src';
import {
  ALL_MAIL,
  at,
  identityAt,
  INBOX,
  placedMessage,
  SENT,
} from '../support/placement-fixtures';

const NONE: PlacementCandidates = { atLocation: null, byEmailId: [], byMessageId: [] };

const HEADER = { messageIdHeader: '<msg@relay.test>' };

describe('decidePlacement', () => {
  it('refreshes the message at the location and fills a missing email id', () => {
    const stored = placedMessage('msg', [at(INBOX, 5)]);
    const known = placedMessage('known', [at(INBOX, 5)], { emailId: 'gm-1' });
    const identity = identityAt(at(INBOX, 5), 'inbox');

    expect(decidePlacement(identity, { ...NONE, atLocation: stored })).toEqual({
      kind: 'refresh',
      message: stored,
      fillEmailId: true,
    });
    expect(decidePlacement(identity, { ...NONE, atLocation: known })).toMatchObject({
      kind: 'refresh',
      fillEmailId: false,
    });
    expect(
      decidePlacement(identityAt(at(INBOX, 5), 'inbox', { emailId: null }), {
        ...NONE,
        atLocation: stored,
      }),
    ).toMatchObject({ kind: 'refresh', fillEmailId: false });
  });

  it('prefers the location over an email id match', () => {
    const atLocation = placedMessage('here', [at(ALL_MAIL, 9)]);
    const other = placedMessage('other', [at(INBOX, 2)], { emailId: 'gm-1' });

    expect(
      decidePlacement(identityAt(at(ALL_MAIL, 9), 'archive'), {
        ...NONE,
        atLocation,
        byEmailId: [other],
      }),
    ).toMatchObject({ kind: 'refresh', message: atLocation });
  });

  it('attaches a new placement to the keeper of the email id', () => {
    const keeper = placedMessage('keeper', [at(INBOX, 2)], { emailId: 'gm-1' });
    const legacy = placedMessage('legacy', [at(SENT, 3)], { emailId: 'gm-1' });

    expect(
      decidePlacement(identityAt(at(ALL_MAIL, 9), 'archive'), {
        ...NONE,
        byEmailId: [keeper, legacy],
      }),
    ).toEqual({ kind: 'attach', message: keeper, write: 'add' });
  });

  it('adopts the pending placement of the email id in the fetched mailbox', () => {
    const keeper = placedMessage('keeper', [at(ALL_MAIL, 9), at(INBOX, 0)], { emailId: 'gm-1' });

    expect(
      decidePlacement(identityAt(at(INBOX, 12), 'inbox'), { ...NONE, byEmailId: [keeper] }),
    ).toEqual({ kind: 'adopt', message: keeper, uid: 'set', fillEmailId: false });
  });

  it('replaces a lower uid in the mailbox and ignores a stale lower fetch', () => {
    const keeper = placedMessage('keeper', [at(ALL_MAIL, 9), at(INBOX, 4)], { emailId: 'gm-1' });
    const candidates = { ...NONE, byEmailId: [keeper] };

    expect(decidePlacement(identityAt(at(INBOX, 12), 'inbox'), candidates)).toEqual({
      kind: 'attach',
      message: keeper,
      write: 'replace',
    });
    expect(decidePlacement(identityAt(at(INBOX, 3), 'inbox'), candidates)).toEqual({
      kind: 'stale',
      message: keeper,
    });
  });

  it('never joins by email id on a generic account or without a fetched email id', () => {
    const match = placedMessage('match', [at(INBOX, 2)], { emailId: 'gm-1' });
    const candidates = { ...NONE, byEmailId: [match] };

    expect(
      decidePlacement(identityAt(at(ALL_MAIL, 9), 'archive', { labelBased: false }), candidates),
    ).toEqual({ kind: 'create' });
    expect(
      decidePlacement(identityAt(at(ALL_MAIL, 9), 'archive', { emailId: null }), candidates),
    ).toEqual({ kind: 'create' });
  });

  it('adopts exactly one pending Gmail placeholder without an email id', () => {
    const placeholder = placedMessage('placeholder', [at(INBOX, 0)]);
    const twin = placedMessage('twin', [at(INBOX, 0)]);
    const foreign = placedMessage('foreign', [at(INBOX, 0)], { emailId: 'gm-2' });
    const identity = identityAt(at(INBOX, 7), 'inbox', HEADER);

    expect(decidePlacement(identity, { ...NONE, byMessageId: [placeholder] })).toEqual({
      kind: 'adopt',
      message: placeholder,
      uid: 'set',
      fillEmailId: true,
    });
    expect(decidePlacement(identity, { ...NONE, byMessageId: [placeholder, twin] })).toEqual({
      kind: 'create',
    });
    expect(decidePlacement(identity, { ...NONE, byMessageId: [foreign] })).toEqual({
      kind: 'create',
    });
  });

  it('adopts the first pending generic placeholder in the fetched mailbox', () => {
    const elsewhere = placedMessage('elsewhere', [at(ALL_MAIL, 0)]);
    const first = placedMessage('first', [at(INBOX, 0)], { emailId: 'obj-1' });
    const second = placedMessage('second', [at(INBOX, 0)]);
    const identity = identityAt(at(INBOX, 7), 'inbox', {
      ...HEADER,
      labelBased: false,
      emailId: null,
    });

    expect(decidePlacement(identity, { ...NONE, byMessageId: [elsewhere, first, second] })).toEqual(
      { kind: 'adopt', message: first, uid: 'set', fillEmailId: false },
    );
  });

  it('skips placeholder adoption without a Message-ID', () => {
    const placeholder = placedMessage('placeholder', [at(INBOX, 0)]);

    expect(
      decidePlacement(identityAt(at(INBOX, 7), 'inbox'), { ...NONE, byMessageId: [placeholder] }),
    ).toEqual({ kind: 'create' });
  });

  it('adopts the one Sent record of a Gmail account and keeps its higher uid', () => {
    const record = placedMessage('record', [at(SENT, 40)]);
    const identity = (uid: number) => identityAt(at(SENT, uid), 'sent', HEADER);

    expect(decidePlacement(identity(41), { ...NONE, byMessageId: [record] })).toEqual({
      kind: 'adopt',
      message: record,
      uid: 'set',
      fillEmailId: true,
    });
    expect(decidePlacement(identity(39), { ...NONE, byMessageId: [record] })).toEqual({
      kind: 'adopt',
      message: record,
      uid: 'keep',
      fillEmailId: true,
    });
  });

  it('leaves Sent records alone outside the rule', () => {
    const record = placedMessage('record', [at(SENT, 40)]);
    const second = placedMessage('second', [at(SENT, 42)]);
    const resolved = placedMessage('resolved', [at(SENT, 40)], { emailId: 'gm-9' });
    const candidates = { ...NONE, byMessageId: [record] };

    expect(decidePlacement(identityAt(at(ALL_MAIL, 41), 'archive', HEADER), candidates)).toEqual({
      kind: 'create',
    });
    expect(
      decidePlacement(identityAt(at(SENT, 41), 'sent', HEADER), {
        ...NONE,
        byMessageId: [record, second],
      }),
    ).toEqual({ kind: 'create' });
    expect(
      decidePlacement(identityAt(at(SENT, 41), 'sent', HEADER), {
        ...NONE,
        byMessageId: [resolved],
      }),
    ).toEqual({ kind: 'create' });
    expect(
      decidePlacement(identityAt(at(SENT, 41), 'sent', { ...HEADER, emailId: null }), candidates),
    ).toEqual({ kind: 'create' });
    expect(
      decidePlacement(
        identityAt(at(SENT, 41), 'sent', { ...HEADER, labelBased: false }),
        candidates,
      ),
    ).toEqual({ kind: 'create' });
  });

  it('creates a message when nothing matches', () => {
    expect(decidePlacement(identityAt(at(INBOX, 7), 'inbox', HEADER), NONE)).toEqual({
      kind: 'create',
    });
  });
});

describe('placement writes', () => {
  const message = placedMessage('msg', [at(INBOX, 4)]);
  const identity = identityAt(at(INBOX, 12), 'inbox');
  const cases: readonly [MatchedDecision, string, boolean, boolean][] = [
    [{ kind: 'refresh', message, fillEmailId: true }, 'refreshed', false, true],
    [{ kind: 'refresh', message, fillEmailId: false }, 'refreshed', false, false],
    [{ kind: 'stale', message }, 'refreshed', false, false],
    [{ kind: 'attach', message, write: 'add' }, 'attached', true, false],
    [{ kind: 'attach', message, write: 'replace' }, 'attached', true, false],
    [{ kind: 'adopt', message, uid: 'set', fillEmailId: true }, 'adopted', true, true],
    [{ kind: 'adopt', message, uid: 'keep', fillEmailId: true }, 'adopted', false, true],
  ];

  it.each(cases)('maps %o to its kind and writes', (decision, kind, placement, emailId) => {
    expect(placedKindOf(decision)).toBe(kind);
    expect(placementWriteOf(identity, decision)).toEqual({
      message,
      placement: placement ? at(INBOX, 12) : null,
      emailId: emailId ? 'gm-1' : null,
    });
  });

  it('claims only the requested gates that are still open', () => {
    expect(claimedGates({ jira: true, invite: true }, { jira: true, invite: false })).toEqual({
      jira: false,
      invite: true,
    });
    expect(claimedGates({ jira: false, invite: false }, { jira: false, invite: false })).toEqual({
      jira: false,
      invite: false,
    });
  });
});
