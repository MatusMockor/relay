import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useAppContext, useServices } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { signInWithGoogle } from './google-sign-in';

export type OAuthPhase = 'idle' | 'waiting' | 'error';

export const useGoogleOAuth = (onConnected: () => void) => {
  const services = useServices();
  const { platform } = useAppContext();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<OAuthPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const active = useRef<number | null>(null);
  const abandon = () => {
    if (active.current === null) {
      return;
    }
    active.current = null;
    platform.cancelGoogleAuthorization().catch(() => undefined);
  };
  useEffect(() => abandon, [platform]);
  const isActive = (attempt: number): boolean => active.current === attempt;
  const settle = (attempt: number): boolean => {
    if (!isActive(attempt)) {
      return false;
    }
    active.current = null;
    return true;
  };
  const start = (loginHint?: string) => {
    sequence.current += 1;
    const attempt = sequence.current;
    active.current = attempt;
    setPhase('waiting');
    setError(null);
    signInWithGoogle(services, platform, loginHint, () => !isActive(attempt)).then(
      async (account) => {
        if (!isActive(attempt)) {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
        if (!settle(attempt)) {
          return;
        }
        showToast(`Účet ${account.displayName} je pripojený`);
        setPhase('idle');
        onConnected();
      },
      (failure: unknown) => {
        if (!settle(attempt)) {
          return;
        }
        setPhase('error');
        setError(describeError(failure));
      },
    );
  };
  const cancel = () => {
    abandon();
    setPhase('idle');
  };
  return { phase, error, start, cancel };
};
