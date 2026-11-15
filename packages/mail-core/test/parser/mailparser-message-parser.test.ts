import { describe, expect, it } from 'vitest';
import { buildSnippet, MailparserMessageParser } from '../../src';
import { parseFixture } from '../support/fixtures';
import { FixedClock } from '../support/infrastructure';

describe('MailparserMessageParser', () => {
  it('parses a Gmail-style reply with quotes, threading headers and a PDF attachment', async () => {
    const message = await parseFixture('gmail-reply.eml');

    expect(message.messageIdHeader).toBe('<CAAbc789reply@mail.gmail.com>');
    expect(message.inReplyTo).toBe('<CAAbc456parent@mail.gmail.com>');
    expect(message.references).toEqual([
      '<CAAbc123root@mail.gmail.com>',
      '<CAAbc456parent@mail.gmail.com>',
    ]);
    expect(message.subject).toBe('Re: Stretnutie vo štvrtok');
    expect(message.date).toBe('2026-11-14T17:22:10.000Z');
    expect(message.from).toEqual({ name: 'Zuzana Horáková', email: 'zuzana.horakova@gmail.com' });
    expect(message.to).toEqual([
      { name: 'Matus', email: 'matus@relay.test' },
      { name: null, email: 'team@relay.test' },
    ]);
    expect(message.cc).toEqual([{ name: 'Novak, Peter', email: 'peter.novak@firma.sk' }]);
    expect(message.textBody).toContain('štvrtok o 10:00 mi vyhovuje');
    expect(message.htmlBody).toContain('gmail_quote');
    expect(message.snippet).toBe(
      'Ahoj Matúš, štvrtok o 10:00 mi vyhovuje. Posielam agendu v prílohe. Zuzka',
    );
    expect(message.attachments).toEqual([
      expect.objectContaining({
        filename: 'agenda.pdf',
        contentType: 'application/pdf',
        inline: false,
      }),
    ]);
    expect(message.attachments[0]?.checksum).toMatch(/^[0-9a-f]{32}$/);
  });

  it('parses an Outlook-style HTML mail in windows-1250 with an inline image', async () => {
    const message = await parseFixture('outlook-html.eml');

    expect(message.subject).toBe('Faktúra za október');
    expect(message.from).toEqual({ name: 'Novak, Peter', email: 'peter.novak@firma.sk' });
    expect(message.textBody).toBeNull();
    expect(message.htmlBody).toContain('Splatnosť je 14 dní');
    expect(message.snippet).toBe(
      'Dobrý deň, v prílohe posielam faktúru za október. Splatnosť je 14 dní. S pozdravom Peter Novák',
    );
    expect(message.attachments).toEqual([
      expect.objectContaining({
        filename: 'image001.png',
        contentType: 'image/png',
        contentId: 'image001.png@01DB3A1B.12345670',
        inline: true,
      }),
    ]);
    expect(message.headers.get('thread-index')).toEqual(['AdtZ2cFm3k1L0N9xQ0uLx9b7Zx1fGw==']);
    expect(message.headers.get('x-ms-has-attach')).toEqual(['yes']);
  });

  it('keeps Jira headers and decodes encoded subjects', async () => {
    const message = await parseFixture('jira-cloud-mention.eml');

    expect(message.subject).toBe('[JIRA] (WEB-482) Login tlačidlo nefunguje na Safari');
    expect(message.from).toEqual({
      name: 'Jana Kováčová (Jira)',
      email: 'jira@acme.atlassian.net',
    });
    expect(message.headers.get('x-jira-fingerprint')).toEqual(['6b1f0c1e2d3a4b5c6d7e8f9012345678']);
    expect(message.headers.get('auto-submitted')).toEqual(['auto-generated']);
    expect(message.messageIdHeader).toBe('<JIRA.10482.1794906843000@Atlassian.JIRA>');
  });

  it('builds the snippet from HTML when there is no text part', async () => {
    const message = await parseFixture('jira-cloud-comment-sk.eml');

    expect(message.textBody).toBeNull();
    expect(message.snippet).toBe(
      'Peter Novák okomentoval WEB-482 Opravené v buildu 2.3.1, prosím otestovať.',
    );
  });

  it('falls back to the clock when the Date header is missing and tolerates bad addresses', async () => {
    const parser = new MailparserMessageParser(
      new FixedClock(new Date('2026-01-02T03:04:05.000Z')),
    );
    const source = new TextEncoder().encode(
      'From: not-an-address\r\nTo: ok@relay.test, broken@\r\nSubject: x\r\n\r\nbody\r\n',
    );

    const message = await parser.parse(source);

    expect(message.date).toBe('2026-01-02T03:04:05.000Z');
    expect(message.from).toBeNull();
    expect(message.to).toEqual([{ name: null, email: 'ok@relay.test' }]);
    expect(message.messageIdHeader).toBeNull();
    expect(message.references).toEqual([]);
  });
});

describe('buildSnippet', () => {
  it('drops quoted text and signatures and truncates on a word boundary', () => {
    const text = `${'slovo '.repeat(60)}\n-- \nPodpis`;
    const snippet = buildSnippet(text, null);

    expect(snippet.length).toBeLessThanOrEqual(160);
    expect(snippet.endsWith('slovo…')).toBe(true);
    expect(buildSnippet('Ahoj\n> citácia\nkoniec', null)).toBe('Ahoj koniec');
    expect(buildSnippet('', '<p>Len <b>HTML</b></p>')).toBe('Len HTML');
  });
});

describe('buildSnippet with HTML replies', () => {
  it('skips Gmail and Apple Mail quotes', () => {
    expect(
      buildSnippet(
        null,
        '<div>Nová správa</div><div class="gmail_quote">On Mon wrote:<blockquote>stará</blockquote></div>',
      ),
    ).toBe('Nová správa');
    expect(buildSnippet(null, '<p>Áno</p><blockquote type="cite">pôvodná</blockquote>')).toBe(
      'Áno',
    );
  });
});
