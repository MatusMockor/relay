import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { htmlToText } from '../src/presenters/html-to-text';
import { threadDetailView } from '../src/presenters/views';
import { message, thread } from './support/fixtures';

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function bodiesOf(overrides: Record<string, unknown>): string[] {
  const view = threadDetailView({
    thread: thread('thr_1'),
    messages: [message('msg_1', 'thr_1', overrides)],
    aiSummary: null,
    checklist: [],
    replySuggestions: [],
  });
  return view.messages.map((item) => item.body);
}

describe('mail presenters', () => {
  it('decodes numeric character references in HTML-only messages', () => {
    expect(
      bodiesOf({ textBody: null, htmlBody: '<p>Pay &#8364;100 &#x20AC;5 &amp; co</p>' }),
    ).toEqual(['Pay €100 €5 & co']);
    expect(htmlToText('&#0; &#xD800; &unknown; &#39;')).toBe("� � &unknown; '");
  });

  it('falls back to the HTML body and then the snippet when a body is blank', () => {
    expect(bodiesOf({ textBody: ' \n', htmlBody: '<p>Faktúra</p>' })).toEqual(['Faktúra']);
    expect(bodiesOf({ textBody: '', htmlBody: '<div> </div>', snippet: 'Úryvok' })).toEqual([
      'Úryvok',
    ]);
  });

  it('converts malformed HTML from a hostile sender in linear time', () => {
    expect(elapsedMs(() => htmlToText('<script'.repeat(40_000)))).toBeLessThan(300);
    expect(elapsedMs(() => htmlToText('<a'.repeat(100_000)))).toBeLessThan(300);
    expect(htmlToText('<p>Ahoj</p><style>zvyšok')).toBe('Ahoj\nzvyšok');
  });
});
