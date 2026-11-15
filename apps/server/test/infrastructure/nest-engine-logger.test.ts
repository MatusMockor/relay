import { Logger as NestLogger } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { NestEngineLogger } from '../../src/infrastructure/nest-engine-logger';

class RecordingNestLogger extends NestLogger {
  readonly lines: string[] = [];

  override log(message: string): void {
    this.lines.push(message);
  }
}

describe('NestEngineLogger', () => {
  it('logs bigint and circular context values instead of throwing', () => {
    const nest = new RecordingNestLogger('Relay');
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    new NestEngineLogger(nest).info('Synced', { uid: 12n, circular });

    expect(nest.lines).toEqual([
      'Synced {"uid":"12","circular":{"name":"loop","self":"[Circular]"}}',
    ]);
  });
});
