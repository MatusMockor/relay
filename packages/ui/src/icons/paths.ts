export const STROKE_ICONS = {
  clip: '<path d="M13 7.5l-5.3 5.3a3.2 3.2 0 01-4.5-4.5l5.6-5.6a2.1 2.1 0 013 3l-5.6 5.6a1 1 0 01-1.5-1.5L9.9 4.6"/>',
  check: '<path d="M3 8.5l3.2 3L13 4.5"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.6"/>',
  reply: '<path d="M6.5 4L3 7.5 6.5 11"/><path d="M3.5 7.5H9a4 4 0 014 4V13"/>',
  forwardMail: '<path d="M9.5 4L13 7.5 9.5 11"/><path d="M12.5 7.5H7a4 4 0 00-4 4V13"/>',
  back: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  forward: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  up: '<path d="M4 10l4-4 4 4"/>',
  down: '<path d="M4 6l4 4 4-4"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  inbox: '<path d="M2.5 9.5h3l1 2h3l1-2h3"/><path d="M2.5 9.5L4 3.5h8l1.5 6v3h-11z"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>',
  send: '<path d="M2.5 8L13.5 2.5 10 13.5 7.5 9z"/>',
  draft: '<path d="M3 13h3l7-7-3-3-7 7z"/>',
  keyboard:
    '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5 9.5h6"/>',
  refresh: '<path d="M13 3v3.5H9.5"/><path d="M12.7 6.5A5 5 0 103 9"/>',
  pen: '<path d="M3 13l.7-2.8L11 2.9l2.1 2.1-7.3 7.3z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>',
  x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  panelLeft: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.3V11M8 5h.01"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
  sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
  columns: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/>',
  bell: '<path d="M4.5 11V7.5a3.5 3.5 0 017 0V11l1 1.5h-9z"/><path d="M6.8 14a1.3 1.3 0 002.4 0"/>',
  bolt: '<path d="M9 1.8L3.8 9h4l-1 5.2L12.2 7h-4z"/>',
  palette:
    '<path d="M8 2.5a5.5 5.5 0 100 11c.9 0 1.2-.6 1.2-1.2 0-.8-.6-1-.6-1.7 0-.6.5-1 1.1-1h1.4a2.4 2.4 0 002.4-2.4C13.5 4.6 11 2.5 8 2.5z"/><circle cx="5.3" cy="7" r=".7"/><circle cx="7.6" cy="5" r=".7"/><circle cx="10.4" cy="5.6" r=".7"/>',
  panelRight: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M10 3v10"/>',
  user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.8-2.4 2.7-3.6 5-3.6s4.2 1.2 5 3.6"/>',
  calendar:
    '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.8h11M5.5 2v2.5M10.5 2v2.5"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  server:
    '<rect x="2.5" y="2.5" width="11" height="4.5" rx="1.2"/><rect x="2.5" y="9" width="11" height="4.5" rx="1.2"/><path d="M5 4.8h.01M5 11.2h.01"/>',
  device: '<rect x="2" y="3" width="12" height="8" rx="1.3"/><path d="M5.5 13.5h5M8 11v2.5"/>',
  shield: '<path d="M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4z"/>',
  image:
    '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M13.5 11l-3.5-3.5-6 5.5"/>',
} as const;

export const FOLDER_ICONS = {
  inbox:
    '<path d="M3 13l2.5-7.5A1.5 1.5 0 0 1 6.9 4.5h10.2a1.5 1.5 0 0 1 1.4 1L21 13v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  send: '<path d="M4 12l16-7-6.5 15-2.5-6.5z"/>',
  file: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/>',
  calendar:
    '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
  pen: '<path d="M5 19l1-4L16 5l3 3L9 18z"/>',
  task: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  side: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
} as const;

export type StrokeIconName = keyof typeof STROKE_ICONS;
export type FolderIconName = keyof typeof FOLDER_ICONS;

export const SPARK_PATH = 'M8 0l1.8 5.2L15 7l-5.2 1.8L8 14l-1.8-5.2L1 7l5.2-1.8z';
