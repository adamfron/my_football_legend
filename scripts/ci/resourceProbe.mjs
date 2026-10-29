import process from 'node:process';
import fs from 'node:fs';
import { join } from 'node:path';
import { isMainThread } from 'node:worker_threads';

const resourceIO = Object.freeze({ writeFileSync: fs.writeFileSync, renameSync: fs.renameSync });
export function publishNodeResource(directory, identity, record, io = resourceIO) {
  const target = join(directory, `${identity}.json`);
  const temporary = `${target}.tmp`;
  io.writeFileSync(temporary, JSON.stringify(record) + '\n');
  io.renameSync(temporary, target);
}

// Observe each Node process independently, including archived replay grandchildren.
// No harness imports, globals or deterministic state are changed by this observer.
const started = process.hrtime.bigint();
process.once('exit', (exitCode) => {
  if (!isMainThread || !process.env.MFL_CI_RESOURCES) return;
  const usage = process.resourceUsage();
  publishNodeResource(process.env.MFL_CI_RESOURCES, `${process.pid}-${started}`, {
    pid: process.pid,
    parentPid: process.ppid,
    argv: process.argv,
    node: process.version,
    platform: process.platform,
    exitCode,
    wallSeconds: Number(process.hrtime.bigint() - started) / 1e9,
    cpuUserMicros: usage.userCPUTime,
    cpuSystemMicros: usage.systemCPUTime,
    peakRSSKiB: usage.maxRSS,
  });
});
