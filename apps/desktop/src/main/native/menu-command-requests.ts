import type { MenuCommand } from '@relay/shared/ipc';
import { LatestRequestFeed } from '../events/latest-request-feed';

const MAX_BUFFERED_COMMANDS = 10;
const MAX_PENDING_COMMANDS = 10;

export class MenuCommandRequests {
  private readonly feed = new LatestRequestFeed<MenuCommand>(
    MAX_BUFFERED_COMMANDS,
    MAX_PENDING_COMMANDS,
  );

  request(command: MenuCommand): void {
    this.feed.request(command);
  }

  stream(signal: AbortSignal): AsyncGenerator<MenuCommand> {
    return this.feed.stream(signal);
  }
}
