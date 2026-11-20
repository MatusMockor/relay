import {
  MailboxIdSchema,
  type Message,
  MessageSchema,
  subjectContains,
  type UnsubscribeOptions,
} from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { latestReceived } from '../src/features/rule-from-mail/latest-received';
import {
  choiceConditions,
  choiceName,
  FALLBACK_RULE_NAME,
} from '../src/features/rule-from-mail/mail-rule-choice';
import {
  defaultSelection,
  mailRuleOptions,
  type MailRuleSource,
  NEWSLETTER_CONDITION,
} from '../src/features/rule-from-mail/mail-rule-options';
import { isNewsletterSource } from '../src/features/rule-from-mail/newsletter-source';
import { toggleQuick, withTarget } from '../src/features/rule-from-mail/quick-actions';
import { subjectCore } from '../src/features/rule-from-mail/subject-core';
import { serverDetail, serverThread } from './support/thread-fixtures';

const message = (id: string, email: string | null, date: string): Message =>
  MessageSchema.parse({
    ...serverDetail(serverThread('Porada'), []).messages[0],
    id,
    from: email === null ? null : { name: null, email },
    date,
  });

const newsletter: MailRuleSource = {
  from: { name: 'Frontend týždenník', email: 'redakcia@frontend-tyzdennik.sk' },
  subject: 'Re: Fwd: Č. 212: CSS anchor positioning v praxi',
  newsletter: true,
};

describe('subjectCore', () => {
  it('strips reply and forward prefixes, numbered ones included', () => {
    expect(subjectCore('Re: RE: Fwd: Porada v piatok')).toBe('Porada v piatok');
    expect(subjectCore('Odp[2]: AW: Fw:  Faktúra   za  október ')).toBe('Faktúra   za  október');
    expect(subjectCore('Release 2.15')).toBe('Release 2.15');
  });

  it('caps the subject at 60 characters without a trailing space', () => {
    const core = subjectCore(`Re: ${'a'.repeat(59)} b${'c'.repeat(20)}`);
    expect(core).toBe('a'.repeat(59));
  });

  it('produces a condition that matches its own source subject', () => {
    const subject = 'Re: Fwd:   Faktúra   za  október\t2026 ';
    const option = mailRuleOptions({ ...newsletter, subject }).find(
      (item) => item.id === 'subject',
    );
    const condition = option?.conditions[0];
    expect(condition?.type).toBe('subjectContains');
    expect(condition?.type === 'subjectContains' && subjectContains(subject, condition.value)).toBe(
      true,
    );
  });

  it('returns an empty core for an empty or prefix only subject', () => {
    expect(subjectCore('Re:  ')).toBe('');
  });
});

describe('latestReceived', () => {
  it('picks the newest message from someone else', () => {
    const messages = [
      message('m1', 'peter@firma.sk', '2026-11-10T08:00:00.000Z'),
      message('m2', 'peter@firma.sk', '2026-11-12T08:00:00.000Z'),
      message('m3', 'Ja@Domov.sk', '2026-11-13T08:00:00.000Z'),
      message('m4', null, '2026-11-14T08:00:00.000Z'),
    ];
    expect(latestReceived(messages, ['ja@domov.sk'])?.id).toBe('m2');
  });

  it('returns null when every message is mine', () => {
    expect(
      latestReceived([message('m1', 'ja@domov.sk', '2026-11-10T08:00:00.000Z')], ['ja@domov.sk']),
    ).toBeNull();
  });
});

describe('isNewsletterSource', () => {
  const offers: UnsubscribeOptions = { oneClick: true, url: 'https://news.sk/off', mailto: null };
  const own = ['ja@domov.sk'];
  const news = message('m1', 'news@news.sk', '2026-11-10T08:00:00.000Z');
  const mine = message('m2', 'ja@domov.sk', '2026-11-11T08:00:00.000Z');
  const reply = message('m3', 'peter@firma.sk', '2026-11-12T08:00:00.000Z');
  const source = (messages: Message[]) => latestReceived(messages, own) ?? undefined;

  it('accepts a thread whose received mail all comes from the source sender', () => {
    const picked = source([news, mine]);
    expect(picked !== undefined && isNewsletterSource(picked, [news, mine], own, offers)).toBe(
      true,
    );
  });

  it('refuses a newer reply from someone else after a newsletter', () => {
    const picked = source([news, mine, reply]);
    expect(picked?.id).toBe('m3');
    expect(
      picked !== undefined && isNewsletterSource(picked, [news, mine, reply], own, offers),
    ).toBe(false);
  });

  it('refuses a thread without an unsubscribe link', () => {
    const picked = source([news]);
    expect(
      picked !== undefined &&
        isNewsletterSource(picked, [news], own, { oneClick: false, url: null, mailto: null }),
    ).toBe(false);
  });
});

describe('mailRuleOptions', () => {
  it('offers the newsletter, sender, domain and subject options in this order', () => {
    const options = mailRuleOptions(newsletter);
    expect(options.map((option) => option.label)).toEqual([
      'Je to newsletter Frontend týždenník',
      'Od redakcia@frontend-tyzdennik.sk',
      'Z domény frontend-tyzdennik.sk',
      'Predmet obsahuje „Č. 212: CSS anchor positioning v praxi“',
    ]);
    expect(options[0]?.conditions).toEqual([
      NEWSLETTER_CONDITION,
      { type: 'fromAddress', address: 'redakcia@frontend-tyzdennik.sk' },
    ]);
    expect(defaultSelection(options)).toEqual(['newsletter']);
  });

  it('skips the newsletter and an empty subject and defaults to the sender', () => {
    const options = mailRuleOptions({
      from: { name: null, email: 'peter@firma.sk' },
      subject: 'Re:',
      newsletter: false,
    });
    expect(options.map((option) => option.id)).toEqual(['sender', 'domain']);
    expect(defaultSelection(options)).toEqual(['sender']);
  });
});

describe('rule choice', () => {
  const options = mailRuleOptions(newsletter);

  it('ands the chosen conditions without duplicates', () => {
    expect(choiceConditions(options, new Set(['newsletter', 'sender', 'domain']))).toEqual([
      NEWSLETTER_CONDITION,
      { type: 'fromAddress', address: 'redakcia@frontend-tyzdennik.sk' },
      { type: 'fromDomain', domain: 'frontend-tyzdennik.sk' },
    ]);
  });

  it('names the rule after the strongest chosen option', () => {
    expect(choiceName(options, new Set(['newsletter', 'domain']))).toBe(
      'Newsletter Frontend týždenník',
    );
    expect(choiceName(options, new Set(['sender']))).toBe('Frontend týždenník');
    expect(choiceName(options, new Set(['domain', 'subject']))).toBe('frontend-tyzdennik.sk');
    expect(choiceName(options, new Set(['subject']))).toBe(
      'Č. 212: CSS anchor positioning v praxi',
    );
    expect(choiceName(options, new Set())).toBe(FALLBACK_RULE_NAME);
  });
});

describe('quick actions', () => {
  it('toggles simple actions and swaps archive with a move', () => {
    const move = { type: 'moveTo', mailboxId: MailboxIdSchema.parse('mbx-1') } as const;
    expect(toggleQuick([{ type: 'markRead' }], 'markRead')).toEqual([]);
    expect(toggleQuick([{ type: 'markRead' }, move], 'archive')).toEqual([
      { type: 'markRead' },
      { type: 'archive' },
    ]);
    expect(withTarget([{ type: 'archive' }, { type: 'pin' }], move)).toEqual([
      move,
      { type: 'pin' },
    ]);
  });
});
