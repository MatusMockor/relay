import { useEffect } from 'react';
import { navigateBack } from '../mail/navigate-back';

const BACK_BUTTON = 3;

const onMouseUp = (event: MouseEvent): void => {
  if (event.button !== BACK_BUTTON) {
    return;
  }
  event.preventDefault();
  navigateBack();
};

export const useMouseBack = (): void => {
  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
};
