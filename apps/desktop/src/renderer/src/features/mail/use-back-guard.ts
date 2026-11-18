import { useEffect, useRef } from 'react';
import { guardBack } from './back-guards';

export const useBackGuard = (guard: () => void): void => {
  const current = useRef(guard);
  current.current = guard;
  useEffect(
    () =>
      guardBack(() => {
        current.current();
      }),
    [],
  );
};
