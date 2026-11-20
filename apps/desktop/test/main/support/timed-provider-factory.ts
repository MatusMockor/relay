import type { MailProvider, MailProviderFactory } from '@relay/engine';

export interface ProviderTiming {
  totalMs: number;
}

const timed = (provider: MailProvider, timing: ProviderTiming): MailProvider =>
  new Proxy(provider, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]): unknown => {
        const started = performance.now();
        const result: unknown = Reflect.apply(value, target, args);
        if (!(result instanceof Promise)) {
          return result;
        }
        return result.finally(() => {
          timing.totalMs += performance.now() - started;
        });
      };
    },
  });

export const timeProviders = (factory: MailProviderFactory): ProviderTiming => {
  const timing: ProviderTiming = { totalMs: 0 };
  const create = factory.create.bind(factory);
  factory.create = (...args) => timed(create(...args), timing);
  return timing;
};
