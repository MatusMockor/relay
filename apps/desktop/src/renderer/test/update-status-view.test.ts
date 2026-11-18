import { describe, expect, it } from 'vitest';
import { describeUpdateStatus } from '../src/features/updates/update-status-view';

const NOW = new Date(2026, 10, 18, 14, 5);

describe('describeUpdateStatus', () => {
  it('waits for the first status without offering a check', () => {
    expect(describeUpdateStatus(null, NOW)).toMatchObject({
      title: 'Zisťujem stav aktualizácií…',
      canCheck: false,
      compact: null,
    });
  });

  it('shows a running check and blocks another one', () => {
    expect(describeUpdateStatus({ kind: 'checking' }, NOW)).toMatchObject({
      title: 'Kontrolujem…',
      canCheck: false,
      canInstall: false,
    });
  });

  it('tells when the app is up to date and when it was checked', () => {
    const checkedAt = new Date(2026, 10, 18, 9, 30).toISOString();
    expect(describeUpdateStatus({ kind: 'current', checkedAt }, NOW)).toEqual({
      title: 'Máš najnovšiu verziu',
      detail: 'Naposledy skontrolované: 9:30',
      compact: null,
      canCheck: true,
      canInstall: false,
    });
  });

  it('gives a compact progress label for the sidebar while downloading', () => {
    expect(
      describeUpdateStatus({ kind: 'downloading', version: '0.2.0', percent: 42 }, NOW),
    ).toMatchObject({
      title: 'Sťahujem verziu 0.2.0 (42 %)',
      compact: 'Sťahujem 42 %',
      canCheck: false,
    });
  });

  it('offers the install once the update is ready', () => {
    expect(describeUpdateStatus({ kind: 'ready', version: '0.2.0' }, NOW)).toMatchObject({
      title: 'Verzia 0.2.0 je pripravená',
      compact: 'Aktualizovať',
      canInstall: true,
      canCheck: false,
    });
  });

  it('explains every reason why updates are off', () => {
    expect(describeUpdateStatus({ kind: 'disabled', reason: 'development' }, NOW).detail).toBe(
      'Aktualizácie sú vo vývojovom režime vypnuté.',
    );
    expect(describeUpdateStatus({ kind: 'disabled', reason: 'manual-package' }, NOW).detail).toBe(
      'Tento balík sa aktualizuje cez správcu balíkov.',
    );
    expect(
      describeUpdateStatus({ kind: 'disabled', reason: 'unsupported-platform' }, NOW),
    ).toMatchObject({
      detail: 'Automatické aktualizácie na tejto platforme nie sú podporované.',
      canCheck: false,
    });
  });

  it('names the failed step and lets the user try again', () => {
    expect(describeUpdateStatus({ kind: 'error', failed: 'check' }, NOW)).toMatchObject({
      title: 'Kontrola aktualizácií zlyhala',
      canCheck: true,
    });
    expect(describeUpdateStatus({ kind: 'error', failed: 'download' }, NOW).title).toBe(
      'Aktualizáciu sa nepodarilo stiahnuť',
    );
    expect(describeUpdateStatus({ kind: 'error', failed: 'install' }, NOW).title).toBe(
      'Aktualizáciu sa nepodarilo nainštalovať',
    );
  });
});
