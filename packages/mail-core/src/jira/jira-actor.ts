import type { Address } from '@relay/shared/domain';
import { detectJiraEventKind } from './jira-event-kind';

const NAME = String.raw`\p{Lu}[\p{L}'’.-]*(?:[ \t]+\p{Lu}[\p{L}'’.-]*){0,3}`;
const OBJECT = String.raw`(?:vás|vas|vám|vam|ťa|ta|teba|ti|te|tě|tebe)`;
const ENGLISH_VERBS = [
  'mentioned',
  'assigned',
  'changed',
  'commented',
  'created',
  'updated',
  'resolved',
  'transitioned',
  'reopened',
  'closed',
  'edited',
  'added',
  'made',
  'deleted',
  'attached',
  'logged',
  'moved',
  'shared',
  'replied',
  'reacted',
  'linked',
  'removed',
];
const SLAVIC_STEMS = [
  'spomenul',
  'zmienil',
  'zmínil',
  'priradil',
  'pridelil',
  'přiřadil',
  'přidělil',
  'zmenil',
  'změnil',
  'okomentoval',
  'komentoval',
  'pridal',
  'přidal',
  'vytvoril',
  'vytvořil',
  'aktualizoval',
  'upravil',
  'vyriešil',
  'vyřešil',
  'uzavrel',
  'uzavřel',
  'presunul',
  'přesunul',
  'odstránil',
  'odstranil',
  'zdieľal',
  'sdílel',
];
const ACTION = `(?:${ENGLISH_VERBS.join('|')}|(?:${SLAVIC_STEMS.join('|')})\\p{L}{0,3})(?!\\p{L})`;
const ACTOR_PHRASE = new RegExp(`^(${NAME})[ \\t]+(?:${OBJECT}[ \\t]+)?${ACTION}`, 'u');
const SUBJECT_PREFIX =
  /^\s*(?:(?:re|fw|fwd)\s*:\s*)*(?:\[jira\]\s*)?(?:\([A-Z][A-Z0-9_]+-\d+\)\s*)?/i;
const SENDER_SUFFIX = /^(.*?)\s*\((?:jira|jira software|atlassian)\)\s*$/i;
const NOT_A_PERSON = new Set(['jira', 'atlassian', 'you', 'ty', 'vy', 're', 'fw', 'fwd']);
const BODY_LINES = 6;

const personName = (value: string | undefined): string | null => {
  const name = value?.trim() ?? '';
  if (name === '' || NOT_A_PERSON.has(name.toLowerCase())) {
    return null;
  }
  return name;
};

const actorIn = (line: string): string | null => personName(ACTOR_PHRASE.exec(line.trim())?.[1]);

const subjectActor = (subject: string): string | null => {
  if (detectJiraEventKind(subject, '') === 'other') {
    return null;
  }
  return actorIn(subject.replace(SUBJECT_PREFIX, ''));
};

const bodyLines = (body: string): string[] =>
  body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, BODY_LINES);

const senderActor = (from: Address | null): string | null =>
  personName(SENDER_SUFFIX.exec(from?.name ?? '')?.[1]);

export const extractJiraActor = (
  subject: string,
  body: string,
  from: Address | null,
): string | null => {
  for (const line of bodyLines(body)) {
    const actor = actorIn(line);
    if (actor !== null) {
      return actor;
    }
  }
  return subjectActor(subject) ?? senderActor(from);
};
