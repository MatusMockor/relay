import { RuleProposalSchema } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { parseRuleSentence } from '../src/data/demo/demo-rule-parser';

describe('demo rule parser', () => {
  it('reads the invoice example and reports the sender it cannot map', () => {
    const proposal = parseRuleSentence(
      'faktúry od dodávateľov s prílohou daj do štítku Faktúry a archivuj',
    );

    expect(proposal).toEqual({
      name: 'Maily s prílohou',
      accountId: null,
      match: 'all',
      conditions: [{ type: 'hasAttachment' }],
      exceptions: [],
      actions: [{ type: 'addLabel', label: 'Faktúry' }, { type: 'archive' }],
      understood: 'Maily s prílohou: pridať štítok Faktúry, archivovať.',
      unmapped: ['od dodávateľov'],
    });
    expect(RuleProposalSchema.safeParse(proposal).success).toBe(true);
  });

  it.each([
    ['od Jana@Firma.sk pripni', { type: 'fromAddress', address: 'jana@firma.sk' }],
    ['od @newsletter.sk označ ako prečítané', { type: 'fromDomain', domain: 'newsletter.sk' }],
    ['z domény substack.com archivuj', { type: 'fromDomain', domain: 'substack.com' }],
    ['z domeny substack.com archivuj', { type: 'fromDomain', domain: 'substack.com' }],
    [
      'predmet obsahuje „cenová ponuka“ pripni',
      { type: 'subjectContains', value: 'cenová ponuka' },
    ],
    ['s predmetom faktúra pripni', { type: 'subjectContains', value: 'faktúra' }],
    ['mail s prilohou pripni', { type: 'hasAttachment' }],
  ])('recognizes the condition in "%s"', (sentence, condition) => {
    expect(parseRuleSentence(sentence).conditions).toEqual([condition]);
  });

  it.each([
    ['od jana@firma.sk archivuj', { type: 'archive' }],
    ['od jana@firma.sk oznac ako precitane', { type: 'markRead' }],
    ['od jana@firma.sk pripni', { type: 'pin' }],
    ['od jana@firma.sk štítok „Klienti/Acme“', { type: 'addLabel', label: 'Klienti/Acme' }],
    ['od jana@firma.sk presuň do Projekty', { type: 'moveTo', folder: 'Projekty' }],
    ['od jana@firma.sk presuň ho do priečinka Zákazky.', { type: 'moveTo', folder: 'Zákazky' }],
    ['od jana@firma.sk pripomeň o 3 dni', { type: 'remind', afterDays: 3 }],
  ])('recognizes the action in "%s"', (sentence, action) => {
    expect(parseRuleSentence(sentence).actions).toEqual([action]);
  });

  it('puts the part after okrem into exceptions', () => {
    const proposal = parseRuleSentence(
      'z domény firma.sk označ ako prečítané okrem od sef@firma.sk',
    );

    expect(proposal.conditions).toEqual([{ type: 'fromDomain', domain: 'firma.sk' }]);
    expect(proposal.exceptions).toEqual([{ type: 'fromAddress', address: 'sef@firma.sk' }]);
    expect(proposal.understood).toBe(
      'Maily z domény firma.sk, okrem od sef@firma.sk: označiť ako prečítané.',
    );
    expect(proposal.name).toBe('Nové pravidlo');
  });

  it('reports a reminder outside the allowed range', () => {
    const proposal = parseRuleSentence('od jana@firma.sk pripomeň o 45 dní');

    expect(proposal.actions).toEqual([]);
    expect(proposal.unmapped).toEqual(['pripomenutie o 45 dní (najviac 30)']);
  });

  it('says when it recognized nothing', () => {
    const proposal = parseRuleSentence('sprav niečo múdre');

    expect(proposal).toMatchObject({
      name: 'Nové pravidlo',
      conditions: [],
      actions: [],
      understood: 'Z vety som nerozpoznal podmienky ani akcie.',
    });
  });
});
