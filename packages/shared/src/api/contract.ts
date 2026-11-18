import type { EndpointDefinition } from './endpoint';
import { accountsEndpoints, oauthEndpoints } from './endpoints/accounts';
import { aiEndpoints } from './endpoints/ai';
import { attachmentsEndpoints } from './endpoints/attachments';
import { automationsEndpoints } from './endpoints/automations';
import { authEndpoints } from './endpoints/auth';
import { calendarEndpoints } from './endpoints/calendar';
import { composeEndpoints } from './endpoints/compose';
import { devicesEndpoints } from './endpoints/devices';
import { draftAttachmentsEndpoints } from './endpoints/draft-attachments';
import { foldersEndpoints } from './endpoints/folders';
import { googleCalendarEndpoints } from './endpoints/google-calendar';
import { healthEndpoints } from './endpoints/health';
import { labelsEndpoints } from './endpoints/labels';
import { settingsEndpoints } from './endpoints/settings';
import { splitsEndpoints } from './endpoints/splits';
import { syncEndpoints } from './endpoints/sync';
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
  folders: foldersEndpoints,
  compose: composeEndpoints,
  attachments: attachmentsEndpoints,
  draftAttachments: draftAttachmentsEndpoints,
  tasks: tasksEndpoints,
  splits: splitsEndpoints,
  automations: automationsEndpoints,
  settings: settingsEndpoints,
  sync: syncEndpoints,
  ai: aiEndpoints,
  calendar: calendarEndpoints,
  googleCalendar: googleCalendarEndpoints,
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
