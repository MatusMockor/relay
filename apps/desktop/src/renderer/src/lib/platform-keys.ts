const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const IS_MAC = /Mac|iPhone|iPad/i.test(agent);
export const MOD = IS_MAC ? '⌘' : 'Ctrl+';
export const ALT = IS_MAC ? '⌥' : 'Alt+';
