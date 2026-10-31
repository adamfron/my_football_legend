// Preserve the original PR198 source-byte assertions after the opt-in PR207 extension.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { checkPr210Source } from '../pr210SourceGuard.mjs';
import { preserveHistoricalBytes } from './historicalBytes.mjs';
import { BASE } from '../pr207SourceGuard.mjs';

/** The historical PR198 check asserts the original foot solver's source bytes.
 * Execute the ORIGINAL npm command/assertions in merged PR206, where that contract
 * still holds. Current PR207 runtime/receipt and disabled-path checks stay separate. */
export function pr198Context() {
  checkPr210Source();
  mkdirSync('.benchmark-artifacts', { recursive: true });
  const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr198-check-'));
  const safe = () =>
    assert.ok(
      resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep) &&
        basename(scratch).startsWith('pr198-check-'),
    );
  const cleanup = () => {
    safe();
    rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
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
        'docs/performance/pr195',
        'docs/performance/pr196',
        'docs/performance/pr197',
        'docs/performance/pr198',
        'docs/match-engine/ASSUMPTIONS_REGISTER.md',
        'docs/PR198_RECEIVER_SYNCHRONISATION_AUTONOMOUS_OPPORTUNITIES_AND_EMERGENT_DISRUPTION.md',
      ],
      { windowsHide: true },
    );
    execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
    preserveHistoricalBytes(scratch);
    symlinkSync(
      resolve('node_modules'),
      join(scratch, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    // Git's working tree must be the export itself: ls-tree paths in the original
    // freezer must not inherit a .benchmark-artifacts/ subdirectory prefix.
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
  const context = pr198Context();
  try {
    assert.ok(process.env.npm_execpath, 'Run via npm so the original CLI command is explicit');
    execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'benchmark:pr198:check'], {
      cwd: context.cwd,
      env: context.env,
      stdio: 'inherit',
      windowsHide: true,
    });
  } finally {
    context.cleanup();
  }
}
