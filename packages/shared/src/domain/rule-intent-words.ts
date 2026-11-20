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
  ['draftReply', /^(odpoved|odpis|reply|replies|respond)/u],
  ['forward', /^(preposl|preposiel|presmer|forward)/u],
];

export const TARGET_WORDS = /^(stit|label|tag|priecin|folder|presun|presu|move)/u;

export const VERB_NEGATIONS: ReadonlySet<string> = new Set([
  'nie',
  'ne',
  'nikdy',
  'not',
  'never',
  'dont',
  "don't",
]);

export const NOUN_NEGATIONS: ReadonlySet<string> = new Set(['bez', 'without', 'no']);

export const ARTICLES: ReadonlySet<string> = new Set(['a', 'an', 'the', 'any']);

export const SCOPE_ENDS: ReadonlySet<string> = new Set([
  'and',
  'then',
  'also',
  'only',
  'just',
  'instead',
  'potom',
  'iba',
  'len',
  'aj',
  'tak',
]);

export const NAME_ENDS: ReadonlySet<string> = new Set([...SCOPE_ENDS, 'a']);

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

const VALUE_END = String.raw`(?=\s*[,;]|\s*[.!?](?=\s*\S)|\s+(?:a|and|then|potom|tak|aj)\b)`;

export const CONDITION_PHRASES: readonly RegExp[] = [
  /\bz\s+domeny\s+\S+/gu,
  /\bfrom\s+(?:the\s+)?domain\s+\S+/gu,
  new RegExp(
    String.raw`\b(?:predmet\p{L}*|subject)\s+(?:obsahuje\s+|contains\s+|containing\s+|with\s+|je\s+|is\s+)?(?:[^\s,;!?.][^,;!?.]*?${VALUE_END}|\S+)`,
    'gu',
  ),
  /\b(?:od|from)\s+\S+/gu,
];
