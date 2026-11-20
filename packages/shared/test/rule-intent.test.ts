import { describe, expect, it } from 'vitest';
import { ruleIntent } from '../src/domain';

const actions = (sentence: string): string[] => [...ruleIntent(sentence).actions].sort();
const targets = (sentence: string): string[] => [...ruleIntent(sentence).forwardTo];

describe('rule intent', () => {
  it.each([
    ['faktúry s prílohou daj do štítku Faktúry a archivuj', ['addLabel', 'archive']],
    ['označ ako prečítané, pripni a pripomeň o 3 dni', ['markRead', 'pin', 'remind']],
    ['presuň do priečinka Projekty', ['moveTo']],
    ['vytvor úlohu, pošli notifikáciu a sprav zhrnutie', ['notify', 'summary', 'task']],
    ['archive it, pin it and mark as read', ['archive', 'markRead', 'pin']],
    ['label it Invoices and remind me in 3 days', ['addLabel', 'remind']],
    ['priprav návrh odpovede', ['draftReply']],
    ['draft a reply and pin it', ['draftReply', 'pin']],
    ['create a task and draft a summary', ['summary', 'task']],
    ['ulož koncept a pripni', ['pin']],
    ['add label Archive', ['addLabel']],
    ['add label Archive and archive it', ['addLabel', 'archive']],
    ['add label Folder', ['addLabel']],
    ['predmet obsahuje faktúra, archivuj', ['archive']],
    ['predmet obsahuje „faktúra“ archivuj', ['archive']],
    ['predmet faktúra archivuj.', []],
    ['If the subject contains invoice then archive it.', ['archive']],
    ['predmet obsahuje faktúra a archivuj', ['archive']],
    ['subject contains bread and butter', []],
    ['Archive it without automatically forwarding to audit@example.com.', ['archive']],
    ['Pin mail if subject contains please forward to external@example.com.', ['pin']],
    ['presuň do priečinka Archív', ['moveTo']],
    ['subject contains weekly summary, archive it', ['archive']],
    ['maily bez prílohy archivuj', ['archive']],
    ['archivuj bez upozornenia', ['archive']],
  ])('reads the actions of "%s"', (sentence, expected) => {
    expect(actions(sentence)).toEqual(expected);
  });

  it.each([
    'archive mail from forwarder@attacker.test',
    'maily od preposlane@firma.sk archivuj',
    'subject contains forward, archive it',
  ])('does not take an address or condition text as a forward request: %s', (sentence) => {
    expect(ruleIntent(sentence).actions.has('forward')).toBe(false);
    expect(targets(sentence)).toEqual([]);
  });

  it.each([
    'subject contains draft, pin it',
    'predmet obsahuje „odpoveď“, pripni',
    'maily od odpovede@firma.sk pripni',
  ])('does not take condition text as a reply draft request: %s', (sentence) => {
    expect(actions(sentence)).toEqual(['pin']);
  });

  it.each([
    'nepreposielaj to na jano@firma.sk, iba archivuj',
    "don't forward it to jano@firma.sk, archive it",
    'nie preposlať na jano@firma.sk, archivuj',
    'nikdy neodpovedaj, archivuj',
    'do not under any circumstances forward to other@example.com, archive it',
  ])('honors negation: %s', (sentence) => {
    expect(actions(sentence)).toEqual(['archive']);
    expect(targets(sentence)).toEqual([]);
  });

  it.each([
    'never ever under any circumstance forward it to other@example.com and archive it',
    'Archive the message; do not also forward a copy to external@example.com.',
    'do not just forward it to external@example.com',
    'nikdy aj neprepošli, ani nepreposielaj; nie aj preposlať na jano@firma.sk',
  ])('keeps a negation up to the end of its clause: %s', (sentence) => {
    expect(ruleIntent(sentence).actions.has('forward')).toBe(false);
    expect(targets(sentence)).toEqual([]);
  });

  it.each([
    'možno prepošli na jano@firma.sk',
    'prepošli to na jano@firma.sk?',
    'maybe forward it to jano@firma.sk',
  ])('rejects uncertain intent: %s', (sentence) => {
    expect(actions(sentence)).toEqual([]);
  });

  it('collects forward targets from the forward clause and skips the sender', () => {
    expect(targets('maily od sef@firma.sk prepošli na Uctovnik@Firma.sk.')).toEqual([
      'uctovnik@firma.sk',
    ]);
    expect(targets('maily od sef@firma.sk archivuj, prepošli z sef@firma.sk')).toEqual([]);
  });

  it('skips a sender written in angle brackets', () => {
    expect(targets('forward mail from <sender@example.com> to recipient@example.com')).toEqual([
      'recipient@example.com',
    ]);
    expect(targets('maily od < sef@firma.sk > prepošli na uctovnik@firma.sk')).toEqual([
      'uctovnik@firma.sk',
    ]);
  });

  it('takes only addresses introduced by the forward phrase', () => {
    expect(targets('Forward mail from Jane Doe <jane@example.com> to ops@example.com')).toEqual([
      'ops@example.com',
    ]);
    expect(targets('Forward to ops@example.com and notify bob@example.com')).toEqual([
      'ops@example.com',
    ]);
    expect(targets('prepošli to na jano@firma.sk a upozorni sef@firma.sk')).toEqual([
      'jano@firma.sk',
    ]);
    expect(targets('forward it to Jane <jane@example.com>')).toEqual(['jane@example.com']);
    expect(targets('Forward invoices to Alice <ops@example.com>.')).toEqual(['ops@example.com']);
    expect(targets('Forward a copy of invoices to ops@example.com.')).toEqual(['ops@example.com']);
    expect(targets("Forward emails CC'd to audit@example.com to ops@example.com.")).toEqual([
      'ops@example.com',
    ]);
    expect(targets('maily v kópii audit@firma.sk prepošli na jano@firma.sk')).toEqual([
      'jano@firma.sk',
    ]);
  });

  it.each([
    ['forward mail sent to me@example.com to ops@example.com', 'ops@example.com'],
    ['forward mail addressed to me@example.com to ops@example.com', 'ops@example.com'],
    ['forward mail received at me@example.com to ops@example.com', 'ops@example.com'],
    ['prepošli maily adresované na info@firma.sk na jano@firma.sk', 'jano@firma.sk'],
    ['maily pre info@firma.sk prepošli na jano@firma.sk', 'jano@firma.sk'],
    ['prepošli na x@y.sk a upozorni z@w.sk', 'x@y.sk'],
  ])('binds one destination to the forward verb in "%s"', (sentence, destination) => {
    expect(targets(sentence)).toEqual([destination]);
  });

  it.each([
    'forward to ops@example.com or to boss@example.com',
    'prepošli na x@y.sk a na z@w.sk',
    'forward mail for audit@example.com to ops@example.com',
  ])('drops a forward with more than one candidate recipient: %s', (sentence) => {
    expect(targets(sentence)).toEqual([]);
  });

  it.each([
    ['z priečinka Work/Invoices presuň do Archív', { addLabel: [], moveTo: ['archiv'] }],
    ['presuň do Archív, nikdy nie do Work/Invoices', { addLabel: [], moveTo: ['archiv'] }],
    ['daj štítok „Klienti/Acme“', { addLabel: ['klienti/acme'], moveTo: [] }],
    ['Move to Archive and add label Receipts.', { addLabel: ['receipts'], moveTo: ['archive'] }],
    ['move it into the Projects folder', { addLabel: [], moveTo: ['projects'] }],
    ['add label Research and Development', { addLabel: ['research and development'], moveTo: [] }],
  ])('reads the target names of each action in "%s"', (sentence, names) => {
    expect(ruleIntent(sentence).targetNames).toEqual(names);
  });

  it('keeps forwarding asked for in a separate affirmative clause', () => {
    expect(targets("don't archive it, forward it to jano@firma.sk")).toEqual(['jano@firma.sk']);
    expect(actions("don't archive it, forward it to jano@firma.sk")).toEqual(['forward']);
  });
});
