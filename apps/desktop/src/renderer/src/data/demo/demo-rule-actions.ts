import { MAX_REMIND_DAYS, MIN_REMIND_DAYS, type ProposedAction } from '@relay/shared';
import { plural } from '../../lib/text';

export interface ParsedActions {
  readonly actions: ProposedAction[];
  readonly phrases: string[];
  readonly unmapped: string[];
}

const TARGET = String.raw`(?:„([^“”"]+)[“”"]|"([^"]+)"|([^\s,]+))`;
const LABEL = new RegExp(String.raw`[sš]t[ií]t(?:ok|k\p{L}*)\s+${TARGET}`, 'iu');
const MOVE = new RegExp(String.raw`presu[nň](?:\s+ho)?\s+do\s+(?:prie[cč]inka\s+)?${TARGET}`, 'iu');
const REMIND = /pripome[nň]\s+(?:o|po|za)\s+(\d+)\s+d/iu;

const SIMPLE: readonly {
  readonly pattern: RegExp;
  readonly action: ProposedAction;
  readonly phrase: string;
}[] = [
  {
    pattern: /ozna[cč]\s+ako\s+pre[cč][ií]tan/iu,
    action: { type: 'markRead' },
    phrase: 'označiť ako prečítané',
  },
  { pattern: /pripni/iu, action: { type: 'pin' }, phrase: 'pripnúť' },
  { pattern: /archivuj/iu, action: { type: 'archive' }, phrase: 'archivovať' },
];

const targetOf = (match: RegExpMatchArray | null): string | null => {
  if (match === null) {
    return null;
  }
  const value = (match[1] ?? match[2] ?? match[3] ?? '').replace(/[.!?]+$/u, '').trim();
  return value === '' ? null : value;
};

export const parseActions = (text: string): ParsedActions => {
  const actions: ProposedAction[] = [];
  const phrases: string[] = [];
  const unmapped: string[] = [];
  const label = targetOf(text.match(LABEL));
  if (label !== null) {
    actions.push({ type: 'addLabel', label });
    phrases.push(`pridať štítok ${label}`);
  }
  const folder = targetOf(text.match(MOVE));
  if (folder !== null) {
    actions.push({ type: 'moveTo', folder });
    phrases.push(`presunúť do ${folder}`);
  }
  const days = text.match(REMIND)?.[1];
  if (days !== undefined) {
    const afterDays = Number(days);
    const fits = afterDays >= MIN_REMIND_DAYS && afterDays <= MAX_REMIND_DAYS;
    if (fits) {
      actions.push({ type: 'remind', afterDays });
      phrases.push(`pripomenúť o ${days} ${plural(afterDays, 'deň', 'dni', 'dní')}`);
    }
    if (!fits) {
      unmapped.push(`pripomenutie o ${days} dní (najviac ${String(MAX_REMIND_DAYS)})`);
    }
  }
  SIMPLE.filter((item) => item.pattern.test(text)).forEach((item) => {
    actions.push(item.action);
    phrases.push(item.phrase);
  });
  return { actions, phrases, unmapped };
};
