import type { AddressInfo } from 'node:net';
import { Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

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
    return `http://127.0.0.1:${address.port}${path}`;
  }
}
