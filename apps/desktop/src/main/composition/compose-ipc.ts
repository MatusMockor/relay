import { createAppInfoHandler, type AppMetadata } from '../handlers/app-info';
import { IpcInvokeRouter } from '../ipc/invoke-router';
import type { IpcRouters } from '../ipc/register-ipc';
import { IpcStreamRouter } from '../ipc/stream-router';

export interface MainProcessContext {
  readonly app: AppMetadata;
}

export const composeIpc = (context: MainProcessContext): IpcRouters => ({
  invoke: new IpcInvokeRouter({
    'app.getInfo': createAppInfoHandler(context.app),
  }),
  streams: new IpcStreamRouter({}),
});
