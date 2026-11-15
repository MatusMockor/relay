import { describe, expect, expectTypeOf, it } from 'vitest';
import { PORT_TOKENS, type PortName } from '../src';

describe('PORT_TOKENS', () => {
  it('provides one unique, registry-wide symbol per port', () => {
    const tokens = Object.values(PORT_TOKENS);
    expect(new Set(tokens).size).toBe(tokens.length);
    Object.entries(PORT_TOKENS).forEach(([name, token]) => {
      expect(token).toBe(Symbol.for(`relay.engine.${name}`));
    });
  });

  it('covers every port in the registry', () => {
    expectTypeOf<keyof typeof PORT_TOKENS>().toEqualTypeOf<PortName>();
    expect(Object.keys(PORT_TOKENS)).toEqual(
      expect.arrayContaining(['UnitOfWork', 'ThreadRepository', 'MailProviderFactory', 'Clock']),
    );
  });
});
