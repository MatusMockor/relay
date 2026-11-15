import { describe, expect, it } from 'vitest';
import {
  EMPTY_ACCOUNT_FORM,
  validateAccountForm,
  withGuessedServers,
} from '../src/features/accounts/account-form';
import { highlightRanges } from '../src/features/list/Highlight';
import { DeferredQueue } from '../src/features/mail/send-queue';
import { remindPresets } from '../src/features/reminders/presets';
import { hasRemoteImages } from '../src/features/thread/html-mail';
import { isAutomated } from '../src/features/thread/automated';
import { gate, pause } from './features-support';

describe('account form autofill', () => {
  it('keeps manually entered SMTP settings when the IMAP host is still empty', () => {
    const typed = {
      ...EMPTY_ACCOUNT_FORM,
      email: 'meno@gmail.com',
      smtpHost: 'smtp.example.org',
      smtpPort: '587',
    };
    const next = withGuessedServers(typed, 'meno@gmail.co');
    expect(next.smtpHost).toBe('smtp.example.org');
    expect(next.smtpPort).toBe('587');
    expect(next.imapHost).toBe('imap.gmail.com');
  });

  it('replaces fields that still hold the previous guess', () => {
    const first = withGuessedServers({ ...EMPTY_ACCOUNT_FORM, email: 'meno@gmail.com' }, '');
    const second = withGuessedServers({ ...first, email: 'meno@outlook.com' }, 'meno@gmail.com');
    expect(second.imapHost).not.toBe('imap.gmail.com');
    expect(second.smtpHost).not.toBe('smtp.gmail.com');
  });
});

describe('account form ports', () => {
  const form = (port: string) =>
    validateAccountForm({
      ...EMPTY_ACCOUNT_FORM,
      email: 'meno@firma.sk',
      password: 'tajne',
      imapHost: 'imap.firma.sk',
      smtpHost: 'smtp.firma.sk',
      imapPort: port,
    });

  it.each(['0', '00', '65536', '-1', '1.5'])('rejects port %j', (port) => {
    const result = form(port);
    expect(result.ok ? null : result.field).toBe('imapPort');
  });

  it.each(['1', '25', '993', '65535'])('accepts port %j', (port) => {
    const result = form(port);
    expect(result.ok ? result.settings.imap.port : null).toBe(Number(port));
  });
});

describe('highlightRanges', () => {
  it('marks the matching characters after an emoji', () => {
    expect(highlightRanges('😀AB', 'A')).toEqual([false, true, false]);
  });
});

describe('DeferredQueue.flushAll', () => {
  it('waits for a commit that the undo timer already started', async () => {
    const queue = new DeferredQueue();
    const held = gate();
    let finished = false;
    queue.enqueue(0, async () => {
      await held.wait();
      finished = true;
    });
    await pause(10);
    let flushed = false;
    const flushing = queue.flushAll().then(() => {
      flushed = true;
    });
    await pause(10);
    expect(flushed).toBe(false);
    held.open();
    await flushing;
    expect(finished).toBe(true);
  });
});

describe('remindPresets', () => {
  it('omits "Neskôr dnes" when the time would fall on the next day', () => {
    const labels = remindPresets(new Date(2026, 10, 15, 22, 30)).map((preset) => preset.label);
    expect(labels).not.toContain('Neskôr dnes');
  });

  it('keeps "Neskôr dnes" on the same day before 21:00', () => {
    const now = new Date(2026, 10, 15, 20, 10);
    const later = remindPresets(now).find((preset) => preset.label === 'Neskôr dnes');
    expect(later?.date.getDate()).toBe(15);
    expect(later?.date.getHours()).toBe(23);
  });
});

describe('isAutomated', () => {
  it.each(['jan.jirasek@example.org', 'newsome.reader@example.org', 'support@github.com'])(
    'treats %s as a person',
    (email) => {
      expect(isAutomated({ name: null, email })).toBe(false);
    },
  );

  it.each([
    'jira@firma.atlassian.net',
    'noreply@fakturka.sk',
    'no-reply@example.org',
    'notifications@github.com',
    'gitlab@firma.sk',
    'comments@figma.com',
    'news@badevdays.sk',
  ])('treats %s as automated', (email) => {
    expect(isAutomated({ name: null, email })).toBe(true);
  });
});

describe('hasRemoteImages', () => {
  it.each([
    '<img srcset="https://cdn.example.org/a.png 1x">',
    '<img src="cid:logo" srcset="/local.png 1x, https://cdn.example.org/a.png 2x">',
    '<picture><source srcset="//cdn.example.org/a.webp"><img src="cid:a"></picture>',
  ])('detects remote candidates in %s', (html) => {
    expect(hasRemoteImages(html)).toBe(true);
  });

  it.each([
    '<img src="cid:logo">',
    '<img data-src="https://cdn.example.org/a.png" src="data:image/png;base64,AA">',
    '<video><source src="https://cdn.example.org/a.mp4"></video>',
  ])('ignores %s', (html) => {
    expect(hasRemoteImages(html)).toBe(false);
  });
});
