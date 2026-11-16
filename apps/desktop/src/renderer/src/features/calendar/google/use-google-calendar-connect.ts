import { useEffect, useRef, useState } from 'react';
import { describeError } from '../../../data/errors';
import { useAppContext, useServices } from '../../../data/hooks/services-context';
import { useRefreshCalendar } from '../../../data/hooks/use-calendar';
import { showToast } from '../../../state/toast-store';
import { connectGoogleCalendar } from './google-calendar-connect';

export type ConnectPhase = 'idle' | 'waiting' | 'error';

export const useGoogleCalendarConnect = () => {
  const services = useServices();
  const { platform } = useAppContext();
  const refresh = useRefreshCalendar();
  const [phase, setPhase] = useState<ConnectPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const active = useRef<number | null>(null);
  const sequence = useRef(0);
  const abandon = () => {
    if (active.current === null) {
      return;
    }
    active.current = null;
    platform.cancelGoogleAuthorization().catch(() => undefined);
  };
  useEffect(() => abandon, [platform]);
  const start = (loginHint?: string) => {
    sequence.current += 1;
    const attempt = sequence.current;
    active.current = attempt;
    setPhase('waiting');
    setError(null);
    connectGoogleCalendar(services, platform, loginHint, () => active.current !== attempt).then(
      async (connection) => {
        if (active.current !== attempt) {
          return;
        }
        active.current = null;
        await refresh();
        setPhase('idle');
        showToast(`Google kalendár ${connection.email} je pripojený`);
      },
      (cause: unknown) => {
        if (active.current !== attempt) {
          return;
        }
        active.current = null;
        setPhase('error');
        setError(describeError(cause));
      },
    );
  };
  const cancel = () => {
    abandon();
    setPhase('idle');
  };
  return { phase, error, start, cancel };
};
