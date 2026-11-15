import { foldText } from '../../lib/text';

const sentences = (text: string): string[] =>
  text
    .replace(/\n+/g, ' ')
    .trim()
    .split(/(?<=[.?!])\s+/)
    .filter((part) => part.length > 0);

const shorter = (text: string): string => {
  const parts = sentences(text);
  if (parts.length > 2) {
    return parts.slice(0, 2).join(' ');
  }
  return parts[0] ?? text;
};

const FORMAL_SWAPS: readonly (readonly [string, string])[] = [
  ['vieš', 'viete'],
  ['môžeš', 'môžete'],
  ['pošli', 'pošlite'],
  ['máš', 'máte'],
  ['chceš', 'chcete'],
  ['ti', 'vám'],
  ['teba', 'vás'],
  ['Vďaka', 'Ďakujem'],
];

const formal = (text: string): string => {
  const body = FORMAL_SWAPS.reduce(
    (current, [from, to]) => current.replace(new RegExp(`(?<!\\p{L})${from}(?!\\p{L})`, 'gu'), to),
    text.replace(/^(Ahoj(te)?|Čau)(\s+[\p{Lu}][\p{L}]*)?,?\s*/u, ''),
  );
  return `Dobrý deň,\n\n${body.charAt(0).toLocaleUpperCase('sk')}${body.slice(1).trim()}\n\nS pozdravom`;
};

const withDeadline = (text: string): string => {
  const line = 'Hotové to bude najneskôr v piatok do 12:00.';
  return text.includes(line) ? text : `${text.trimEnd()} ${line}`;
};

const polish = (text: string): string => {
  const body = /^(Ahoj|Dobrý deň|Čau)/.test(text)
    ? text
    : `Ahoj, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  return /(Vďaka|Ďakujem|S pozdravom)[!.]?$/.test(body.trim()) ? body : `${body.trim()}\n\nVďaka`;
};

export const demoRewrite = (text: string, instruction: string): string => {
  const hint = foldText(instruction);
  if (/krat|struc|skrat|menej/.test(hint)) {
    return shorter(text);
  }
  if (/formal|zdvoril|slusn|vyk/.test(hint)) {
    return formal(text);
  }
  if (/termin|deadline|datum|kedy/.test(hint)) {
    return withDeadline(text);
  }
  return polish(text);
};

export const demoCompose = (instruction: string, recipientName: string | null): string => {
  const hello = recipientName === null ? 'Ahoj,' : `Ahoj ${recipientName.split(' ')[0] ?? ''},`;
  const hint = foldText(instruction);
  if (/termin|stretn|sadn|call|meet/.test(hint)) {
    return `${hello}\n\npoďme si na to sadnúť na pol hodinu. Hodí sa ti zajtra o 10:00 alebo o 14:00? Pozvánku pošlem hneď, ako potvrdíš.\n\nVďaka`;
  }
  if (/podakuj|vdak|dakuj/.test(hint)) {
    return `${hello}\n\nvďaka za pomoc, veľmi to pomohlo. Ak budeš niečo potrebovať ty, ozvi sa.\n\nVďaka`;
  }
  if (/ospravedl|meska|neskor|nestihn/.test(hint)) {
    return `${hello}\n\nprepáč, dnes to nestihnem. Pošlem ti to zajtra do obeda.\n\nVďaka`;
  }
  const body =
    instruction.trim() === ''
      ? 'píšem ohľadom našej dohody. Daj mi prosím vedieť, ako to vidíš.'
      : instruction.trim();
  return `${hello}\n\n${body}${/[.?!]$/.test(body) ? '' : '.'}\n\nVďaka`;
};
