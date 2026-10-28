import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
import { digest, json, validateManifest, checkEvidence } from './manifest.mjs';
import { pr201Context } from './replayPr201Check.mjs';

export function stopTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      child.kill('SIGKILL');
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* Already exited. */
    }
  }
}
export async function runChild(command, options = {}) {
  const child = spawn(command[0], command.slice(1), {
    stdio: options.stdio ?? 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: options.env ?? process.env,
    cwd: options.cwd,
  });
  let timedOut = false,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
    stopTree(child);
  };
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(
    () => {
      timedOut = true;
      stopTree(child);
    },
    options.timeoutMs ?? 30 * 60 * 1000,
  );
  const result = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ error: String(error), exitCode: null, signal: null }));
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  clearTimeout(timer);
  process.removeListener('SIGTERM', cancel);
  process.removeListener('SIGINT', cancel);
  options.signal?.removeEventListener('abort', cancel);
  return {
    ...result,
    timedOut,
    cancelled,
    success: result.exitCode === 0 && !timedOut && !cancelled && !result.error,
  };
}
async function main() {
  const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const m = validateManifest(json('docs/performance/pr202/task-manifest.json'));
  const layout = args.get('layout') ?? 'proposed';
  assert.ok(['original', 'proposed'].includes(layout));
  const group = m[layout].find((g) => g.id === args.get('group'));
  assert.ok(group, 'Unknown or empty CI group');
  const selected = group.tasks.map((id) => m.tasks.find((t) => t.id === id));
  const os = process.platform === 'win32' ? 'windows-2025' : 'ubuntu-latest';
  const platformParity = args.has('platform-parity') && group.id.startsWith('source-');
  if (!platformParity) assert.equal(selected[0].os, os, 'Wrong platform for task');
  assert.equal(
    selected[0].node === '24' ? process.versions.node.split('.')[0] : process.versions.node,
    selected[0].node,
  );
  const output = resolve(
    args.get('output') ?? `.benchmark-artifacts/pr202/${layout}-${group.id.replaceAll(':', '_')}`,
  );
  mkdirSync(output, { recursive: true });
  const report = {
    schema: 'pr202-group-execution-v1',
    layout,
    group: group.id,
    head: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    actionsHead: process.env.GITHUB_SHA ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    node: process.version,
    platform: process.platform,
    platformParity,
    runnerOS: process.env.RUNNER_OS ?? null,
    manifestSha256: digest(readFileSync('docs/performance/pr202/task-manifest.json')),
    startedAt: new Date().toISOString(),
    status: 'running',
    tasks: [],
  };
  const save = () =>
    writeFileSync(join(output, 'group.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  const start = performance.now();
  for (const task of selected) {
    const entry = {
      id: task.id,
      command: task.command,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    report.tasks.push(entry);
    save();
    const resources = join(output, `processes-${report.tasks.length}`);
    mkdirSync(resources, { recursive: true });
    const taskStart = performance.now();
    try {
      for (const c of task.cases) checkEvidence(c.receipt);
      let command = task.command;
      if (command[0] === 'file-exists') {
        assert.ok(existsSync(command[1]), 'Required build artifact missing');
        entry.exitCode = 0;
      } else {
        if (command[0] === 'npm') {
          assert.ok(process.env.npm_execpath, 'Run via npm run ci:group so npm CLI is explicit');
          command = [process.execPath, process.env.npm_execpath, ...command.slice(1)];
        } else if (command[0] === 'node') command = [process.execPath, ...command.slice(1)];
        console.log('CI task START', task.id, JSON.stringify(task.command));
        const context = task.command[2] === 'benchmark:pr201:check' ? pr201Context() : null;
        let result;
        try {
          result = await runChild(command, {
            cwd: context?.cwd,
            timeoutMs: Math.max(1, task.timeoutMinutes * 60000 - (performance.now() - start)),
            env: {
              ...(context?.env ?? process.env),
              MFL_CI_RESOURCES: resources,
              NODE_OPTIONS:
                `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(resolve('scripts/ci/resourceProbe.mjs')).href}`.trim(),
            },
          });
        } finally {
          context?.cleanup();
        }
        Object.assign(entry, result);
        assert.ok(result.success, `Child failed: ${task.id}`);
      }
      for (const c of task.cases) checkEvidence(c.receipt);
      entry.status = 'success';
    } catch (error) {
      entry.status = 'failure';
      entry.error = String(error);
      report.status = 'failure';
    } finally {
      entry.wallSeconds = (performance.now() - taskStart) / 1000;
      const samples = readdirSync(resources)
        .filter((n) => n.endsWith('.json'))
        .map((n) => json(join(resources, n)));
      entry.nodeProcesses = samples.length;
      entry.maxNodeProcessRSSKiB = samples.length
        ? Math.max(...samples.map((s) => s.peakRSSKiB))
        : null;
      entry.sumNodeCPUMicros = samples.length
        ? samples.reduce((s, p) => s + p.cpuUserMicros + p.cpuSystemMicros, 0)
        : null;
      entry.completedAt = new Date().toISOString();
      save();
    }
    if (entry.status !== 'success') break;
  }
  report.wallSeconds = (performance.now() - start) / 1000;
  report.completedAt = new Date().toISOString();
  report.status =
    report.tasks.length === selected.length && report.tasks.every((t) => t.status === 'success')
      ? 'success'
      : 'failure';
  save();
  console.log('CI group', group.id, report.status, report.wallSeconds);
  if (report.status !== 'success') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/ci/runGroup.mjs'))
  await main();
