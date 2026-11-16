export const CALENDAR_COLORS = [
  '#4b5fa8',
  '#3f7d6a',
  '#9a6a36',
  '#8a4f7d',
  '#5b4f9a',
  '#2f6f8f',
] as const;

export const nextColor = (color: string): string => {
  const index = CALENDAR_COLORS.findIndex((candidate) => candidate === color.toLowerCase());
  return CALENDAR_COLORS[(index + 1) % CALENDAR_COLORS.length] ?? CALENDAR_COLORS[0];
};

export const normalizeFeedUrl = (input: string): string =>
  input.trim().replace(/^webcals?:\/\//i, 'https://');
