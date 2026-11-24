import { connect, createServer, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

export interface GatedTcpProxy {
  readonly port: number;
  openConnections(): number;
  waitForClient(): Promise<void>;
  release(): void;
  cut(): void;
  close(): Promise<void>;
}

const forward = (client: Socket, host: string, port: number): void => {
  const upstream = connect(port, host);
  client.pipe(upstream);
  upstream.pipe(client);
  upstream.on('error', () => client.destroy());
  upstream.on('close', () => client.destroy());
  client.on('error', () => upstream.destroy());
  client.on('close', () => upstream.destroy());
};

export const startGatedTcpProxy = async (host: string, port: number): Promise<GatedTcpProxy> => {
  const clients = new Set<Socket>();
  const held: Socket[] = [];
  let released = false;
  let refusing = false;
  let arrived: () => void = () => undefined;
  const firstClient = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const server = createServer((client) => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    arrived();
    if (refusing) {
      client.destroy();
      return;
    }
    if (released) {
      forward(client, host, port);
      return;
    }
    held.push(client);
  });
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  return {
    port: (server.address() as AddressInfo).port,
    openConnections: () => clients.size,
    waitForClient: () => firstClient,
    release: () => {
      released = true;
      refusing = false;
      held.splice(0).forEach((client) => {
        forward(client, host, port);
      });
    },
    cut: () => {
      refusing = true;
      clients.forEach((client) => client.destroy());
    },
    close: () =>
      new Promise((resolve) => {
        clients.forEach((client) => client.destroy());
        server.close(() => {
          resolve();
        });
      }),
  };
};
