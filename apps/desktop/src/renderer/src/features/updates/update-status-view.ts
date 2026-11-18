import type { UpdateDisabledReason, UpdateStatus } from '@relay/shared';
import { listTimeLabel } from '../../lib/dates';

export interface UpdateStatusView {
  readonly title: string;
  readonly announcement: string;
  readonly detail: string | null;
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
    'Skontroluj aktualizácie znova a keď bude pripravená, zvoľ Reštartovať a aktualizovať.',
  ],
};

export const failureTitle = (failed: Status<'error'>['failed']): string => FAILURES[failed][0];

const view = (
  title: string,
  detail: string | null,
  rest: Partial<UpdateStatusView> = {},
): UpdateStatusView => ({
  title,
  announcement: title,
  detail,
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
  view(
    'Nie je dostupná žiadna aktualizácia',
    `Naposledy skontrolované: ${listTimeLabel(status.checkedAt, now)}`,
    { canCheck: true },
  );

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
        { announcement: `Sťahujem verziu ${status.version}` },
      );
    case 'ready':
      return view(`Verzia ${status.version} je pripravená`, 'Nainštaluje sa po reštarte.', {
        canInstall: true,
      });
    case 'installing':
      return view(`Inštalujem verziu ${status.version}…`, 'Relay sa o chvíľu reštartuje.');
    case 'error':
      return describeFailure(status);
  }
};
