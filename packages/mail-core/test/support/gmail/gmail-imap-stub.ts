import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import {
  capabilityResponse,
  fetchResponse,
  listResponse,
  searchResponse,
  selectResponse,
  statusResponse,
} from './gmail-responses';
import { GMAIL_CAPABILITIES, gmailMailboxes, type StubMailbox } from './gmail-stub-data';
import { type ParsedCommand, parseCommand } from './imap-wire';
import { createMailbox, deleteMailbox, renameMailboxes } from './gmail-mailbox-admin';

export interface GmailImapStub {
  readonly port: number;
  readonly commands: string[];
  readonly mailboxes: StubMailbox[];
  close(): Promise<void>;
}

export interface GmailImapStubOptions {
  readonly permanentFlags?: string;
}

interface Session {
  selected: StubMailbox | null;
}

type Handler = (command: ParsedCommand, line: string, session: Session) => string[];

const findMailbox = (mailboxes: readonly StubMailbox[], path: string | undefined) =>
  mailboxes.find((mailbox) => mailbox.path === path) ?? null;

const handlers = (
  mailboxes: StubMailbox[],
  options: GmailImapStubOptions,
): Record<string, Handler> => {
  const select: Handler = (command, _line, session) => {
    session.selected = findMailbox(mailboxes, command.args[0]);
    return session.selected === null ? [] : selectResponse(session.selected, options);
  };
  const status: Handler = (command) => {
    const mailbox = findMailbox(mailboxes, command.args[0]);
    return mailbox === null ? [] : statusResponse(mailbox);
  };
  const list: Handler = (command) =>
    command.args.at(-1) === '' ? ['* LIST (\\Noselect) "/" ""'] : listResponse('LIST', mailboxes);
  return {
    CAPABILITY: () => capabilityResponse(),
    LIST: list,
    LSUB: () => listResponse('LSUB', mailboxes),
    SELECT: select,
    EXAMINE: select,
    STATUS: status,
    'UID SEARCH': (command, _line, session) =>
      session.selected === null ? [] : searchResponse(session.selected, command.args),
    'UID FETCH': (_command, line, session) =>
      session.selected === null ? [] : fetchResponse(session.selected, line),
    CREATE: (command) => createMailbox(mailboxes, command.args[0] ?? ''),
    RENAME: (command) => renameMailboxes(mailboxes, command.args[0] ?? '', command.args[1] ?? ''),
    DELETE: (command) => deleteMailbox(mailboxes, command.args[0] ?? ''),
  };
};

const completion = (command: ParsedCommand): string => {
  if (command.name === 'LOGIN') {
    return `${command.tag} OK [CAPABILITY ${GMAIL_CAPABILITIES}] Logged in`;
  }
  if (command.name === 'SELECT' || command.name === 'EXAMINE') {
    return `${command.tag} OK [READ-WRITE] ${command.name} completed`;
  }
  return `${command.tag} OK ${command.name} completed`;
};

const serve = (socket: Socket, commands: string[], table: Record<string, Handler>): void => {
  const session: Session = { selected: null };
  let buffer = '';
  const write = (lines: readonly string[]) => socket.write(lines.map((l) => `${l}\r\n`).join(''));
  socket.write(`* OK [CAPABILITY ${GMAIL_CAPABILITIES}] Gimap ready\r\n`);
  socket.on('error', () => undefined);
  socket.on('data', (data) => {
    buffer += data.toString('utf8');
    for (let end = buffer.indexOf('\r\n'); end !== -1; end = buffer.indexOf('\r\n')) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      commands.push(line);
      const command = parseCommand(line);
      const untagged = table[command.name]?.(command, line, session) ?? [];
      const bye = command.name === 'LOGOUT' ? ['* BYE Logging out'] : [];
      write([...untagged, ...bye, completion(command)]);
      if (command.name === 'LOGOUT') {
        socket.end();
      }
    }
  });
};

export const startGmailImapStub = async (
  options: GmailImapStubOptions = {},
): Promise<GmailImapStub> => {
  const commands: string[] = [];
  const mailboxes = gmailMailboxes();
  const table = handlers(mailboxes, options);
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    serve(socket, commands, table);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolve) => {
      sockets.forEach((socket) => {
        socket.destroy();
      });
      server.close(() => {
        resolve();
      });
    });
  return { port, commands, mailboxes, close };
};
