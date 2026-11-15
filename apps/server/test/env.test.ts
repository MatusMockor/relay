import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env';

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
    });
  });

  it('coerces the port and accepts a postgres url', () => {
    const env = parseEnv({
      PORT: '4100',
      DATABASE_URL: 'postgres://relay:relay@localhost:5432/relay',
    });
    expect(env.PORT).toBe(4100);
    expect(env.DATABASE_URL).toBe('postgres://relay:relay@localhost:5432/relay');
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => parseEnv({ PORT: 'abc', DATABASE_URL: 'mysql://x' })).toThrow(
      /Invalid server environment: PORT: .*; DATABASE_URL: /,
    );
  });
});
