import { useEffect } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { followTrackpadScroll } from './trackpad-swipe';

export const useTrackpadSwipe = (): void => {
  const { platform } = useAppContext();
  useEffect(() => platform.subscribeToTrackpadScroll(followTrackpadScroll), [platform]);
};
