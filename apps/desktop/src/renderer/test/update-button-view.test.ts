import { describe, expect, it } from 'vitest';
import { describeUpdateButton } from '../src/features/updates/update-button-view';

const NOW = new Date('2026-11-18T14:05:00.000Z');
const CHECKED_AT = '2026-11-18T13:53:00.000Z';

describe('describeUpdateButton', () => {
  it('hides the button until the status is known and when updates are off', () => {
    expect(describeUpdateButton(null, null, NOW)).toBeNull();
    expect(describeUpdateButton({ kind: 'disabled', reason: 'development' }, null, NOW)).toBeNull();
    expect(
      describeUpdateButton({ kind: 'disabled', reason: 'unsupported-platform' }, null, NOW),
    ).toBeNull();
  });

  it('offers a check while idle without a last check time', () => {
    expect(describeUpdateButton({ kind: 'idle' }, null, NOW)).toEqual({
      kind: 'check',
      label: 'Skontrolovať aktualizácie',
      detail: null,
      action: 'check',
      percent: null,
    });
  });

  it('offers a check with the time of the last one when up to date', () => {
    expect(describeUpdateButton({ kind: 'current', checkedAt: CHECKED_AT }, null, NOW)).toEqual({
      kind: 'check',
      label: 'Skontrolovať aktualizácie',
      detail: 'Naposledy pred 12 min',
      action: 'check',
      percent: null,
    });
  });

  it('blocks the button while a check runs', () => {
    expect(describeUpdateButton({ kind: 'checking' }, null, NOW)).toMatchObject({
      kind: 'checking',
      label: 'Kontrolujem aktualizácie…',
      action: null,
    });
  });

  it('confirms an up to date version only after a check the user started', () => {
    const status = { kind: 'current', checkedAt: CHECKED_AT } as const;
    expect(describeUpdateButton(status, status, NOW)).toEqual({
      kind: 'checked',
      label: 'Máš najnovšiu verziu',
      detail: null,
      action: null,
      percent: null,
    });
  });

  it('shows the download progress without an action', () => {
    expect(
      describeUpdateButton({ kind: 'downloading', version: '0.1.8', percent: 42 }, null, NOW),
    ).toEqual({
      kind: 'downloading',
      label: 'Sťahujem verziu 0.1.8',
      detail: '42 %',
      action: null,
      percent: 42,
    });
  });

  it('installs the ready update', () => {
    expect(describeUpdateButton({ kind: 'ready', version: '0.1.8' }, null, NOW)).toEqual({
      kind: 'ready',
      label: 'Reštartovať a aktualizovať',
      detail: 'Verzia 0.1.8 je pripravená',
      action: 'install',
      percent: null,
    });
  });

  it('keeps the ready look without an action while installing', () => {
    expect(describeUpdateButton({ kind: 'installing', version: '0.1.8' }, null, NOW)).toMatchObject(
      { kind: 'installing', label: 'Inštalujem verziu 0.1.8…', action: null },
    );
  });

  it('names the failed step and retries the check', () => {
    expect(describeUpdateButton({ kind: 'error', failed: 'check' }, null, NOW)).toEqual({
      kind: 'error',
      label: 'Kontrola aktualizácií zlyhala',
      detail: 'Klikni a skús to znova',
      action: 'check',
      percent: null,
    });
    expect(describeUpdateButton({ kind: 'error', failed: 'download' }, null, NOW)).toMatchObject({
      label: 'Aktualizáciu sa nepodarilo stiahnuť',
      action: 'check',
    });
  });
});
