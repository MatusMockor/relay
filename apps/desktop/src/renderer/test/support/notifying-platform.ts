import type { ThreadId } from '@relay/shared';
import { act } from '@testing-library/react';
import { createBrowserPlatform } from '../../src/platform/BrowserPlatform';
import type { Platform } from '../../src/platform/Platform';
import { storageWith } from './render-app';

export const notifyingPlatform = () => {
  const listeners = new Set<(threadId: ThreadId) => void>();
  const platform: Platform = {
    ...createBrowserPlatform(storageWith({ mode: 'local' })),
    subscribeToThreadOpens: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const click = (threadId: ThreadId) => {
    act(() => {
      listeners.forEach((listener) => {
        listener(threadId);
      });
    });
  };
  return { platform, click };
};
