import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { PostgresConnection } from './database/postgres-connection';
import { POSTGRES_CONNECTION } from './persistence.tokens';

@Injectable()
export class PostgresConnectionCloser implements OnApplicationShutdown {
  constructor(@Inject(POSTGRES_CONNECTION) private readonly connection: PostgresConnection) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
