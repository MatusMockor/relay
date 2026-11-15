import { powerMonitor } from 'electron';
import type { PowerEvents, PowerListener } from './power-events';

export class ElectronPowerEvents implements PowerEvents {
  onSuspend(listener: PowerListener): () => void {
    powerMonitor.on('suspend', listener);
    return () => {
      powerMonitor.off('suspend', listener);
    };
  }

  onResume(listener: PowerListener): () => void {
    powerMonitor.on('resume', listener);
    return () => {
      powerMonitor.off('resume', listener);
    };
  }
}
