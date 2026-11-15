import type { TrustedSenderPredicate } from './register-ipc';

export const createTrustedSenderPredicate = (
  rendererUrl: string | null,
  rendererFileUrl: string,
): TrustedSenderPredicate => {
  const devOrigin = rendererUrl === null ? null : new URL(rendererUrl).origin;
  return (frameUrl) => {
    if (frameUrl === '') {
      return false;
    }
    if (frameUrl.split(/[?#]/)[0] === rendererFileUrl) {
      return true;
    }
    if (devOrigin === null || !URL.canParse(frameUrl)) {
      return false;
    }
    return new URL(frameUrl).origin === devOrigin;
  };
};
