export const TRACE_HEADERS: readonly string[] = [
  'received',
  'x-received',
  'dkim-signature',
  'x-google-dkim-signature',
  'arc-seal',
  'arc-message-signature',
  'arc-authentication-results',
  'authentication-results',
  'received-spf',
  'x-google-smtp-source',
  'x-gm-message-state',
];

const TRACE = new Set(TRACE_HEADERS);

export const isTraceHeader = (name: string): boolean => TRACE.has(name.trim().toLowerCase());
