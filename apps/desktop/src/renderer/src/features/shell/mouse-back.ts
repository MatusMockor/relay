import { navigateBack } from '../mail/navigate-back';

const BACK_BUTTON = 3;

const onMouseUp = (event: MouseEvent): void => {
  if (event.button !== BACK_BUTTON) {
    return;
  }
  event.preventDefault();
  navigateBack('pointer');
};

export const listenForMouseBack = (target: Window): (() => void) => {
  target.addEventListener('mouseup', onMouseUp);
  return () => {
    target.removeEventListener('mouseup', onMouseUp);
  };
};
