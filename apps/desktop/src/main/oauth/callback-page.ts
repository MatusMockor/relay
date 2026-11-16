const page = (title: string, body: string): string =>
  [
    '<!doctype html>',
    '<html lang="sk"><head><meta charset="utf-8"><title>Relay</title>',
    '<style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e6e8eb;display:grid;place-items:center;height:100vh;margin:0}main{text-align:center}</style>',
    `</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
  ].join('');

export const SUCCESS_PAGE = page(
  'Prihlásenie dokončené',
  'Môžeš zavrieť toto okno a vrátiť sa do aplikácie Relay.',
);

export const FAILURE_PAGE = page(
  'Prihlásenie zlyhalo',
  'Zatvor toto okno a skús to v aplikácii Relay znova.',
);
