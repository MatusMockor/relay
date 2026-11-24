import { describe, expect, it } from 'vitest';
import {
  MailboxIdSchema,
  resolveRuleProposal,
  type RuleProposal,
  RuleSuggestionSchema,
} from '../src/domain';
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
      suggestRequest('predmet faktúra, archivuj'),
    );

    expect(suggestion.conditions).toEqual([{ type: 'subjectContains', value: 'faktúra' }]);
    expect(suggestion.actions).toEqual([{ type: 'archive' }]);
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

  it('reports a target name that is ambiguous in the account', () => {
    const twins = {
      ...workAccount,
      folders: [
        { id: MailboxIdSchema.parse('mbx_1'), name: 'Účty' },
        { id: MailboxIdSchema.parse('mbx_2'), name: 'Ucty' },
      ],
    };
    const suggestion = resolveRuleProposal(
      proposal({ actions: [{ type: 'moveTo', folder: 'Účty' }] }),
      suggestRequest('presuň do Účty', { accountId: WORK, accounts: [twins] }),
    );

    expect(suggestion.actions).toEqual([]);
    expect(suggestion.unmapped).toEqual(['priečinok „Účty“ (nejednoznačný názov)']);
  });

  it('names the rule after its strongest condition and keeps the case of user values', () => {
    const named = (conditions: RuleProposal['conditions']) =>
      resolveRuleProposal(proposal({ name: 'EFabrica', conditions }), suggestRequest('archivuj'))
        .name;

    expect(
      named([
        { type: 'subjectContains', value: 'Pipeline' },
        { type: 'fromAddress', address: 'gitlab@firma.sk' },
      ]),
    ).toBe('gitlab@firma.sk');
    expect(named([{ type: 'fromDomain', domain: 'substack.com' }])).toBe('substack.com');
    expect(named([{ type: 'subjectContains', value: 'Pipeline' }])).toBe('Pipeline');
    expect(named([{ type: 'hasAttachment' }])).toBe('EFabrica');
  });
});
