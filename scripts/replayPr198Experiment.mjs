import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  symlinkSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, dirname, basename } from 'node:path';
import { read, hash, BASE, args } from './pr198Evidence.mjs';
import { catalogue, groups } from './pr198Catalogue.mjs';
const options = args(),
  requested = options.get('case') ?? 'all';
const selected =
  requested === 'all' ? Object.keys(catalogue) : (groups[requested] ?? requested.split(','));
for (const key of selected) {
  const item = catalogue[key];
  if (!item) throw Error('Unknown PR198 source replay: ' + key);
  const [name, script, ...parameters] = item,
    recorded = read('docs/performance/pr198/' + name).result.source,
    archive = read(recorded.path);
  if (archive.base !== BASE || hash(archive.manifest) !== recorded.fingerprint)
    throw Error('PR198 archive identity');
  const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr198-replay-'));
  const safe = () => {
    if (
      !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
      !basename(scratch).startsWith('mfl-pr198-replay-')
    )
      throw Error('Unsafe PR198 scratch');
  };
  const cleanup = () => {
    safe();
    for (const name of ['node_modules', 'docs']) {
      const path = join(scratch, name);
      try {
        if (!lstatSync(path).isSymbolicLink()) throw Error('Unsafe PR198 scratch link');
        rmSync(path, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    rmSync(scratch, { recursive: true, force: true });
  };
  safe();
  try {
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
      ],
      { windowsHide: true },
    );
    execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
    for (const [path, content] of Object.entries(archive.contents)) {
      const target = resolve(scratch, path);
      if (
        !/^(src\/(core|schemas|types)\/|scripts\/|package-lock\.json$)/.test(path) ||
        !target.startsWith(resolve(scratch) + sep) ||
        hash(content) !== archive.manifest[path]
      )
        throw Error('Unsafe or corrupt PR198 source: ' + path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    for (const [path, digest] of Object.entries(archive.manifest))
      if (hash(readFileSync(join(scratch, path), 'utf8').replaceAll('\r\n', '\n')) !== digest)
        throw Error('Unrecoverable PR198 source: ' + path);
    for (const name of ['node_modules', 'docs'])
      symlinkSync(
        resolve(name),
        join(scratch, name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        ...parameters,
        '--check',
      ],
      { cwd: scratch, stdio: 'inherit', windowsHide: true },
    );
    console.log('PR198 exact-source PASS', key, recorded.fingerprint);
  } finally {
    cleanup();
  }
}
