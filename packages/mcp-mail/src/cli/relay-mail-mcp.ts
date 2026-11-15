import { runRelayMailMcp } from './run-relay-mail-mcp';

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`relay-mail-mcp: ${message}\n`);
  process.exit(1);
}

try {
  const running = await runRelayMailMcp({ argv: process.argv.slice(2), env: process.env });
  running.backend.onClose(() => process.exit(0));
  process.stdin.on('end', () => {
    void running.close().then(() => process.exit(0));
  });
} catch (error) {
  fail(error);
}
