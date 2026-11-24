import type { IMAPConnection, IMAPServer, Mailbox, Message, Plugin } from 'imapkit';
import type { StoreHandler } from 'imapkit/lib/types.js';
import builtinStoreHandlers from 'imapkit/lib/commands/handlers/store.js';
import { isMailbox, labelsOf, msgidOf, withoutAllLabel } from './gmail-message';
import { onAppended, onExpunged, onFlagsStored, onLabelsStored } from './gmail-mirror-rules';
import { survivingCopyUids } from './surviving-copyuid';

type ChangeKind = 'appended' | 'expunged' | 'flags' | 'labels';

interface Change {
  readonly kind: ChangeKind;
  readonly msgid: string;
  readonly path: string;
  readonly uid: number;
}

export interface GmailMirror {
  readonly plugin: Plugin;
  quietly<Result>(work: () => Result): Result;
}

const FLAG_ITEMS = ['FLAGS', '+FLAGS', '-FLAGS'];
const LABEL_ITEMS = ['X-GM-LABELS', '+X-GM-LABELS', '-X-GM-LABELS'];

const APPLY: Readonly<Record<ChangeKind, (server: IMAPServer, change: Change) => void>> = {
  appended: (server, change) => {
    onAppended(server, change.msgid, change.path, change.uid);
  },
  expunged: (server, change) => {
    onExpunged(server, change.msgid, change.path);
  },
  flags: (server, change) => {
    onFlagsStored(server, change.msgid, change.path, change.uid);
  },
  labels: (server, change) => {
    onLabelsStored(server, change.msgid, change.path, change.uid);
  },
};

export const createGmailMirror = (): GmailMirror => {
  let applying = false;
  let scheduled = false;
  const queue: Change[] = [];
  const quietly = <Result>(work: () => Result): Result => {
    const previous = applying;
    applying = true;
    try {
      return work();
    } finally {
      applying = previous;
    }
  };
  const plugin: Plugin = (server) => {
    const drain = () => {
      scheduled = false;
      quietly(() => {
        server.control.run(() => {
          for (let change = queue.shift(); change !== undefined; change = queue.shift()) {
            APPLY[change.kind](server, change);
          }
        });
      });
    };
    const record = (kind: ChangeKind, mailbox: Mailbox, message: Message) => {
      const msgid = msgidOf(message);
      if (applying || msgid === '') {
        return;
      }
      queue.push({ kind, msgid, path: mailbox.path, uid: message.uid });
      if (!scheduled) {
        scheduled = true;
        setImmediate(drain);
      }
    };
    const recordAll = (kind: ChangeKind) => (mailbox: Mailbox, messages: Message[]) => {
      messages.forEach((message) => {
        record(kind, mailbox, message);
      });
    };
    const wrapStore = (name: string, kind: ChangeKind) => {
      const original = server.storeHandlers[name] ?? builtinStoreHandlers[name];
      if (original === undefined) {
        return;
      }
      const wrapped: StoreHandler = (
        connection: IMAPConnection,
        message,
        values: unknown,
        index,
        parsed,
        data,
      ) => {
        const result: unknown = original(connection, message, values, index, parsed, data);
        const selected: unknown = connection.selectedMailbox;
        if (isMailbox(selected)) {
          record(kind, selected, message);
        }
        return result;
      };
      wrapped.astringValues = original.astringValues;
      server.storeHandlers[name] = wrapped;
    };
    server.on('append', recordAll('appended'));
    server.on('expunge', recordAll('expunged'));
    server.on('flags', recordAll('flags'));
    server.once('pluginsLoaded', () => {
      server.outputHandlers.unshift(survivingCopyUids);
      server.messageHandlers.push((_server, message) => {
        message['X-GM-LABELS'] = withoutAllLabel(labelsOf(message));
      });
      FLAG_ITEMS.forEach((item) => {
        wrapStore(item, 'flags');
        wrapStore(`${item}.SILENT`, 'flags');
      });
      LABEL_ITEMS.forEach((item) => {
        wrapStore(item, 'labels');
        wrapStore(`${item}.SILENT`, 'labels');
      });
    });
  };
  return { plugin, quietly };
};
