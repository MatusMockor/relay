import { convert } from 'html-to-text';

export const htmlBodyToText = (html: string): string =>
  convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'script', format: 'skip' },
    ],
  }).trim();
