import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import process from 'node:process';
import { checkPr217Source, BASE as CURRENT_BASE } from '../pr217Evidence.mjs';
import { PR193_BASE as PR193 } from '../pr194Evidence.mjs';
import { BASE as PR196 } from '../pr197Evidence.mjs';
import { BASE as PR200 } from '../pr201Evidence.mjs';

// Run unchanged historical commands/assertions against their merged source.
// The current engine has its own PR217 replay and full-match gates.
export function historicalReplayContext(command) {
  const name = command[2];
  const base =
    name === 'benchmark:pr193:replay'
      ? PR193
      : name === 'benchmark:pr196:replay'
        ? PR196
        : name === 'benchmark:pr200:source-replay' ||
            command.includes('scripts/probePr200Platform.mjs')
          ? PR200
          : undefined;
  if (!base) return null;
  checkPr217Source();
  mkdirSync('.benchmark-artifacts', { recursive: true });
  const scratch = mkdtempSync(resolve('.benchmark-artifacts/history-replay-'));
  const safe = () => assert.ok(resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep));
  const cleanup = () => {
    safe();
    rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  };
  try {
    const candidates = execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', base, 'docs/performance'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    )
      .trim()
      .split('\n');
    const inputs = [
      ...new Set(
        candidates
          .filter(
            (p) =>
              /^docs\/performance\/pr(188-traces|19[3-9]|200)\//.test(p) ||
              p.includes('PR188-match-dev-sw-state-value-v1-full-observed-final-v1'),
          )
          .map((p) =>
            p.startsWith('docs/performance/pr') ? p.split('/').slice(0, 3).join('/') : p,
          ),
      ),
    ];
    const tar = join(scratch, 'source.tar');
    const architecture = execFileSync(
      'git',
      ['ls-tree', '--name-only', base, 'docs/match-engine'],
      { encoding: 'utf8', windowsHide: true },
    ).trim();
    // Isolation must never hide edited working evidence. Validate the current
    // historical inputs against PR217's base before reading their older edition.
    execFileSync('git', ['diff', '--exit-code', CURRENT_BASE, '--', ...inputs], {
      stdio: 'inherit',
      windowsHide: true,
    });
    execFileSync(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        'archive',
        '--format=tar',
        `--output=${tar}`,
        base,
        'src',
        'scripts',
        'package.json',
        'package-lock.json',
        '.gitattributes',
        ...(architecture ? ['docs/match-engine'] : []),
        ...inputs,
      ],
      { windowsHide: true },
    );
    execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
    symlinkSync(
      resolve('node_modules'),
      join(scratch, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const env = {
      ...process.env,
      GIT_DIR: execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim(),
      GIT_WORK_TREE: scratch,
      GIT_INDEX_FILE: join(scratch, 'private.index'),
    };
    execFileSync('git', ['read-tree', base], { cwd: scratch, env, windowsHide: true });
    return { cwd: scratch, env, cleanup, source: base };
  } catch (error) {
    cleanup();
    throw error;
  }
}
