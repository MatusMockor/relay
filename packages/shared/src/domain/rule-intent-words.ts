import type { AutomationActionType } from './automation-action';

export const FORWARD_WORDS = /^(preposl|preposiel|presmer|forward)/u;

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
  ['forward', FORWARD_WORDS],
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

export const NEGATION_ENDS: ReadonlySet<string> = new Set(['then', 'potom']);

export const NAME_ENDS: ReadonlySet<string> = new Set(['a', 'and', 'then', 'potom']);

export const PHRASE_ENDS: ReadonlySet<string> = new Set(['a', 'and', 'then', 'potom']);

export const DESTINATION_INTROS: ReadonlySet<string> = new Set(['to', 'na', 'on', 'at', 'komu']);

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

const PATH = String.raw`\S+(?:\s*\/\s*\S+)*`;

export const CONDITION_PHRASES: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:z|zo|v|vo)\s+priecink\p{L}*\s+${PATH}`, 'gu'),
  new RegExp(String.raw`\b(?:in|from)\s+(?:the\s+)?(?:folder|mailbox)\s+${PATH}`, 'gu'),
  /\b(?:sent|addressed|delivered)\s+to\s+\S+/gu,
  /\breceived\s+(?:at|by)\s+\S+/gu,
  /\b(?:adresovan|poslan|dorucen)\p{L}*\s+(?:na|pre)\s+\S+/gu,
  /\bpre\s+§\d+§/gu,
  /\bz\s+domeny\s+\S+/gu,
  /\bfrom\s+(?:the\s+)?domain\s+\S+/gu,
  new RegExp(
    String.raw`\b(?:predmet\p{L}*|subject)\s+(?:obsahuje\s+|contains\s+|containing\s+|with\s+|je\s+|is\s+)?(?:§q\d+§|(?:[^,;!?.]|[.!?](?!\s|$))+)`,
    'gu',
  ),
  /\b(?:od|from)\s+\S+/gu,
];
