import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync, lstatSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
const BASE = '5b6bbf6778017ac415964dd48dfe30b850f2f352';
export function pr201Context() {
  // These historical assertions include the old workflow family list and whole
  // research-tool inventory. Execute them verbatim against their original bytes.
  // Independently require all current engine and original harness bytes to agree.
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'src',
      'scripts',
      'package-lock.json',
      ':(exclude)scripts/ci/**',
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr202-pr201-check-'));
  const safe = () => {
    if (
      !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
      !basename(scratch).startsWith('mfl-pr202-pr201-check-')
    )
      throw Error('Unsafe historical check context');
  };
  const cleanup = () => {
    safe();
    for (const name of ['node_modules', '.git', 'docs/performance/pr201']) {
      const path = join(scratch, name);
      try {
        if (!lstatSync(path).isSymbolicLink()) throw Error('Unsafe historical context link');
        rmSync(path, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
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
        'docs/PR201_BOUNDED_PERCEPTION_RECEIVER_RECOVERY.md',
        'docs/match-engine',
        ...[195, 196, 197, 198, 199, 200].map((pr) => `docs/performance/pr${pr}`),
        '.github/workflows/ci.yml',
      ],
      { windowsHide: true },
    );
    execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
    for (const name of ['node_modules', '.git'])
      symlinkSync(
        resolve(name),
        join(scratch, name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    mkdirSync(join(scratch, 'docs/performance'), { recursive: true });
    // The archive materializes original Git bytes, including original line endings.
    symlinkSync(
      resolve('docs/performance/pr201'),
      join(scratch, 'docs/performance/pr201'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const env = {
      ...process.env,
      GIT_INDEX_FILE: join(scratch, 'private.index'),
      GIT_WORK_TREE: scratch,
      GIT_DIR: resolve('.git'),
    };
    execFileSync('git', ['read-tree', BASE], { cwd: scratch, env, windowsHide: true });
    return { cwd: scratch, env, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const context = pr201Context();
  try {
    if (!process.env.npm_execpath) throw Error('Run through npm so the npm CLI path is explicit');
    execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'benchmark:pr201:check'], {
      cwd: context.cwd,
      env: context.env,
      stdio: 'inherit',
      windowsHide: true,
    });
  } finally {
    context.cleanup();
  }
}
