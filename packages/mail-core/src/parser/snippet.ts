import { convert } from 'html-to-text';
import { looksLikeHtml } from './looks-like-html';

export const SNIPPET_LENGTH = 160;

const QUOTE_HEADER =
  /^(on .+ wrote:|dňa .+ napísal.*:|dne .+ napsal.*:|-----original message-----)$/i;

export const htmlToText = (html: string): string =>
  convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: '.gmail_quote', format: 'skip' },
      { selector: 'blockquote[type="cite"]', format: 'skip' },
      { selector: '#divRplyFwdMsg', format: 'skip' },
      { selector: 'blockquote', format: 'block' },
    ],
  });

const withoutQuotes = (text: string): string[] => {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '--' || QUOTE_HEADER.test(trimmed)) {
      return lines;
    }
    if (!trimmed.startsWith('>')) {
      lines.push(trimmed);
    }
  }
  return lines;
};

export const truncate = (text: string, length: number): string => {
  if (text.length <= length) {
    return text;
  }
  const cut = text.slice(0, length - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
};

const isFilled = (value: string | null): value is string => value !== null && value.trim() !== '';

const snippetSource = (text: string | null, html: string | null): string => {
  if (isFilled(text) && !looksLikeHtml(text)) {
    return text;
  }
  if (isFilled(html)) {
    return htmlToText(html);
  }
  if (isFilled(text)) {
    return htmlToText(text);
  }
  return '';
};

export const buildSnippet = (text: string | null, html: string | null): string => {
  const source = snippetSource(text, html);
  const clean = withoutQuotes(source).join(' ').replace(/\s+/g, ' ').trim();
  return truncate(clean, SNIPPET_LENGTH);
};
