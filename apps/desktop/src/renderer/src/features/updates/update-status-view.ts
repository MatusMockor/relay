import type { UpdateDisabledReason, UpdateStatus } from '@relay/shared';
import { listTimeLabel } from '../../lib/dates';

export interface UpdateStatusView {
  readonly title: string;
  readonly detail: string | null;
  readonly compact: string | null;
  readonly canCheck: boolean;
  readonly canInstall: boolean;
}

type Status<Kind extends UpdateStatus['kind']> = Extract<UpdateStatus, { kind: Kind }>;

const DISABLED_REASONS: Readonly<Record<UpdateDisabledReason, string>> = {
  development: 'Aktualizácie sú vo vývojovom režime vypnuté.',
  'manual-package': 'Tento balík sa aktualizuje cez správcu balíkov.',
  'unsupported-platform': 'Automatické aktualizácie na tejto platforme nie sú podporované.',
};

const FAILURES: Readonly<Record<Status<'error'>['failed'], readonly [string, string]>> = {
  check: ['Kontrola aktualizácií zlyhala', 'Skontroluj pripojenie na internet a skús to znova.'],
  download: ['Aktualizáciu sa nepodarilo stiahnuť', 'Skús to znova o chvíľu.'],
  install: [
    'Aktualizáciu sa nepodarilo nainštalovať',
    'Relay to skúsi znova pri ďalšej kontrole aktualizácií.',
  ],
};

const view = (
  title: string,
  detail: string | null,
  rest: Partial<UpdateStatusView> = {},
): UpdateStatusView => ({
  title,
  detail,
  compact: null,
  canCheck: false,
  canInstall: false,
  ...rest,
});

const PENDING = view('Zisťujem stav aktualizácií…', null);

const describeFailure = (status: Status<'error'>): UpdateStatusView => {
  const [title, detail] = FAILURES[status.failed];
  return view(title, detail, { canCheck: true });
};

const describeCurrent = (status: Status<'current'>, now: Date): UpdateStatusView =>
  view('Máš najnovšiu verziu', `Naposledy skontrolované: ${listTimeLabel(status.checkedAt, now)}`, {
    canCheck: true,
  });

export const describeUpdateStatus = (status: UpdateStatus | null, now: Date): UpdateStatusView => {
  if (status === null) {
    return PENDING;
  }
  switch (status.kind) {
    case 'disabled':
      return view('Aktualizácie sú vypnuté', DISABLED_REASONS[status.reason]);
    case 'idle':
      return view('Automatické aktualizácie', 'Relay hľadá nové verzie samo každú hodinu.', {
        canCheck: true,
      });
    case 'checking':
      return view('Kontrolujem…', null);
    case 'current':
      return describeCurrent(status, now);
    case 'downloading':
      return view(
        `Sťahujem verziu ${status.version} (${String(status.percent)} %)`,
        'Po stiahnutí ju nainštaluješ reštartom aplikácie.',
        { compact: `Sťahujem ${String(status.percent)} %` },
      );
    case 'ready':
      return view(`Verzia ${status.version} je pripravená`, 'Nainštaluje sa po reštarte.', {
        compact: 'Aktualizovať',
        canInstall: true,
      });
    case 'installing':
      return view(`Inštalujem verziu ${status.version}…`, 'Relay sa o chvíľu reštartuje.', {
        compact: 'Reštartujem…',
      });
    case 'error':
      return describeFailure(status);
  }
};
