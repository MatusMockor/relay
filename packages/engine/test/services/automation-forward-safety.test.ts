import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow } from '../support/automation-filters';
import { historyOf } from '../support/automation-history';
import { TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';

const ACCOUNTANT = 'uctovnicka@firma.test';
const HOUR_MS = 60 * 60_000;
const FORWARD = { type: 'forward', to: ACCOUNTANT } as const;

const headerOf = (raw: string, name: string): string | undefined =>
  raw
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
    ?.slice(name.length + 1)
    .trim();

describe('forward automation safety', () => {
  it('marks its forwards and never forwards one that comes back', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [FORWARD] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const sent = new TextDecoder().decode(present(setup.engine.sender.sent[0]).sent.sentCopy);
    const marks = {
      'Auto-Submitted': present(headerOf(sent, 'Auto-Submitted')),
      'X-Relay-Automation': present(headerOf(sent, 'X-Relay-Automation')),
    };
    expect(marks).toEqual({ 'Auto-Submitted': 'auto-forwarded', 'X-Relay-Automation': 'forward' });

    deliverMail(setup.server, 'INBOX', {
      id: 'm2',
      from: TIBOR,
      subject: 'Fwd: Faktúra 1',
      headers: marks,
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'm3',
      from: TIBOR,
      subject: 'Som mimo kancelárie',
      headers: { 'Auto-Submitted': 'auto-replied' },
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'm4',
      from: TIBOR,
      subject: 'Automatická odpoveď',
      headers: { 'X-Autoreply': 'yes' },
    });
    await syncNow(setup);

    expect(setup.engine.sender.sent).toHaveLength(1);
    const reasons = (await historyOf(setup, rule)).entries
      .filter((entry) => entry.subject !== 'Faktúra 1')
      .map((entry) => [entry.subject, entry.actions[0]?.outcome, entry.actions[0]?.reason]);
    expect(reasons).toEqual(
      expect.arrayContaining([
        [
          'Fwd: Faktúra 1',
          'failed',
          'Mail už automaticky preposlalo pravidlo Relay, ďalej sa nepreposiela',
        ],
        ['Som mimo kancelárie', 'failed', 'Automaticky odoslaný mail sa automaticky nepreposiela'],
        ['Automatická odpoveď', 'failed', 'Automatická odpoveď sa automaticky nepreposiela'],
      ]),
    );
  });

  it('forwards at most 20 mails of an account per hour', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [FORWARD] });
    for (let index = 1; index <= 22; index += 1) {
      deliverMail(setup.server, 'INBOX', {
        id: `burst-${String(index)}`,
        from: TIBOR,
        subject: `Faktúra ${String(index)}`,
      });
    }

    await syncNow(setup);

    expect(setup.engine.sender.sent).toHaveLength(20);
    const failed = (await historyOf(setup, rule)).entries.filter(
      (entry) => entry.actions[0]?.outcome === 'failed',
    );
    expect(failed).toHaveLength(2);
    expect(failed[0]?.actions[0]?.reason).toBe(
      'Účet už za poslednú hodinu automaticky preposlal 20 mailov, ďalšie preposlanie sa preskočilo',
    );
    expect(
      setup.engine.logger.entries.filter(
        (entry) => entry.message === 'An automation action failed',
      ),
    ).toHaveLength(2);

    setup.engine.clock.advance(HOUR_MS + 1);
    deliverMail(setup.server, 'INBOX', { id: 'after', from: TIBOR, subject: 'Faktúra neskôr' });
    await syncNow(setup);

    expect(setup.engine.sender.sent).toHaveLength(21);
  });
});
