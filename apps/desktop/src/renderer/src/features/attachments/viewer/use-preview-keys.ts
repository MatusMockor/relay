import type { PreviewKey } from '@relay/shared';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAppContext } from '../../../data/hooks/services-context';

export const usePreviewKeys = (handle: (key: PreviewKey) => void): void => {
  const { platform } = useAppContext();
  const latest = useRef(handle);
  useLayoutEffect(() => {
    latest.current = handle;
  });
  useEffect(
    () =>
      platform.subscribeToPreviewKeys((key) => {
        latest.current(key);
      }),
    [platform],
  );
};
