import type { DeviceId } from '@relay/shared';
import { Button, Status } from '@relay/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../../data/errors';
import { queryKeys } from '../../../data/hooks/query-keys';
import { useServices } from '../../../data/hooks/services-context';
import { listTimeLabel } from '../../../lib/dates';
import { showToast } from '../../../state/toast-store';
import { SettingRow } from '../SettingRow';
import { SectionHeader } from '../SectionHeader';

const PLATFORM: Readonly<Record<string, string>> = {
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
};

export function DevicesSection() {
  const { server } = useServices();
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: queryKeys.devices(),
    queryFn: () => server?.listDevices() ?? Promise.resolve([]),
    enabled: server !== null,
  });
  const revoke = (id: DeviceId) => {
    server
      ?.revokeDevice(id)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.devices() }))
      .then(() => {
        showToast('Zariadenie odhlásené');
      })
      .catch((error: unknown) => {
        showToast(describeError(error));
      });
  };
  return (
    <>
      <SectionHeader title="Zariadenia">
        Zariadenia prihlásené k tvojmu účtu. Odhlásené zariadenie stratí prístup okamžite.
      </SectionHeader>
      {(devices.data ?? []).map((device) => (
        <SettingRow
          key={device.id}
          title={device.name}
          description={`${PLATFORM[device.platform] ?? device.platform} · naposledy ${listTimeLabel(device.lastSeenAt, new Date())}`}
        >
          {device.current ? (
            <Status tone="ok" label="Toto zariadenie" />
          ) : (
            <Button
              variant="danger"
              onClick={() => {
                revoke(device.id);
              }}
            >
              Odhlásiť
            </Button>
          )}
        </SettingRow>
      ))}
    </>
  );
}
