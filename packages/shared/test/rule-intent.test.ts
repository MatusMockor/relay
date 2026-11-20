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
    ['presuň do priečinka Archív', ['moveTo']],
    ['subject contains weekly summary, archive it', ['archive']],
    ['predmet obsahuje týždenné zhrnutie a archivuj', ['archive']],
    ['predmet faktúra archivuj.', ['archive']],
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
    'never ever under any circumstance forward it to other@example.com and archive it',
  ])('honors negation: %s', (sentence) => {
    expect(actions(sentence)).toEqual(['archive']);
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

  it('keeps forwarding asked for in a separate affirmative clause', () => {
    expect(targets("don't archive it, forward it to jano@firma.sk")).toEqual(['jano@firma.sk']);
    expect(actions("don't archive it, forward it to jano@firma.sk")).toEqual(['forward']);
  });
});
