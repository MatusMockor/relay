import { decodeHtmlEntities } from './html-entities';

const HIDDEN_BLOCK_OPEN = /<(script|style|head)\b/gi;

export function htmlToText(html: string): string {
  const markup = stripHiddenBlocks(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
  return decodeHtmlEntities(stripTags(markup))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHiddenBlocks(html: string): string {
  const open = new RegExp(HIDDEN_BLOCK_OPEN.source, HIDDEN_BLOCK_OPEN.flags);
  const unclosed = new Set<string>();
  const kept: string[] = [];
  let cursor = 0;
  for (;;) {
    const match = open.exec(html);
    if (match === null) {
      break;
    }
    const name = (match[1] ?? '').toLowerCase();
    if (unclosed.has(name)) {
      continue;
    }
    const close = new RegExp(`</${name}>`, 'gi');
    close.lastIndex = open.lastIndex;
    if (close.exec(html) === null) {
      unclosed.add(name);
      continue;
    }
    kept.push(html.slice(cursor, match.index));
    cursor = close.lastIndex;
    open.lastIndex = cursor;
  }
  kept.push(html.slice(cursor));
  return kept.join('');
}

function stripTags(html: string): string {
  const kept: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = html.indexOf('<', cursor);
    const end = start < 0 ? -1 : html.indexOf('>', start + 1);
    if (end < 0) {
      break;
    }
    kept.push(html.slice(cursor, end === start + 1 ? end : start));
    cursor = end === start + 1 ? end : end + 1;
  }
  kept.push(html.slice(cursor));
  return kept.join('');
}
