import { Logger as NestLogger } from '@nestjs/common';
import type { LogContext, Logger } from '@relay/engine';

const serialize = (value: unknown): unknown => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
};

const jsonReplacer = (): ((key: string, value: unknown) => unknown) => {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return value;
  };
};

const stringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, jsonReplacer());
  } catch {
    return '"[Unserializable context]"';
  }
};

const format = (message: string, context: LogContext): string => {
  const entries = Object.entries(context);
  if (entries.length === 0) {
    return message;
  }
  const serialized = Object.fromEntries(entries.map(([key, value]) => [key, serialize(value)]));
  return `${message} ${stringify(serialized)}`;
};

export class NestEngineLogger implements Logger {
  constructor(
    private readonly nest: NestLogger = new NestLogger('Relay'),
    private readonly bindings: LogContext = {},
  ) {}

  debug(message: string, context: LogContext = {}): void {
    this.nest.debug(format(message, { ...this.bindings, ...context }));
  }

  info(message: string, context: LogContext = {}): void {
    this.nest.log(format(message, { ...this.bindings, ...context }));
  }

  warn(message: string, context: LogContext = {}): void {
    this.nest.warn(format(message, { ...this.bindings, ...context }));
  }

  error(message: string, context: LogContext = {}): void {
    this.nest.error(format(message, { ...this.bindings, ...context }));
  }

  child(bindings: LogContext): Logger {
    return new NestEngineLogger(this.nest, { ...this.bindings, ...bindings });
  }
}
