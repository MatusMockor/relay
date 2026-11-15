import { type DynamicModule, Global, Module } from '@nestjs/common';
import { SERVER_CONFIG, type ServerConfig } from './server-config';

@Global()
@Module({})
export class ServerConfigModule {
  static forRoot(config: ServerConfig): DynamicModule {
    return {
      module: ServerConfigModule,
      providers: [{ provide: SERVER_CONFIG, useValue: config }],
      exports: [SERVER_CONFIG],
    };
  }
}
