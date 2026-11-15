import type { z } from 'zod';

export interface IpcInvokeDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
> {
  readonly input: Input;
  readonly output: Output;
}

export interface IpcStreamDefinition<
  Input extends z.ZodType = z.ZodType,
  Event extends z.ZodType = z.ZodType,
> {
  readonly input: Input;
  readonly event: Event;
}

export const invokeChannel = <Input extends z.ZodType, Output extends z.ZodType>(
  input: Input,
  output: Output,
): IpcInvokeDefinition<Input, Output> => ({ input, output });

export const streamChannel = <Input extends z.ZodType, Event extends z.ZodType>(
  input: Input,
  event: Event,
): IpcStreamDefinition<Input, Event> => ({ input, event });
