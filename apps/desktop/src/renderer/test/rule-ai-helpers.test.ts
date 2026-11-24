import { type AiEvent, type RuleSuggestion, RuleSuggestRequestSchema } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import type { MailClient } from '../src/data/MailClient';
import type { RuleInput } from '../src/features/settings/automations/editable-rule';
import { applySuggestion } from '../src/features/settings/automations/rule-ai/apply-suggestion';
import { runRuleSuggest } from '../src/features/settings/automations/rule-ai/run-rule-suggest';
import { suggestCatalog } from '../src/features/settings/automations/rule-ai/suggest-catalog';

const suggestion = (overrides: Partial<RuleSuggestion> = {}): RuleSuggestion => ({
  name: 'Faktúry',
  accountId: null,
  match: 'any',
  conditions: [{ type: 'hasAttachment' }],
  exceptions: [{ type: 'fromDomain', domain: 'spam.sk' }],
  actions: [{ type: 'archive' }],
  understood: 'Archivujem maily s prílohou.',
  unmapped: [],
  ...overrides,
});

const input = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  accountId: null,
  name: 'Staré',
  enabled: false,
  order: 3,
  match: 'all',
  conditions: [{ type: 'fromAddress', address: 'jana@firma.sk' }],
  exceptions: [],
  ai: { runner: 'codex', model: null, effort: null, instructions: 'Stručne' },
  actions: [{ type: 'task' }],
  ...overrides,
});

const failingClient = (event: AiEvent): MailClient => ({
  ...createDemoMailClient({ aiStepMs: 0 }),
  runAi: (_request, listener) => {
    listener(event);
    return () => undefined;
  },
});

const outcome = (client: MailClient): Promise<string | RuleSuggestion> =>
  new Promise((resolve) => {
    runRuleSuggest(
      client,
      { sentence: 'archivuj', accountId: null, accounts: [] },
      { onDone: resolve, onError: resolve },
    );
  });

describe('rule AI helpers', () => {
  it('builds the catalog of every account with its labels and move targets', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const accounts = await client.listAccounts();
    const labels = await client.listLabels();
    const mailboxes = new Map(
      await Promise.all(
        accounts.map(
          async (account) => [account.id, await client.listMailboxes(account.id)] as const,
        ),
      ),
    );

    const catalog = suggestCatalog(accounts, labels, mailboxes);
    const freelance = catalog.find((account) => account.name === 'Freelance');

    expect(catalog.map((account) => account.name)).toEqual(['eFabrica', 'Osobný', 'Freelance']);
    expect(freelance?.labels.map((label) => label.name)).toEqual(['Klienti', 'Faktúry']);
    expect(freelance?.folders.map((folder) => folder.name)).toEqual([
      'Doručená pošta',
      'Archív',
      'INBOX / Zákazky',
      'INBOX / Zákazky / Ateliér Brezina',
      'INBOX / Zákazky / Čajovňa',
    ]);
  });

  it('names an account without a display name by its address', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const accounts = (await client.listAccounts()).map((account, index) =>
      index === 0 ? { ...account, displayName: '  ' } : account,
    );

    const catalog = suggestCatalog(accounts, [], new Map());

    expect(catalog).toHaveLength(accounts.length);
    expect(catalog[0]?.name).toBe(accounts[0]?.email);
    expect(
      RuleSuggestRequestSchema.safeParse({
        sentence: 'archivuj',
        accountId: null,
        accounts: catalog,
      }).success,
    ).toBe(true);
  });

  it('replaces the criteria and actions and keeps the rule settings', () => {
    const applied = applySuggestion(input(), suggestion());

    expect(applied).toEqual({
      ...input(),
      name: 'Faktúry',
      match: 'any',
      conditions: [{ type: 'hasAttachment' }],
      exceptions: [{ type: 'fromDomain', domain: 'spam.sk' }],
      actions: [{ type: 'archive' }],
    });
  });

  it('leaves the actions empty when none could be mapped, even over a sensitive existing one', () => {
    const forwarding = input({ actions: [{ type: 'forward', to: 'jana@firma.sk' }] });

    expect(applySuggestion(forwarding, suggestion({ actions: [] })).actions).toEqual([]);
  });

  it('turns an invalid AI answer into a friendly message', async () => {
    expect(
      await outcome(failingClient({ type: 'failed', code: 'invalid_output', message: 'zod' })),
    ).toBe('AI nevrátila platný návrh pravidla. Skús pravidlo opísať inak.');
    expect(
      await outcome(
        failingClient({ type: 'failed', code: 'process_failed', message: 'invalid_output: x' }),
      ),
    ).toBe('AI nevrátila platný návrh pravidla. Skús pravidlo opísať inak.');
    expect(
      await outcome(
        failingClient({ type: 'failed', code: 'not_installed', message: 'claude chýba' }),
      ),
    ).toBe('Pravidlo sa nepodarilo navrhnúť: claude chýba');
  });

  it('suggests through the demo client', async () => {
    const result = await outcome(createDemoMailClient({ aiStepMs: 0 }));

    expect(result).toMatchObject({ actions: [{ type: 'archive' }], unmapped: [] });
  });
});
