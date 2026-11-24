import {
  AccountIdSchema,
  LabelIdSchema,
  MailboxIdSchema,
  type RuleProposal,
  type RuleSuggestAccount,
  type RuleSuggestRequest,
} from '../../src/domain';

export const WORK = AccountIdSchema.parse('acc_work');
export const HOME = AccountIdSchema.parse('acc_home');

export const workAccount: RuleSuggestAccount = {
  id: WORK,
  name: 'Práca',
  labels: [
    { id: LabelIdSchema.parse('lbl_invoices'), name: 'Faktúry' },
    { id: LabelIdSchema.parse('lbl_clients'), name: 'Klienti/Acme' },
  ],
  folders: [
    { id: MailboxIdSchema.parse('mbx_archive'), name: 'Archív' },
    { id: MailboxIdSchema.parse('mbx_projects'), name: 'Projekty / Alfa' },
  ],
};

export const homeAccount: RuleSuggestAccount = {
  id: HOME,
  name: 'Osobný',
  labels: [{ id: LabelIdSchema.parse('lbl_family'), name: 'Rodina' }],
  folders: [{ id: MailboxIdSchema.parse('mbx_trips'), name: 'Cestovanie' }],
};

export const suggestRequest = (
  sentence: string,
  overrides: Partial<RuleSuggestRequest> = {},
): RuleSuggestRequest => ({
  sentence,
  accountId: null,
  accounts: [workAccount, homeAccount],
  ...overrides,
});

export const proposal = (overrides: Partial<RuleProposal> = {}): RuleProposal => ({
  name: 'Faktúry',
  accountId: null,
  match: 'all',
  conditions: [{ type: 'hasAttachment' }],
  exceptions: [],
  actions: [{ type: 'archive' }],
  understood: 'Maily s prílohou archivujem.',
  unmapped: [],
  ...overrides,
});
