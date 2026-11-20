import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CreateAiJobBodySchema } from '../src/api';
import {
  AiOutputSchema,
  RULE_SENTENCE_MAX_LENGTH,
  RuleProposalSchema,
  RuleSuggestionSchema,
} from '../src/domain';
import { proposal, suggestRequest, WORK, workAccount } from './support/rule-suggest';

describe('rule proposal schema', () => {
  it('accepts a proposal with named label and folder targets', () => {
    const parsed = RuleProposalSchema.safeParse(
      proposal({
        actions: [
          { type: 'addLabel', label: 'Faktúry' },
          { type: 'moveTo', folder: 'Archív' },
          { type: 'remind', afterDays: 3 },
          { type: 'forward', to: 'uctovnik@firma.sk' },
        ],
        exceptions: [{ type: 'fromDomain', domain: 'newsletter.sk' }],
      }),
    );

    expect(parsed.success).toBe(true);
  });

  it.each([
    ['an unknown action', { actions: [{ type: 'delete' }] }],
    ['an unknown condition', { conditions: [{ type: 'olderThan', days: 3 }] }],
    ['a label id instead of a name', { actions: [{ type: 'addLabel', labelId: 'lbl_1' }] }],
    ['a reminder after 60 days', { actions: [{ type: 'remind', afterDays: 60 }] }],
    ['an extra field', { confidence: 0.9 }],
    ['an empty explanation', { understood: ' ' }],
    ['a sender that is no address', { conditions: [{ type: 'fromAddress', address: 'jano' }] }],
  ])('rejects %s', (_label, change) => {
    expect(RuleProposalSchema.safeParse({ ...proposal(), ...change }).success).toBe(false);
  });

  it('describes itself as a strict JSON schema for the model', () => {
    const schema = JSON.stringify(z.toJSONSchema(RuleProposalSchema));

    expect(schema).toContain('"additionalProperties":false');
    expect(schema).toContain('"subjectContains"');
    expect(schema).toContain('"folder"');
  });
});

describe('rule suggestion job', () => {
  it('accepts a ruleSuggest job with the account catalog', () => {
    const body = CreateAiJobBodySchema.safeParse({
      input: { kind: 'ruleSuggest', ...suggestRequest('archivuj faktúry', { accountId: WORK }) },
    });

    expect(body.success).toBe(true);
  });

  it('rejects an empty or too long sentence', () => {
    const job = (sentence: string) =>
      CreateAiJobBodySchema.safeParse({
        input: { kind: 'ruleSuggest', ...suggestRequest(sentence) },
      }).success;

    expect(job('   ')).toBe(false);
    expect(job('a'.repeat(RULE_SENTENCE_MAX_LENGTH + 1))).toBe(false);
  });

  it('carries a resolved suggestion as the job output', () => {
    const output = AiOutputSchema.safeParse({
      kind: 'ruleSuggest',
      suggestion: {
        name: 'Faktúry',
        accountId: WORK,
        match: 'all',
        conditions: [{ type: 'hasAttachment' }],
        exceptions: [],
        actions: [{ type: 'addLabel', labelId: workAccount.labels[0]?.id }],
        understood: 'Maily s prílohou dostanú štítok Faktúry.',
        unmapped: ['od dodávateľov'],
      },
    });

    expect(output.success).toBe(true);
  });

  it('allows a suggestion without conditions or actions but not with named targets', () => {
    const base = {
      name: 'Nové pravidlo',
      accountId: null,
      match: 'all',
      conditions: [],
      exceptions: [],
      actions: [],
      understood: '',
      unmapped: [],
    };

    expect(RuleSuggestionSchema.safeParse(base).success).toBe(true);
    expect(
      RuleSuggestionSchema.safeParse({ ...base, actions: [{ type: 'addLabel', label: 'Faktúry' }] })
        .success,
    ).toBe(false);
  });
});
