// Run the unmodified PR209 assertions against merged PR209, never rebind its receipt.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import { preserveHistoricalBytes } from './historicalBytes.mjs';
import { BASE } from '../pr210SourceGuard.mjs';
import { checkPr213Source } from '../pr213Evidence.mjs';
export function pr209Context() {
  checkPr213Source();
  mkdirSync('.benchmark-artifacts', { recursive: true });
  const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr209-check-'));
  const safe = () => assert.ok(resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep));
  const links = ['node_modules'];
  const cleanup = () => {
    safe();
    for (const name of links) rmSync(join(scratch, name), { force: true, recursive: true });
    rmSync(scratch, { force: true, recursive: true });
  };
  try {
    safe();
    const tar = join(scratch, 'source.tar');
    execFileSync(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        'archive',
        '--format=tar',
        `--output=${tar}`,
        BASE,
        'src',
        'scripts',
        'package.json',
        'package-lock.json',
        '.gitattributes',
        // Git must see real historical files. It does not traverse a docs symlink
        // on Linux when checking the original PR209 evidence against its base.
        ...Array.from({ length: 15 }, (_, i) => `docs/performance/pr${195 + i}`),
      ],
      { windowsHide: true },
    );
    execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
    preserveHistoricalBytes(scratch);
    for (const name of links)
      symlinkSync(
        resolve(name),
        join(scratch, name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    const env = {
      ...process.env,
      GIT_DIR: resolve('.git'),
      GIT_WORK_TREE: scratch,
      GIT_INDEX_FILE: join(scratch, 'private.index'),
    };
    execFileSync('git', ['read-tree', BASE], { cwd: scratch, env, windowsHide: true });
    return { cwd: scratch, env, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const context = pr209Context();
  try {
    execFileSync(
      process.execPath,
      [
        'scripts/checkPr209Evidence.mjs',
        ...(process.argv.includes('--replay') ? ['--replay'] : []),
      ],
      { cwd: context.cwd, env: context.env, stdio: 'inherit', windowsHide: true },
    );
    console.log('Original merged PR209 source/evidence PASS');
  } finally {
    context.cleanup();
  }
}
