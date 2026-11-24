const COMPACT_OFFSET = /([+-]\d{2})(\d{2})$/;

export const jiraTimestampOf = (value: string | null | undefined): string => {
  const instant = Date.parse((value ?? '').replace(COMPACT_OFFSET, '$1:$2'));
  return new Date(Number.isNaN(instant) ? 0 : instant).toISOString();
};
