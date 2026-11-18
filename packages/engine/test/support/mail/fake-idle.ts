import type { Disposer, MailboxChange } from '../../../src';
import type { FakeMailServer } from './fake-mail-server';

export type ChangeListener = (change: MailboxChange) => void;

export const watchFakeMailbox = (
  server: FakeMailServer,
  own: Set<ChangeListener>,
  mailboxPath: string,
  onChange: ChangeListener,
): Disposer => {
  const listener: ChangeListener = (change) => {
    if (change.mailboxPath === mailboxPath) {
      onChange(change);
    }
  };
  server.listeners.add(listener);
  own.add(listener);
  return () => {
    if (server.failIdleStop !== null) {
      return Promise.reject(new Error(server.failIdleStop));
    }
    server.listeners.delete(listener);
    own.delete(listener);
    return Promise.resolve();
  };
};
