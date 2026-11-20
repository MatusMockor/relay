import type { AutomationAction, AutomationCondition, AutomationConditionType } from '@relay/shared';

export interface RuleTemplate {
  readonly id: 'jira' | 'newsletter' | 'sender' | 'attachments' | 'blank';
  readonly title: string;
  readonly description: string;
  readonly name: string;
  readonly conditions: AutomationCondition[];
  readonly actions: AutomationAction[];
  readonly needs: AutomationConditionType | null;
}

export const RULE_TEMPLATES: readonly RuleTemplate[] = [
  {
    id: 'jira',
    title: 'Úlohy z Jiry',
    description: 'Keď ťa v Jire priradia k úlohe, vytvorí úlohu.',
    name: 'Úlohy z Jiry',
    conditions: [
      { type: 'jira', projectKeys: [] },
      { type: 'jiraEvent', kind: 'assigned' },
    ],
    actions: [{ type: 'task' }],
    needs: null,
  },
  {
    id: 'newsletter',
    title: 'Upratať newslettre',
    description: 'Maily z vybranej domény označí ako prečítané a archivuje.',
    name: 'Newslettre',
    conditions: [],
    actions: [{ type: 'markRead' }, { type: 'archive' }],
    needs: 'fromDomain',
  },
  {
    id: 'sender',
    title: 'Dôležitý odosielateľ',
    description: 'Maily od konkrétnej osoby pripne a pošle notifikáciu.',
    name: 'Dôležitý odosielateľ',
    conditions: [],
    actions: [{ type: 'pin' }, { type: 'notify' }],
    needs: 'fromAddress',
  },
  {
    id: 'attachments',
    title: 'Faktúry s prílohou',
    description: 'Maily s prílohou a slovom faktúra v predmete pripne, aby ti neušli.',
    name: 'Faktúry',
    conditions: [{ type: 'subjectContains', value: 'faktúra' }, { type: 'hasAttachment' }],
    actions: [{ type: 'pin' }],
    needs: null,
  },
  {
    id: 'blank',
    title: 'Prázdne pravidlo',
    description: 'Podmienky aj akcie si nastavíš sám.',
    name: 'Nové pravidlo',
    conditions: [],
    actions: [{ type: 'task' }],
    needs: null,
  },
];
