import { describe, expect, it } from 'vitest';
import { renderThread } from '../src/prompts/thread-renderer';
import { threadFixture } from './support/thread-fixture';

function withBodies(textBody: string | null, htmlBody: string | null, snippet = 'Úryvok') {
  const detail = threadFixture();
  return {
    ...detail,
    messages: detail.messages.map((message) => ({ ...message, textBody, htmlBody, snippet })),
  };
}

describe('renderThread', () => {
  it('falls back to the HTML body when the text body is blank', () => {
    const rendered = renderThread(withBodies('  \n ', '<p>Pay &#8364;100 by Friday</p>'));

    expect(rendered).toContain('subject: Cenová ponuka\n\nPay €100 by Friday');
  });

  it('falls back to the snippet when both bodies are blank', () => {
    const rendered = renderThread(withBodies('', '<div> </div>', 'Pošlite ponuku'));

    expect(rendered.endsWith('\n\nPošlite ponuku')).toBe(true);
  });
});
