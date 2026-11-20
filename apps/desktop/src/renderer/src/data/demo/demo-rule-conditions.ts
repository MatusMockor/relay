import {
  AutomationConditionSchema,
  type AutomationCondition,
  EmailAddressSchema,
} from '@relay/shared';

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
const NO_ATTACHMENT = /bez\s+pr[ií]loh\p{L}*/giu;

const SUBJECT_NOTE_LENGTH = 60;

const trimEnd = (value: string): string => value.replace(/[.!?]+$/u, '');

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

const withoutSubjects = (text: string, found: ParsedConditions): string =>
  text.replace(SUBJECT, (_whole: string, quoted?: string, plain?: string, word?: string) => {
    const value = trimEnd(quoted ?? plain ?? word ?? '').trim();
    if (value === '') {
      return ' ';
    }
    const condition: AutomationCondition = { type: 'subjectContains', value };
    if (!AutomationConditionSchema.safeParse(condition).success) {
      found.unmapped.push(
        `predmet obsahuje „${value.slice(0, SUBJECT_NOTE_LENGTH)}…“ (príliš dlhý)`,
      );
      return ' ';
    }
    found.conditions.push(condition);
    found.phrases.push(`predmet obsahuje „${value}“`);
    return ' ';
  });

const addAttachment = (text: string, found: ParsedConditions): void => {
  const positive = text.replace(NO_ATTACHMENT, (phrase) => {
    found.unmapped.push(phrase.trim());
    return ' ';
  });
  if (!ATTACHMENT.test(positive)) {
    return;
  }
  found.conditions.push({ type: 'hasAttachment' });
  found.phrases.push('s prílohou');
};

export const parseConditions = (text: string): ParsedConditions => {
  const found: ParsedConditions = { conditions: [], phrases: [], unmapped: [] };
  const { conditions, phrases, unmapped } = found;
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
  addAttachment(withoutSubjects(text, found), found);
  return found;
};
