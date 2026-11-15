import { Global, Module } from '@nestjs/common';
import { PORT_TOKENS } from '@relay/engine';
import { NestEngineLogger } from './nest-engine-logger';
import { RandomIdGenerator } from './random-id-generator';
import { SystemClock } from './system-clock';

@Global()
@Module({
  providers: [
    { provide: PORT_TOKENS.Clock, useClass: SystemClock },
    { provide: PORT_TOKENS.IdGenerator, useClass: RandomIdGenerator },
    { provide: PORT_TOKENS.Logger, useFactory: () => new NestEngineLogger() },
  ],
  exports: [PORT_TOKENS.Clock, PORT_TOKENS.IdGenerator, PORT_TOKENS.Logger],
})
export class InfrastructureModule {}
