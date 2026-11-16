export class CalendarFeedError extends Error {
  override readonly name = 'CalendarFeedError';
}

export const FEED_MESSAGES = {
  insecure: 'Adresa kalendára musí používať https.',
  invalidUrl: 'Adresa kalendára nie je platná.',
  privateNetwork: 'Adresa kalendára smeruje do súkromnej siete.',
  unresolved: 'Server kalendára sa nepodarilo nájsť.',
  timeout: 'Server kalendára neodpovedal včas.',
  tooLarge: 'Kalendár je príliš veľký.',
  tooManyRedirects: 'Server kalendára presmerúva príliš veľakrát.',
  network: 'Server kalendára nie je dostupný.',
  status: (status: number) => `Server kalendára vrátil stav ${String(status)}.`,
} as const;
