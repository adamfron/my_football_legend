import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// Same canonical suite/flags on Windows and POSIX; no shell-specific `test` or env assignment.
const run = (args, env = process.env) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
if (!existsSync('.generated-public/data/world/pl-2026-v2.json')) {
  run([
    '--experimental-transform-types',
    '--import',
    './scripts/registerTypescriptLoader.mjs',
    'scripts/generateWorldDatabase.ts',
  ]);
}
const soak = process.argv.includes('--soak');
run(
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    'src/core/fullCareerSimulation.test.ts',
    '--pool=threads',
    ...(soak ? ['--reporter=verbose'] : []),
  ],
  { ...process.env, MFL_FULL_CAREER_SOAK: soak ? '1' : '0' },
);
