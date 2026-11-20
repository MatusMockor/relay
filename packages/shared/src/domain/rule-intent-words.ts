import type { AutomationActionType } from './automation-action';

const END = String.raw`(?![\p{L}\p{N}])`;

const ACTION_STEMS: readonly (readonly [AutomationActionType, string])[] = [
  ['archive', 'archiv'],
  ['moveTo', 'presun|presu|move|priecin|folder'],
  ['markRead', `precitan|read${END}`],
  ['pin', `pripn|pripin|pins?${END}|pinn|flag`],
  ['addLabel', 'stit|label|tag'],
  ['remind', 'pripomen|pripomin|remind|snooze'],
  ['notify', 'notifik|upozorn|oznamen|notif|alert'],
  ['task', 'uloh|task|todo'],
  ['summary', 'zhrn|sumar|summar'],
  ['draftReply', 'odpoved|odpis|reply|replies|respond'],
  ['forward', 'preposl|preposiel|presmer|forward'],
];

export const ACTION_WORDS: readonly (readonly [AutomationActionType, RegExp])[] = ACTION_STEMS.map(
  ([type, stem]) => [type, new RegExp(`^(?:${stem})`, 'u')] as const,
);

const ACTION_START = ACTION_STEMS.map(([, stem]) => stem).join('|');

export const NAMING_ACTIONS: ReadonlySet<AutomationActionType> = new Set(['addLabel', 'moveTo']);

export const NEGATIONS: ReadonlySet<string> = new Set([
  'nie',
  'ne',
  'nikdy',
  'not',
  'never',
  'dont',
  "don't",
  'bez',
  'without',
  'no',
]);

export const SEQUENCE_JOINTS: ReadonlySet<string> = new Set(['then', 'potom', 'tak']);

export const CONJUNCTIONS: ReadonlySet<string> = new Set(['a', 'and', 'plus']);

export const JOINT_REACH = 3;

export const DESTINATION_INTROS: ReadonlySet<string> = new Set(['to', 'na', 'on', 'at', 'komu']);

export const NAME_FILLERS: ReadonlySet<string> = new Set([
  'to',
  'do',
  'into',
  'in',
  'it',
  'ho',
  'ich',
  'the',
  'a',
  'an',
  'as',
  'ako',
  'na',
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

const PATH = String.raw`\S+(?:\s*\/\s*\S+)*`;

const VALUE_END = String.raw`\s*[,;]|\s*[.!?](?:\s|$)|\s+(?:then|potom|tak)\b|\s+(?:a|and|plus)\s+(?:\S+\s+){0,2}(?:${ACTION_START})|$`;

export const CONDITION_PHRASES: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:z|zo|v|vo)\s+priecink\p{L}*\s+${PATH}`, 'gu'),
  new RegExp(String.raw`\b(?:in|from)\s+(?:the\s+)?(?:folder|mailbox)\s+${PATH}`, 'gu'),
  /\b(?:sent|addressed|delivered)\s+to\s+\S+/gu,
  /\breceived\s+(?:at|by)\s+\S+/gu,
  /\b(?:adresovan|poslan|dorucen)\p{L}*\s+(?:na|pre)\s+\S+/gu,
  /\bb?cc(?:'?d|ed)?\s+(?:to\s+|na\s+)?\S+/gu,
  /\b(?:v|vo|in|s|so)\s+(?:kopii|kopiou|b?cc|copy)\s+(?:na\s+|to\s+)?\S+/gu,
  /\bpre\s+§\d+§/gu,
  /\b(?:s|so|bez)\s+prilo\p{L}*/gu,
  /\b(?:with|without)\s+(?:an?\s+|any\s+)?attachments?\b/gu,
  /\bz\s+domeny\s+\S+/gu,
  /\bfrom\s+(?:the\s+)?domain\s+\S+/gu,
  new RegExp(
    String.raw`\b(?:predmet\p{L}*|subject)\s+(?:obsahuje\s+|contains\s+|containing\s+|with\s+|je\s+|is\s+)?(?:§q\d+§|[^\s,;][^,;]*?(?=${VALUE_END}))`,
    'gu',
  ),
  /\b(?:od|from)\s+\S+/gu,
];
