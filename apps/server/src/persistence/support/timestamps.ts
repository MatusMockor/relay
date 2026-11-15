export const toIso = (date: Date): string => date.toISOString();

export const toIsoOrNull = (date: Date | null): string | null => {
  if (date === null) {
    return null;
  }
  return date.toISOString();
};

export const toDate = (iso: string): Date => new Date(iso);

export const toDateOrNull = (iso: string | null): Date | null => {
  if (iso === null) {
    return null;
  }
  return new Date(iso);
};
