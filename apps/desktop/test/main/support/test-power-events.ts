import { EventHub } from '../../../src/main/events/event-hub';
import type { PowerEvents, PowerListener } from '../../../src/main/platform/power-events';

export class TestPowerEvents implements PowerEvents {
  private readonly suspend = new EventHub<null>();
  private readonly resume = new EventHub<null>();

  onSuspend(listener: PowerListener): () => void {
    return this.suspend.subscribe(listener);
  }

  onResume(listener: PowerListener): () => void {
    return this.resume.subscribe(listener);
  }

  emitSuspend(): void {
    this.suspend.publish(null);
  }

  emitResume(): void {
    this.resume.publish(null);
  }
}
