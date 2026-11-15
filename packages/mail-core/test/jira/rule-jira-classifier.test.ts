import { describe, expect, it } from 'vitest';
import { RuleJiraClassifier } from '../../src';
import { parseFixture } from '../support/fixtures';
import { parsedMessage } from '../support/parsed-message';

describe('RuleJiraClassifier', () => {
  const classifier = new RuleJiraClassifier({ senderDomains: ['jira.firma.sk'] });

  it.each([
    ['jira-cloud-mention.eml', 'WEB-482', 'mention', 'Jana Kováčová'],
    ['jira-cloud-comment-sk.eml', 'WEB-482', 'comment', 'Peter Novák'],
    ['jira-server-status.eml', 'OPS-17', 'status', 'Peter Novák'],
    ['jira-assigned-sk.eml', 'WEB-490', 'assigned', 'Jana Kováčová'],
    ['jira-mention-sk.eml', 'WEB-482', 'mention', 'Jana Kováčová'],
  ])('classifies %s as %s / %s by %s', async (fixture, jiraKey, eventKind, actor) => {
    expect(await classifier.classify(await parseFixture(fixture))).toEqual({
      jiraKey,
      eventKind,
      actor,
    });
  });

  it.each(['gmail-reply.eml', 'outlook-html.eml', 'human-with-jira-key.eml'])(
    'ignores the non-Jira mail %s',
    async (fixture) => {
      expect(await classifier.classify(await parseFixture(fixture))).toBeNull();
    },
  );

  const jiraFrom = { name: 'Jira', email: 'jira@acme.atlassian.net' };

  it.each([
    ['[JIRA] Jana mentioned you on WEB-1', 'mention', 'Jana'],
    ['[JIRA] Peter assigned WEB-1 to you', 'assigned', 'Peter'],
    ['[JIRA] Peter changed the status of WEB-1', 'status', 'Peter'],
    ['[JIRA] Peter commented on WEB-1', 'comment', 'Peter'],
    ['[JIRA] (WEB-1) Peter vás spomenul v komentári', 'mention', 'Peter'],
    ['[JIRA] (WEB-1) Peter ti pridelil úlohu', 'assigned', 'Peter'],
    ['[JIRA] (WEB-1) Peter zmenil stav na Hotovo', 'status', 'Peter'],
    ['[JIRA] (WEB-1) Peter pridal komentár', 'comment', 'Peter'],
    ['[JIRA] (WEB-1) Peter vás zmínil', 'mention', 'Peter'],
    ['[JIRA] (WEB-1) Peter vám přiřadil úkol', 'assigned', 'Peter'],
    ['[JIRA] (WEB-1) Peter změnil stav', 'status', 'Peter'],
    ['[JIRA] (WEB-1) Release notes', 'other', null],
  ])('detects the event kind of "%s" as %s', async (subject, eventKind, actor) => {
    const message = parsedMessage({ from: jiraFrom, subject, textBody: '' });

    expect(await classifier.classify(message)).toEqual({ jiraKey: 'WEB-1', eventKind, actor });
  });

  it.each([
    ['Peter Novák mentioned you on WEB-482', 'Peter Novák'],
    ['Jana Kováčová assigned CMS-217 to you', 'Jana Kováčová'],
    ['Tomáš Baláž changed the priority of CMS-217 to High', 'Tomáš Baláž'],
    ['Tomáš Baláž zmenil prioritu na Vysoká', 'Tomáš Baláž'],
    ['Jana Kováčová vám priradila CMS-217', 'Jana Kováčová'],
    ['Peter Novák okomentoval CMS-217', 'Peter Novák'],
    ['Mária Horváth-Kiss vytvorila CMS-218', 'Mária Horváth-Kiss'],
  ])('extracts the actor from the body line "%s"', async (line, actor) => {
    const message = parsedMessage({
      from: jiraFrom,
      subject: '[JIRA] (CMS-217) Editor stráca obrázky',
      textBody: `${line}\n\nView issue: https://acme.atlassian.net/browse/CMS-217`,
    });

    expect((await classifier.classify(message))?.actor).toBe(actor);
  });

  it('does not read an issue title in the subject as an actor', async () => {
    const message = parsedMessage({
      from: jiraFrom,
      subject: '[JIRA] (CMS-217) Login changed behaviour after the update',
      textBody: 'Status: Open',
    });

    expect((await classifier.classify(message))?.actor).toBeNull();
  });

  it('falls back to the "(Jira)" sender name and ignores a plain Jira sender', async () => {
    const named = parsedMessage({
      from: { name: 'Lucia Malá (Jira)', email: 'jira@acme.atlassian.net' },
      subject: '[JIRA] (CMS-217) Editor stráca obrázky',
      textBody: 'Status: Open',
    });
    const plain = parsedMessage({
      from: jiraFrom,
      subject: '[JIRA] (CMS-217) Editor stráca obrázky',
      textBody: 'Status: Open',
    });

    expect((await classifier.classify(named))?.actor).toBe('Lucia Malá');
    expect((await classifier.classify(plain))?.actor).toBeNull();
  });

  it('prefers the parenthesized key and falls back to a browse link in the body', async () => {
    const parenthesized = parsedMessage({
      from: jiraFrom,
      subject: '[JIRA] (ABC-12) Linked to XYZ-9',
    });
    const fromBody = parsedMessage({
      from: jiraFrom,
      subject: '[JIRA] Daily digest',
      textBody: 'See https://acme.atlassian.net/browse/DATA_X-77 for details',
    });

    expect((await classifier.classify(parenthesized))?.jiraKey).toBe('ABC-12');
    expect((await classifier.classify(fromBody))?.jiraKey).toBe('DATA_X-77');
  });

  it('detects Jira by X-JIRA headers and configured self-hosted senders', async () => {
    const byHeader = parsedMessage({
      from: { name: 'Robot', email: 'noreply@tracker.example.com' },
      subject: 'OPS-3 Server down',
      headers: new Map([['x-jira-fingerprint', ['abc']]]),
    });
    const bySender = parsedMessage({
      from: { name: 'Tracker', email: 'tracker@jira.firma.sk' },
      subject: 'OPS-4 Disk full',
    });

    expect(await classifier.classify(byHeader)).toEqual({
      jiraKey: 'OPS-3',
      eventKind: 'other',
      actor: null,
    });
    expect(await classifier.classify(bySender)).toEqual({
      jiraKey: 'OPS-4',
      eventKind: 'other',
      actor: null,
    });
  });

  it('returns null for a Jira mail without an issue key', async () => {
    expect(
      await classifier.classify(
        parsedMessage({ from: jiraFrom, subject: '[JIRA] Weekly summary' }),
      ),
    ).toBeNull();
  });
});
