export const toTimestamp = (iso: string): number => Date.parse(iso);

export const normalizeIso = (value: string, fallback: string): string => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return new Date(Date.parse(fallback)).toISOString();
  }
  return new Date(parsed).toISOString();
};

export const byDateAscending = <Item extends { readonly date: string }>(a: Item, b: Item): number =>
  toTimestamp(a.date) - toTimestamp(b.date);
