import type { GoogleCalendar } from '@relay/shared';
import { Switch } from '@relay/ui';
import { describeError } from '../../../../data/errors';
import { useClient } from '../../../../data/hooks/services-context';
import { useRefreshCalendar } from '../../../../data/hooks/use-calendar';
import { showToast } from '../../../../state/toast-store';
import { SettingRow } from '../../SettingRow';
import { nextColor } from '../calendar-colors';
import { describeCalendar } from './google-calendar-copy';

export function GoogleCalendarRow({ calendar }: { readonly calendar: GoogleCalendar }) {
  const client = useClient();
  const refresh = useRefreshCalendar();
  const update = (patch: { enabled?: boolean; color?: string }) => {
    client
      .updateGoogleCalendar(calendar.id, patch)
      .then(() => refresh())
      .catch((error: unknown) => {
        showToast(describeError(error));
      });
  };
  return (
    <SettingRow title={calendar.name} description={describeCalendar(calendar)}>
      <button
        type="button"
        className="cal-swatch on"
        style={{ ['--c' as string]: calendar.color }}
        title="Zmeniť farbu"
        aria-label={`Zmeniť farbu kalendára ${calendar.name}`}
        onClick={() => {
          update({ color: nextColor(calendar.color) });
        }}
      />
      <Switch
        checked={calendar.enabled}
        label={`Zobrazovať kalendár ${calendar.name}`}
        onChange={(enabled) => {
          update({ enabled });
        }}
      />
    </SettingRow>
  );
}
