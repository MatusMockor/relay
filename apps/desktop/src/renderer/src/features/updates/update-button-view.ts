import type { UpdateStatus } from '@relay/shared';
import { agoLabel } from '../../lib/dates';
import { UP_TO_DATE } from './check-feedback';
import type { SettledCheck } from './update-check-state';
import { failureTitle } from './update-status-view';

export type UpdateButtonKind =
  | 'check'
  | 'checking'
  | 'checked'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

export type UpdateButtonAction = 'check' | 'install';

export interface UpdateButtonView {
  readonly kind: UpdateButtonKind;
  readonly label: string;
  readonly detail: string | null;
  readonly action: UpdateButtonAction | null;
  readonly percent: number | null;
}

export const CHECK_LABEL = 'Skontrolovať aktualizácie';
export const INSTALL_LABEL = 'Reštartovať a aktualizovať';
export const RETRY_DETAIL = 'Klikni a skús to znova';

type Status<Kind extends UpdateStatus['kind']> = Extract<UpdateStatus, { kind: Kind }>;

const button = (
  kind: UpdateButtonKind,
  label: string,
  action: UpdateButtonAction | null,
  rest: Partial<Pick<UpdateButtonView, 'detail' | 'percent'>> = {},
): UpdateButtonView => ({ kind, label, action, detail: null, percent: null, ...rest });

const describeCurrent = (
  status: Status<'current'>,
  settled: SettledCheck | null,
  now: Date,
): UpdateButtonView => {
  if (settled?.kind === 'current') {
    return button('checked', UP_TO_DATE, null);
  }
  return button('check', CHECK_LABEL, 'check', {
    detail: `Naposledy ${agoLabel(status.checkedAt, now)}`,
  });
};

export const describeUpdateButton = (
  status: UpdateStatus | null,
  settled: SettledCheck | null,
  now: Date,
): UpdateButtonView | null => {
  if (status === null) {
    return null;
  }
  switch (status.kind) {
    case 'disabled':
      return null;
    case 'idle':
      return button('check', CHECK_LABEL, 'check');
    case 'checking':
      return button('checking', 'Kontrolujem aktualizácie…', null);
    case 'current':
      return describeCurrent(status, settled, now);
    case 'downloading':
      return button('downloading', `Sťahujem verziu ${status.version}`, null, {
        detail: `${String(status.percent)} %`,
        percent: status.percent,
      });
    case 'ready':
      return button('ready', INSTALL_LABEL, 'install', {
        detail: `Verzia ${status.version} je pripravená`,
      });
    case 'installing':
      return button('installing', `Inštalujem verziu ${status.version}…`, null, {
        detail: 'Relay sa o chvíľu reštartuje.',
      });
    case 'error':
      return button('error', failureTitle(status.failed), 'check', { detail: RETRY_DETAIL });
  }
};
