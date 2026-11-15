const fs = process.getBuiltinModule('node:fs');

const self = process.argv[1];
const config = JSON.parse(fs.readFileSync(`${self}.config.json`, 'utf8'));
const args = process.argv.slice(2);

function isAuthCall() {
  return (
    (args[0] === 'auth' && args[1] === 'status') || (args[0] === 'login' && args[1] === 'status')
  );
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function nextResponse() {
  const counterFile = `${self}.count`;
  const count = fs.existsSync(counterFile) ? Number(fs.readFileSync(counterFile, 'utf8')) : 0;
  fs.writeFileSync(counterFile, String(count + 1));
  const responses = config.responses ?? [];
  return responses[Math.min(count, responses.length - 1)] ?? { lines: [] };
}

function recordCall(stdin) {
  const mcpIndex = args.indexOf('--mcp-config');
  const mcpPath = mcpIndex >= 0 ? args[mcpIndex + 1] : null;
  const call = {
    pid: process.pid,
    args,
    stdin,
    cwd: process.cwd(),
    env: {
      RELAY_MAIL_MCP_BEARER_TOKEN: process.env.RELAY_MAIL_MCP_BEARER_TOKEN ?? null,
      RELAY_TEST_EXTRA: process.env.RELAY_TEST_EXTRA ?? null,
      RELAY_MAIL_MCP_TOKEN: process.env.RELAY_MAIL_MCP_TOKEN ?? null,
      RELAY_MAIL_MCP_HEADER_1: process.env.RELAY_MAIL_MCP_HEADER_1 ?? null,
    },
    mcpConfig: mcpPath === null ? null : fs.readFileSync(mcpPath, 'utf8'),
  };
  fs.appendFileSync(`${self}.calls.jsonl`, `${JSON.stringify(call)}\n`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (args[0] === '--version') {
    process.stdout.write(`${config.version ?? '0.0.0'}\n`);
    return;
  }
  if (isAuthCall()) {
    const auth = config.auth ?? { output: '', exitCode: 0 };
    process.stdout.write(`${auth.output}\n`);
    process.exitCode = auth.exitCode;
    return;
  }
  recordCall(readStdin());
  const response = nextResponse();
  if (response.spawnChild) {
    const child = process
      .getBuiltinModule('node:child_process')
      .spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
    fs.writeFileSync(`${self}.child.pid`, String(child.pid));
  }
  for (const line of response.lines) {
    process.stdout.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`);
    if (response.lineDelayMs) {
      await sleep(response.lineDelayMs);
    }
  }
  if (response.stderr) {
    process.stderr.write(response.stderr);
  }
  if (response.hangMs) {
    await sleep(response.hangMs);
  }
  process.exitCode = response.exitCode ?? 0;
}

void main();
