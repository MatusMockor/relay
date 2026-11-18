import type { MenuCommand, MenuCommandKind } from '@relay/shared/ipc';
import { EventHub } from '../events/event-hub';
import { streamHub } from '../events/hub-stream';

const MAX_BUFFERED_COMMANDS = 10;

export class MenuCommandRequests {
  private readonly hub = new EventHub<MenuCommand>();

  request(command: MenuCommandKind): void {
    this.hub.publish({ command });
  }

  stream(signal: AbortSignal): AsyncGenerator<MenuCommand> {
    return streamHub(this.hub, signal, MAX_BUFFERED_COMMANDS);
  }
}
