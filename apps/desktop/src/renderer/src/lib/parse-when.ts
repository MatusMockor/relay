import { dayDiff } from './dates';
import { foldText } from './text';

const WEEKDAY_STEMS: readonly (readonly [string, number])[] = [
  ['nedel', 0],
  ['pondel', 1],
  ['utor', 2],
  ['stred', 3],
  ['stvrt', 4],
  ['piat', 5],
  ['sobot', 6],
];
const DAY_PARTS: readonly (readonly [string, number])[] = [
  ['dopoludnia', 10],
  ['napoludnie', 12],
  ['poobede', 14],
  ['popoludni', 14],
  ['rano', 8],
  ['obed', 12],
  ['vecer', 18],
];
const RELATIVE_DAYS: readonly (readonly [RegExp, number])[] = [
  [/\bpozajtra\b/, 2],
  [/\bzajtra\b/, 1],
  [/\bdnes\b/, 0],
];

const parseRelative = (text: string, now: Date): Date | null | undefined => {
  const match = /^(?:o|za) (?:(pol) hodiny|(hodinu)|(\d+) ?(h|hod\w*|m|min\w*))$/.exec(text);
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[3] ?? 0);
  const minutes =
    match[1] !== undefined
      ? 30
      : match[2] !== undefined
        ? 60
        : /^m/.test(match[4] ?? '')
          ? amount
          : amount * 60;
  return minutes > 0 ? new Date(now.getTime() + minutes * 60_000) : null;
};

const dayOffsetOf = (text: string, now: Date): number | null => {
  const relative = RELATIVE_DAYS.find(([pattern]) => pattern.test(text));
  if (relative !== undefined) {
    return relative[1];
  }
  const weekday = WEEKDAY_STEMS.find(([stem]) => text.includes(stem));
  if (weekday !== undefined) {
    return (weekday[1] - now.getDay() + 7) % 7 || 7;
  }
  return /buduci tyzd|o tyzden/.test(text) ? 7 : null;
};

const hourOf = (text: string): { hours: number | null; minutes: number } => {
  const clock = /(\d{1,2})[:.](\d{2})(?!\.)/.exec(text);
  if (clock !== null) {
    return { hours: Number(clock[1]), minutes: Number(clock[2]) };
  }
  const bare = /(?:^|\s)o (\d{1,2})(?: ?h| hod)?$/.exec(text) ?? /^(\d{1,2}) ?h$/.exec(text);
  if (bare !== null) {
    return { hours: Number(bare[1]), minutes: 0 };
  }
  const part = DAY_PARTS.find(([word]) => text.includes(word));
  return { hours: part === undefined ? null : part[1], minutes: 0 };
};

export const parseWhen = (input: string, now: Date): Date | null => {
  const text = foldText(input).replace(/\s+/g, ' ').trim();
  if (text === '') {
    return null;
  }
  const relative = parseRelative(text, now);
  if (relative !== undefined) {
    return relative;
  }
  const offset = dayOffsetOf(text, now);
  const date = /\b(\d{1,2})\. ?(\d{1,2})\.(?!\d)/.exec(text);
  const { hours, minutes } = hourOf(text);
  if (offset === null && date === null && hours === null) {
    return null;
  }
  if (hours !== null && (hours > 23 || minutes > 59)) {
    return null;
  }
  const result = new Date(now);
  if (date !== null) {
    const month = Number(date[2]) - 1;
    const day = Number(date[1]);
    result.setFullYear(now.getFullYear(), month, day);
    if (dayDiff(result, now) < 0) {
      result.setFullYear(now.getFullYear() + 1, month, day);
    }
    if (result.getMonth() !== month || result.getDate() !== day) {
      return null;
    }
  }
  if (date === null) {
    result.setDate(result.getDate() + (offset ?? 0));
  }
  result.setHours(hours ?? 8, minutes, 0, 0);
  if (offset === null && date === null && result <= now) {
    result.setDate(result.getDate() + 1);
  }
  return result > now ? result : null;
};
