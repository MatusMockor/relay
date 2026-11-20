import type { AutomationActionType } from './automation-action';

export const ACTION_WORDS: readonly (readonly [AutomationActionType, RegExp])[] = [
  ['archive', /^archiv/u],
  ['moveTo', /^(presun|presu|move|priecin|folder)/u],
  ['markRead', /^(precitan|read$)/u],
  ['pin', /^(pripn|pripin|pin$|pins$|pinn|flag)/u],
  ['addLabel', /^(stit|label|tag)/u],
  ['remind', /^(pripomen|pripomin|remind|snooze)/u],
  ['notify', /^(notifik|upozorn|oznamen|notif|alert)/u],
  ['task', /^(uloh|task|todo)/u],
  ['summary', /^(zhrn|sumar|summar)/u],
  ['draftReply', /^(odpoved|odpis|reply|respond|koncept|draft)/u],
  ['forward', /^(preposl|preposiel|presmer|forward)/u],
];

export const NEGATIONS: ReadonlySet<string> = new Set([
  'nie',
  'ne',
  'nikdy',
  'bez',
  'not',
  'no',
  'never',
  'dont',
  "don't",
  'without',
]);

export const UNCERTAIN: ReadonlySet<string> = new Set([
  'mozno',
  'asi',
  'hadam',
  'neviem',
  'maybe',
  'perhaps',
  'possibly',
  'probably',
  'might',
]);

export const SENDER_WORDS: ReadonlySet<string> = new Set(['od', 'from', 'z', 'zo', 'sender']);

export const CONDITION_PHRASES: readonly RegExp[] = [
  /\bz\s+domeny\s+\S+/gu,
  /\bfrom\s+(?:the\s+)?domain\s+\S+/gu,
  /\b(?:predmet\p{L}*|subject)\s+(?:obsahuje\s+|contains\s+|containing\s+|with\s+|je\s+|is\s+)?\S+/gu,
  /\b(?:od|from)\s+\S+/gu,
];

export const NEGATION_WINDOW = 3;
