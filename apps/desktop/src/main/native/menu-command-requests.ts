import type { MenuCommand, MenuCommandKind } from '@relay/shared/ipc';
import { LatestRequestFeed } from '../events/latest-request-feed';

const MAX_BUFFERED_COMMANDS = 10;

export class MenuCommandRequests {
  private readonly feed = new LatestRequestFeed<MenuCommand>(MAX_BUFFERED_COMMANDS);

  request(command: MenuCommandKind): void {
    this.feed.request({ command });
  }

  stream(signal: AbortSignal): AsyncGenerator<MenuCommand> {
    return this.feed.stream(signal);
  }
}
