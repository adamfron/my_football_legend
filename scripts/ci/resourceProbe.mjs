import process from 'node:process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Observe each Node process independently, including archived replay grandchildren.
// No harness imports, globals or deterministic state are changed by this observer.
const started = process.hrtime.bigint();
process.once('exit', (exitCode) => {
  if (!process.env.MFL_CI_RESOURCES) return;
  const usage = process.resourceUsage();
  writeFileSync(
    join(process.env.MFL_CI_RESOURCES, `${process.pid}.json`),
    JSON.stringify({
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
    }) + '\n',
  );
});
