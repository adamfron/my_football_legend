import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { hash, options, source } from './pr199Evidence.mjs';
const group = options.get('group') ?? 'historical';
const groups = {
  historical: [
    'benchmark:pr195:check',
    'benchmark:pr196:historical',
    'benchmark:pr196:check',
    'benchmark:pr196:replay',
    'benchmark:pr197:check',
    'benchmark:pr197:replay',
    'benchmark:pr197:source-replay',
    'benchmark:pr198:check',
    'benchmark:pr198:replay',
    'benchmark:pr198:source-replay',
  ],
  verify: ['verify'],
  repair: ['benchmark:pr197:check'],
  pr199: ['benchmark:pr199:check', 'benchmark:pr199:replay', 'benchmark:realism:check'],
};
if (!groups[group]) throw Error('Unknown verification group');
const npm = process.env.npm_execpath;
if (!npm) throw Error('Run this coordinator with npm so child npm invocations use the same CLI');
const directory = resolve(options.get('output') ?? '../pr199-verification');
mkdirSync(directory, { recursive: true });
const rows = [];
for (const command of groups[group]) {
  const startedAt = new Date().toISOString(),
    sourceBefore = hash(source()),
    chunks = [];
  console.log('PR199 verification START', command);
  const result = await new Promise((done, fail) => {
    const child = spawn(process.execPath, [npm, 'run', command], {
      windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: '--max-semi-space-size=64' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (b) => chunks.push(b));
    child.stderr.on('data', (b) => chunks.push(b));
    child.on('error', fail);
    child.on('exit', (code, signal) => done({ code, signal }));
  });
  const data = Buffer.concat(chunks),
    name = `${command.replaceAll(':', '-')}.log.gz`;
  writeFileSync(resolve(directory, name), gzipSync(data), { flag: 'wx' });
  rows.push({
    command: `npm run ${command}`,
    startedAt,
    endedAt: new Date().toISOString(),
    ...result,
    log: name,
    sha256: hash(data),
    sourceBefore,
    sourceAfter: hash(source()),
  });
  writeFileSync(resolve(directory, `${group}.json`), JSON.stringify(rows, null, 2) + '\n');
  console.log('PR199 verification END', command, result.code);
  if (result.code !== 0) console.log(data.toString().slice(-5000));
}
if (rows.some((r) => r.code !== 0)) process.exitCode = 1;
