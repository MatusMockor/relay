const OWNS_PROCESS_GROUP = process.platform !== 'win32';

export function ownsProcessGroup(): boolean {
  return OWNS_PROCESS_GROUP;
}

export function reapProcessGroup(pid: number | undefined, forceKillAfterMs: number): void {
  if (!signalGroup(pid, 'SIGTERM')) {
    return;
  }
  setTimeout(() => {
    signalGroup(pid, 'SIGKILL');
  }, forceKillAfterMs).unref();
}

function signalGroup(pid: number | undefined, signal: NodeJS.Signals): boolean {
  if (!OWNS_PROCESS_GROUP || pid === undefined) {
    return false;
  }
  try {
    process.kill(-pid, signal);
    return true;
  } catch (_error) {
    return false;
  }
}
