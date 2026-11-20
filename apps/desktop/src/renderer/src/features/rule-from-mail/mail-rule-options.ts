import type { Address, AutomationCondition } from '@relay/shared';
import { subjectCore } from './subject-core';

export type MailRuleOptionId = 'newsletter' | 'sender' | 'domain' | 'subject';

export interface MailRuleSource {
  readonly from: Address;
  readonly subject: string;
  readonly newsletter: boolean;
}

export interface MailRuleOption {
  readonly id: MailRuleOptionId;
  readonly label: string;
  readonly name: string;
  readonly conditions: readonly AutomationCondition[];
}

export const NEWSLETTER_CONDITION: AutomationCondition = {
  type: 'header',
  name: 'List-Unsubscribe',
  pattern: '.+',
};

const senderName = (from: Address): string => {
  const name = from.name?.trim() ?? '';
  return name === '' ? from.email : name;
};

const domainOf = (email: string): string => email.split('@')[1]?.toLowerCase() ?? '';

const newsletterOption = (from: Address): MailRuleOption => ({
  id: 'newsletter',
  label: `Je to newsletter ${senderName(from)}`,
  name: `Newsletter ${senderName(from)}`,
  conditions: [NEWSLETTER_CONDITION, { type: 'fromAddress', address: from.email }],
});

const domainOptions = (domain: string): MailRuleOption[] =>
  domain === ''
    ? []
    : [
        {
          id: 'domain',
          label: `Z domény ${domain}`,
          name: domain,
          conditions: [{ type: 'fromDomain', domain }],
        },
      ];

const subjectOptions = (core: string): MailRuleOption[] =>
  core === ''
    ? []
    : [
        {
          id: 'subject',
          label: `Predmet obsahuje „${core}“`,
          name: core,
          conditions: [{ type: 'subjectContains', value: core }],
        },
      ];

export const mailRuleOptions = (source: MailRuleSource): MailRuleOption[] => [
  ...(source.newsletter ? [newsletterOption(source.from)] : []),
  {
    id: 'sender',
    label: `Od ${source.from.email}`,
    name: senderName(source.from),
    conditions: [{ type: 'fromAddress', address: source.from.email }],
  },
  ...domainOptions(domainOf(source.from.email)),
  ...subjectOptions(subjectCore(source.subject)),
];

export const defaultSelection = (options: readonly MailRuleOption[]): MailRuleOptionId[] =>
  options.slice(0, 1).map((option) => option.id);
