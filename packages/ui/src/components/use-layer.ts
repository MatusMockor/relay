import { useEffect, useRef } from 'react';
import { pushLayer } from './layers';

export const useLayer = (onKey: (event: KeyboardEvent) => void): void => {
  const handler = useRef(onKey);
  handler.current = onKey;
  useEffect(
    () =>
      pushLayer((event) => {
        handler.current(event);
      }),
    [],
  );
};
