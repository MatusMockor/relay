import type { RendererView } from './renderer-view';

export interface SessionHostWindow {
  on(event: 'closed', listener: () => void): unknown;
  readonly webContents: {
    on(event: 'did-start-loading' | 'render-process-gone', listener: () => void): unknown;
  };
}

export const trackRendererSession = (
  window: SessionHostWindow,
  view: Pick<RendererView, 'endSession'>,
): void => {
  const end = () => {
    view.endSession();
  };
  window.on('closed', end);
  window.webContents.on('did-start-loading', end);
  window.webContents.on('render-process-gone', end);
};
