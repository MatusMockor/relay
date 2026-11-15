import type { AddressInfo } from 'node:net';
import { Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

const WILDCARD_LOOPBACKS: Readonly<Record<string, string>> = {
  '0.0.0.0': '127.0.0.1',
  '::': '::1',
};

export const localOrigin = (address: AddressInfo): string => {
  const host = WILDCARD_LOOPBACKS[address.address] ?? address.address;
  const authority = host.includes(':') ? `[${host}]` : host;
  return `http://${authority}:${String(address.port)}`;
};

@Injectable()
export class LocalServerUrl {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  resolve(path: string): string | null {
    const server = this.adapterHost.httpAdapter.getHttpServer() as {
      address(): AddressInfo | string | null;
    };
    const address = server.address();
    if (typeof address !== 'object' || address === null) {
      return null;
    }
    return `${localOrigin(address)}${path}`;
  }
}
