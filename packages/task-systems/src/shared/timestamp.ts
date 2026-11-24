export const isoTimestampOf = (value: string | null | undefined): string => {
  const instant = Date.parse(value ?? '');
  return new Date(Number.isNaN(instant) ? 0 : instant).toISOString();
};
