import { describe, expect, it } from 'vitest';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { remoteOld, setupRemoteBodies } from '../support/remote-bodies';
import { USER_ID } from '../support/test-engine';

interface ConnectGate {
  readonly reached: Promise<void>;
  release: () => void;
}

const gateNextConnect = (server: FakeMailServer): ConnectGate => {
  let reach: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const gate: ConnectGate = { reached, release: () => undefined };
  const opened = new Promise<void>((resolve) => {
    gate.release = resolve;
  });
  server.beforeNextConnect = () => {
    reach();
    return opened;
  };
  return gate;
};

describe('Lingering read sessions shutdown', () => {
  it('closes a connection that was still opening when the sessions shut down', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    const gate = gateNextConnect(seeded.server);
    const reading = engine.services.bodies.get(USER_ID, remoteOld(engine, 0).id);
    await gate.reached;

    const closing = engine.services.readSessions.closeAll();
    gate.release();
    await closing;

    await expect(reading).resolves.toEqual({ status: 'offline' });
    expect(seeded.server.openConnections).toBe(0);
    expect(engine.services.readSessions.openCount()).toBe(0);
    expect(engine.timer.intervals).toEqual([]);
  });

  it('refuses to open new sessions after shutdown', async () => {
    const { engine, seeded } = await setupRemoteBodies();
    await engine.services.bodies.get(USER_ID, remoteOld(engine, 1).id);
    await engine.services.readSessions.closeAll();
    const connections = seeded.server.connections;

    await expect(engine.services.bodies.get(USER_ID, remoteOld(engine, 2).id)).resolves.toEqual({
      status: 'offline',
    });
    expect(seeded.server.connections).toBe(connections);
    expect(seeded.server.openConnections).toBe(0);
  });
});
