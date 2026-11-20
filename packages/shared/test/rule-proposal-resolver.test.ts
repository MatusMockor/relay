import { describe, expect, it } from 'vitest';
import { resolveRuleProposal, RuleSuggestionSchema } from '../src/domain';
import { HOME, proposal, suggestRequest, WORK, workAccount } from './support/rule-suggest';

const INVOICE_SENTENCE = 'faktúry od dodávateľov s prílohou daj do štítku Faktúry a archivuj';

describe('resolveRuleProposal', () => {
  it('resolves label and folder names to ids of the account', () => {
    const suggestion = resolveRuleProposal(
      proposal({
        actions: [
          { type: 'addLabel', label: 'faktury' },
          { type: 'moveTo', folder: 'Alfa' },
        ],
      }),
      suggestRequest('štítok faktúry a presuň do Alfa', { accountId: WORK }),
    );

    expect(suggestion.accountId).toBe(WORK);
    expect(suggestion.actions).toEqual([
      { type: 'addLabel', labelId: 'lbl_invoices' },
      { type: 'moveTo', mailboxId: 'mbx_projects' },
    ]);
    expect(suggestion.unmapped).toEqual([]);
    expect(RuleSuggestionSchema.safeParse(suggestion).success).toBe(true);
  });

  it('drops a label that does not exist and says so', () => {
    const suggestion = resolveRuleProposal(
      proposal({
        actions: [{ type: 'addLabel', label: 'Zmluvy' }, { type: 'pin' }],
        unmapped: ['od dodávateľov'],
      }),
      suggestRequest('štítok Zmluvy a pripni', { accountId: WORK }),
    );

    expect(suggestion.actions).toEqual([{ type: 'pin' }]);
    expect(suggestion.unmapped).toEqual(['od dodávateľov', 'štítok „Zmluvy“ (neexistuje)']);
  });

  it('picks the only account that has the named label when none is chosen', () => {
    const suggestion = resolveRuleProposal(
      proposal({ actions: [{ type: 'addLabel', label: 'Faktúry' }, { type: 'archive' }] }),
      suggestRequest(INVOICE_SENTENCE),
    );

    expect(suggestion.accountId).toBe(WORK);
    expect(suggestion.actions).toEqual([
      { type: 'addLabel', labelId: 'lbl_invoices' },
      { type: 'archive' },
    ]);
  });

  it('keeps the account the model named and ignores an unknown one', () => {
    const named = resolveRuleProposal(
      proposal({ accountId: HOME }),
      suggestRequest('na osobnom účte archivuj', { accountId: WORK }),
    );
    const unknown = resolveRuleProposal(
      proposal({ accountId: 'acc_made_up' }),
      suggestRequest('archivuj', { accountId: WORK }),
    );

    expect(named.accountId).toBe(HOME);
    expect(unknown.accountId).toBe(WORK);
  });

  it('asks for an account when a target fits no single account', () => {
    const suggestion = resolveRuleProposal(
      proposal({ actions: [{ type: 'moveTo', folder: 'Neznámy' }, { type: 'markRead' }] }),
      suggestRequest('presuň do Neznámy a označ ako prečítané'),
    );

    expect(suggestion.accountId).toBeNull();
    expect(suggestion.actions).toEqual([{ type: 'markRead' }]);
    expect(suggestion.unmapped).toEqual(['priečinok „Neznámy“ (vyber účet)']);
  });

  it('uses the single account of the user for scoped actions', () => {
    const suggestion = resolveRuleProposal(
      proposal({ actions: [{ type: 'addLabel', label: 'Neznámy' }] }),
      suggestRequest('štítok Neznámy', { accounts: [workAccount] }),
    );

    expect(suggestion.accountId).toBe(WORK);
    expect(suggestion.unmapped).toEqual(['štítok „Neznámy“ (neexistuje)']);
  });

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
      'preposlanie na „uctovnik@firma.sk“ (adresa nie je vo vete)',
    ]);
    expect(forward('prepošli na xuctovnik@firma.sk', 'uctovnik@firma.sk').actions).toEqual([]);
    expect(forward('faktúry od uctovnik@firma.sk archivuj', 'uctovnik@firma.sk').unmapped).toEqual([
      'preposlanie (veta ho nežiada)',
    ]);
  });

  it('drafts a reply only when the sentence asks for it', () => {
    const draft = (sentence: string) =>
      resolveRuleProposal(proposal({ actions: [{ type: 'draftReply' }] }), suggestRequest(sentence))
        .actions;

    expect(draft('priprav návrh odpovede na dopyty')).toEqual([{ type: 'draftReply' }]);
    expect(draft('dopyty s podpisom pripni')).toEqual([]);
  });

  it('keeps a single placement action and the first of duplicates', () => {
    const suggestion = resolveRuleProposal(
      proposal({
        actions: [
          { type: 'archive' },
          { type: 'pin' },
          { type: 'remind', afterDays: 3 },
          { type: 'pin' },
        ],
      }),
      suggestRequest('archivuj, pripni a pripomeň o 3 dni'),
    );

    expect(suggestion.actions).toEqual([{ type: 'archive' }, { type: 'pin' }]);
    expect(suggestion.unmapped).toEqual([
      'pripomenutie (pravidlo mail iba presunie, archivuje alebo pripomenie)',
    ]);
  });

  it('drops a condition with a regular expression that does not compile', () => {
    const suggestion = resolveRuleProposal(
      proposal({
        conditions: [
          { type: 'subjectRegex', pattern: '([', caseSensitive: false },
          { type: 'subjectContains', value: 'faktúra' },
        ],
      }),
      suggestRequest('predmet faktúra'),
    );

    expect(suggestion.conditions).toEqual([{ type: 'subjectContains', value: 'faktúra' }]);
    expect(suggestion.unmapped).toEqual(['regulárny výraz „([“ (neplatný)']);
  });

  it('clips long notes so the suggestion stays valid', () => {
    const name = 'Š'.repeat(200);
    const suggestion = resolveRuleProposal(
      proposal({ actions: [{ type: 'addLabel', label: name }] }),
      suggestRequest(`štítok ${name}`, { accountId: WORK }),
    );

    expect(suggestion.unmapped[0]?.length).toBe(200);
    expect(RuleSuggestionSchema.safeParse(suggestion).success).toBe(true);
  });
});
