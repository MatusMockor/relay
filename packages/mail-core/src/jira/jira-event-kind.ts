import type { JiraEventKind } from '@relay/engine';
import { foldText } from './text-normalize';

const EVENT_PATTERNS: readonly (readonly [JiraEventKind, readonly RegExp[]])[] = [
  [
    'mention',
    [
      /\bmentioned you\b/,
      /\bspomenul[aoi]? (vas|ta|teba)\b/,
      /\b(vas|ta|teba) spomenul/,
      /\bzminil[aoi]? (vas|te|tebe)\b/,
      /\b(vas|te) zminil/,
    ],
  ],
  [
    'assigned',
    [/\bassigned\b/, /\bpriradil/, /\bpridelil/, /\bpriraden/, /\bpridelen/, /\bassigned to you\b/],
  ],
  [
    'status',
    [
      /\bchanged the status\b/,
      /\bchanged status\b/,
      /\bstatus changed\b/,
      /\btransitioned\b/,
      /\bzmenil[aoi]? (stav|status)\b/,
      /\bzmena (stavu|statusu)\b/,
    ],
  ],
  [
    'comment',
    [
      /\bcommented\b/,
      /\badded a comment\b/,
      /\bnew comment\b/,
      /\bokomentoval/,
      /\bkomentoval/,
      /\bpridal[aoi]? komentar/,
      /\bnovy komentar\b/,
    ],
  ],
];

const BODY_HEAD_LENGTH = 400;

const kindIn = (text: string): JiraEventKind | null => {
  const folded = foldText(text);
  const match = EVENT_PATTERNS.find(([, patterns]) =>
    patterns.some((pattern) => pattern.test(folded)),
  );
  return match ? match[0] : null;
};

export const detectJiraEventKind = (subject: string, bodyText: string): JiraEventKind =>
  kindIn(subject) ?? kindIn(bodyText.slice(0, BODY_HEAD_LENGTH)) ?? 'other';
