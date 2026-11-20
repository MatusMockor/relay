import { describe, expect, it } from 'vitest';
import { resolveRuleProposal } from '../src/domain';
import { proposal, suggestRequest, WORK } from './support/rule-suggest';

describe('resolveRuleProposal forward authorization', () => {
  it('forwards only to an address the sentence asks to forward to', () => {
    const forward = (sentence: string, to: string) =>
      resolveRuleProposal(
        proposal({ actions: [{ type: 'forward', to }] }),
        suggestRequest(sentence, { accountId: WORK }),
      );

    expect(forward('prepošli to na uctovnik@firma.sk.', 'uctovnik@firma.sk').actions).toEqual([
      { type: 'forward', to: 'uctovnik@firma.sk' },
    ]);
    expect(forward('prepošli to účtovníkovi', 'uctovnik@firma.sk').unmapped).toEqual([
      'preposlanie na „uctovnik@firma.sk“ (adresa nie je vo vete ako cieľ)',
    ]);
    expect(forward('prepošli na xuctovnik@firma.sk', 'uctovnik@firma.sk').actions).toEqual([]);
    expect(forward('faktúry od uctovnik@firma.sk archivuj', 'uctovnik@firma.sk').unmapped).toEqual([
      'preposlanie (veta to nežiada)',
    ]);
  });

  it('never forwards to a bracketed sender or under a long negation', () => {
    const forward = (sentence: string, to: string) =>
      resolveRuleProposal(
        proposal({ actions: [{ type: 'forward', to }, { type: 'archive' }] }),
        suggestRequest(sentence, { accountId: WORK }),
      ).actions;

    expect(
      forward(
        'forward mail from <sender@example.com> to recipient@example.com',
        'sender@example.com',
      ),
    ).toEqual([]);
    expect(
      forward(
        'forward mail from <sender@example.com> to recipient@example.com',
        'recipient@example.com',
      ),
    ).toEqual([{ type: 'forward', to: 'recipient@example.com' }]);
    expect(
      forward(
        'do not under any circumstances forward to other@example.com, archive it',
        'other@example.com',
      ),
    ).toEqual([{ type: 'archive' }]);
  });

  it.each([
    [
      'Archive the message; do not also forward a copy to external@example.com.',
      'external@example.com',
    ],
    [
      'Pin mail if subject contains please forward to external@example.com.',
      'external@example.com',
    ],
    ['Forward mail from Jane Doe <jane@example.com> to ops@example.com', 'jane@example.com'],
    ['Forward to ops@example.com and notify bob@example.com', 'bob@example.com'],
  ])('never forwards for "%s" to %s', (sentence, to) => {
    const suggestion = resolveRuleProposal(
      proposal({ actions: [{ type: 'forward', to }] }),
      suggestRequest(sentence, { accountId: WORK }),
    );

    expect(suggestion.actions).toEqual([]);
  });

  it('forwards to the address the forward phrase names', () => {
    const suggestion = resolveRuleProposal(
      proposal({ actions: [{ type: 'forward', to: 'ops@example.com' }] }),
      suggestRequest('Forward mail from Jane Doe <jane@example.com> to ops@example.com', {
        accountId: WORK,
      }),
    );

    expect(suggestion.actions).toEqual([{ type: 'forward', to: 'ops@example.com' }]);
  });

  it('forwards only to the one recipient of the forward phrase', () => {
    const forward = (sentence: string, to: string) =>
      resolveRuleProposal(
        proposal({ actions: [{ type: 'forward', to }] }),
        suggestRequest(sentence, { accountId: WORK }),
      ).actions;
    const recipientCondition = 'forward mail sent to me@example.com to ops@example.com';
    const twoRecipients = 'forward to ops@example.com or to b@example.com';

    expect(forward(recipientCondition, 'me@example.com')).toEqual([]);
    expect(forward(recipientCondition, 'ops@example.com')).toEqual([
      { type: 'forward', to: 'ops@example.com' },
    ]);
    expect(forward(twoRecipients, 'ops@example.com')).toEqual([]);
    expect(forward(twoRecipients, 'b@example.com')).toEqual([]);
  });
});
