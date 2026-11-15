import type { EndpointDefinition } from './endpoint';
import { accountsEndpoints, oauthEndpoints } from './endpoints/accounts';
import { aiEndpoints } from './endpoints/ai';
import { attachmentsEndpoints } from './endpoints/attachments';
import { authEndpoints } from './endpoints/auth';
import { composeEndpoints } from './endpoints/compose';
import { devicesEndpoints } from './endpoints/devices';
import { healthEndpoints } from './endpoints/health';
import { labelsEndpoints } from './endpoints/labels';
import { settingsEndpoints } from './endpoints/settings';
import { splitsEndpoints } from './endpoints/splits';
import { tasksEndpoints } from './endpoints/tasks';
import { threadsEndpoints } from './endpoints/threads';

export const api = {
  health: healthEndpoints,
  auth: authEndpoints,
  devices: devicesEndpoints,
  accounts: accountsEndpoints,
  oauth: oauthEndpoints,
  threads: threadsEndpoints,
  labels: labelsEndpoints,
  compose: composeEndpoints,
  attachments: attachmentsEndpoints,
  tasks: tasksEndpoints,
  splits: splitsEndpoints,
  settings: settingsEndpoints,
  ai: aiEndpoints,
} as const;

export type ApiContract = typeof api;
export type ApiArea = keyof ApiContract;

export interface NamedEndpoint {
  readonly area: ApiArea;
  readonly name: string;
  readonly endpoint: EndpointDefinition;
}

export const listEndpoints = (): NamedEndpoint[] =>
  Object.entries(api).flatMap(([area, endpoints]) =>
    Object.entries(endpoints).map(([name, endpoint]: [string, EndpointDefinition]) => ({
      area: area as ApiArea,
      name,
      endpoint,
    })),
  );
