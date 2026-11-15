import { ForbiddenError } from '@relay/engine';
import type { AiRunnerLocation } from '@relay/shared/domain';

export type AiLocationSource = () => Promise<AiRunnerLocation>;

export class AiLocationGate {
  constructor(private readonly location: AiLocationSource) {}

  async assertLocal(): Promise<void> {
    if ((await this.location()) === 'local') {
      return;
    }
    throw new ForbiddenError(
      'AI je nastavená na beh na serveri. Lokálne spúšťanie zapnete v Nastavenia → AI.',
    );
  }

  async isLocal(): Promise<boolean> {
    return (await this.location()) === 'local';
  }
}
