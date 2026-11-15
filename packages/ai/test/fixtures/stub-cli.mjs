#!/usr/bin/env node
const prompt = process.argv.slice(2).join(' ');
const lines = [
  { type: 'system', subtype: 'init', model: 'stub' },
  { type: 'assistant', text: `echo: ${prompt}` },
  { type: 'result', subtype: 'success', result: `echo: ${prompt}` },
];
for (const line of lines) {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
