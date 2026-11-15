import { z } from 'zod';
import { API_VERSION } from '../api/endpoints/health';
import { ApiErrorCodeSchema } from '../api/errors';
import { DeviceIdSchema, UserIdSchema } from '../domain/ids';
import { RealtimeEventSchema } from './events';

export const REALTIME_PATH = '/realtime';

export const ClientHelloMessageSchema = z.object({
  type: z.literal('hello'),
  apiVersion: z.literal(API_VERSION),
  accessToken: z.string().min(1),
});

export const ClientPingMessageSchema = z.object({
  type: z.literal('ping'),
  nonce: z.string().max(64),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  ClientHelloMessageSchema,
  ClientPingMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerWelcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  userId: UserIdSchema,
  deviceId: DeviceIdSchema,
});

export const ServerPongMessageSchema = z.object({
  type: z.literal('pong'),
  nonce: z.string().max(64),
});

export const ServerErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: ApiErrorCodeSchema,
  message: z.string(),
});

export const ServerEventMessageSchema = z.object({
  type: z.literal('event'),
  event: RealtimeEventSchema,
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  ServerWelcomeMessageSchema,
  ServerPongMessageSchema,
  ServerErrorMessageSchema,
  ServerEventMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
