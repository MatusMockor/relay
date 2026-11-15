import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectionRegistry } from './connection-registry';
import { REALTIME_OPTIONS, type RealtimeOptions, RealtimeServer } from './realtime-server';

const DEFAULT_OPTIONS: RealtimeOptions = {
  heartbeatMs: 30_000,
  helloTimeoutMs: 10_000,
  maxPayloadBytes: 64 * 1024,
};

@Module({
  imports: [AuthModule],
  providers: [
    ConnectionRegistry,
    RealtimeServer,
    { provide: REALTIME_OPTIONS, useValue: DEFAULT_OPTIONS },
  ],
  exports: [ConnectionRegistry],
})
export class RealtimeModule {}
