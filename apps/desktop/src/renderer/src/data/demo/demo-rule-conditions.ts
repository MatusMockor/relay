import { type AutomationCondition, EmailAddressSchema } from '@relay/shared';

export interface ParsedConditions {
  readonly conditions: AutomationCondition[];
  readonly phrases: string[];
  readonly unmapped: string[];
}

const QUOTED_OR_WORD = String.raw`(?:„([^“”"]+)[“”"]|"([^"]+)"|([^\s,]+))`;
const DOMAIN_LIKE = /^@?[\p{L}\d-]+(\.[\p{L}\d-]+)+$/u;
const DOMAIN = /z\s+dom[eé]ny\s+@?([\p{L}\d.-]+\.[\p{L}]{2,})/giu;
const FROM = /(?:^|\s)od\s+([^\s,]+)/giu;
const SUBJECT = new RegExp(String.raw`predmet\p{L}*\s+(?:obsahuje\s+)?${QUOTED_OR_WORD}`, 'giu');
const ATTACHMENT = /pr[ií]loh/iu;

const trimEnd = (value: string): string => value.replace(/[.!?]+$/u, '');

const captured = (match: RegExpMatchArray): string =>
  trimEnd(match[1] ?? match[2] ?? match[3] ?? '').trim();

interface Sender {
  readonly condition: AutomationCondition;
  readonly phrase: string;
}

const senderOf = (token: string): Sender | null => {
  const value = token.replace(/^@/u, '').toLowerCase();
  if (EmailAddressSchema.safeParse(token).success) {
    return { condition: { type: 'fromAddress', address: value }, phrase: `od ${value}` };
  }
  if (DOMAIN_LIKE.test(token)) {
    return { condition: { type: 'fromDomain', domain: value }, phrase: `z domény ${value}` };
  }
  return null;
};

export const parseConditions = (text: string): ParsedConditions => {
  const conditions: AutomationCondition[] = [];
  const phrases: string[] = [];
  const unmapped: string[] = [];
  const withoutDomains = text.replace(DOMAIN, (_whole, domain: string) => {
    const value = trimEnd(domain).toLowerCase();
    conditions.push({ type: 'fromDomain', domain: value });
    phrases.push(`z domény ${value}`);
    return ' ';
  });
  for (const match of withoutDomains.matchAll(FROM)) {
    const token = trimEnd(match[1] ?? '');
    const sender = senderOf(token);
    if (sender === null) {
      unmapped.push(`od ${token}`);
      continue;
    }
    conditions.push(sender.condition);
    phrases.push(sender.phrase);
  }
  for (const match of text.matchAll(SUBJECT)) {
    const value = captured(match);
    if (value !== '') {
      conditions.push({ type: 'subjectContains', value });
      phrases.push(`predmet obsahuje „${value}“`);
    }
  }
  if (ATTACHMENT.test(text)) {
    conditions.push({ type: 'hasAttachment' });
    phrases.push('s prílohou');
  }
  return { conditions, phrases, unmapped };
};
