import type { Clock, Logger } from '@relay/engine';
import type { CommandRunner } from './command-runner';
import type { FileQuarantine } from './file-quarantine';

const XATTR = '/usr/bin/xattr';
const ATTRIBUTE = 'com.apple.quarantine';
const DOWNLOADED_FLAGS = '0081';

export class XattrFileQuarantine implements FileQuarantine {
  constructor(
    private readonly platform: NodeJS.Platform,
    private readonly agent: string,
    private readonly run: CommandRunner,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async mark(path: string): Promise<void> {
    if (this.platform !== 'darwin') {
      return;
    }
    const seconds = Math.floor(this.clock.now().getTime() / 1000).toString(16);
    const value = `${DOWNLOADED_FLAGS};${seconds};${this.agent};`;
    await this.run(XATTR, ['-w', ATTRIBUTE, value, path]).catch((error: unknown) => {
      this.logger.warn('Failed to quarantine an opened attachment', { path, error });
    });
  }
}
