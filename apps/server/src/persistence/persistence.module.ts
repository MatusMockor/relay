import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { PersistenceConfig } from './config/persistence-config';
import { PostgresConnectionCloser } from './postgres-connection-closer';
import {
  configProviderFrom,
  PERSISTENCE_EXPORTS,
  persistenceProviders,
} from './persistence.providers';

export interface PersistenceModuleOptions {
  readonly config?: PersistenceConfig;
}

@Global()
@Module({})
export class PersistenceModule {
  static forRoot(options: PersistenceModuleOptions = {}): DynamicModule {
    return {
      module: PersistenceModule,
      global: true,
      providers: [
        configProviderFrom(options.config),
        ...persistenceProviders,
        PostgresConnectionCloser,
      ],
      exports: PERSISTENCE_EXPORTS,
    };
  }
}
