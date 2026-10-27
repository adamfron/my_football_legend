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
import { read, hash, BASE, argumentsMap } from './pr197Evidence.mjs';
const catalogue = {
  'long-baseline': [
    'long-pass-baseline-v6.json.gz',
    'benchmarkPr197LongPass.mjs',
    '--version=baseline-v6',
  ],
  'long-defence': [
    'long-pass-defence-v4.json.gz',
    'benchmarkPr197LongPass.mjs',
    '--version=defence-v4',
    '--defence',
  ],
  'long-combined': [
    'long-pass-combined-v5.json.gz',
    'benchmarkPr197LongPass.mjs',
    '--version=combined-v5',
    '--defence',
    '--height',
    '--receiver',
  ],
  families: ['families-v5.json.gz', 'benchmarkPr197Families.mjs', '--version=v5'],
  launch: ['launch-v1.json.gz', 'benchmarkPr197Launch.mjs', '--version=v1'],
  readiness: ['readiness-v1.json.gz', 'benchmarkPr197Readiness.mjs', '--version=v1'],
  autonomous: ['autonomous-v5.json.gz', 'benchmarkPr197Autonomous.mjs', '--version=v5'],
  candidates: ['candidates-v3.json.gz', 'benchmarkPr197Candidates.mjs', '--version=v3'],
  boundaries: [
    'candidate-boundaries-v2.json.gz',
    'benchmarkPr197CandidateBoundaries.mjs',
    '--version=v2',
  ],
  interception: ['interception-v2.json.gz', 'benchmarkPr197Interception.mjs', '--version=v2'],
  aerial: ['aerial-controls-v2.json.gz', 'benchmarkPr197AerialControls.mjs', '--version=v2'],
};
const requested = argumentsMap().get('case') ?? 'all';
const cases = requested === 'all' ? Object.keys(catalogue) : requested.split(',');
for (const key of cases) {
  const item = catalogue[key];
  if (!item) throw Error('Unknown exact-source case ' + key);
  const [receiptName, script, ...args] = item,
    recorded = read('docs/performance/pr197/' + receiptName).result.source,
    archive = read(recorded.path);
  if (hash(archive.manifest) !== recorded.fingerprint || archive.base !== BASE)
    throw Error('Source archive drift');
  const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr197-replay-'));
  const safe = () => {
    if (
      !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
      !basename(scratch).startsWith('mfl-pr197-replay-')
    )
      throw Error('Unsafe scratch');
  };
  const cleanup = () => {
    safe();
    for (const name of ['node_modules', 'docs']) {
      const path = join(scratch, name);
      try {
        if (!lstatSync(path).isSymbolicLink()) throw Error('Unsafe scratch link');
        rmSync(path, { recursive: true, force: true });
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
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
        !target.startsWith(resolve(scratch) + sep)
      )
        throw Error('Unsafe source path');
      if (hash(content) !== archive.manifest[path]) throw Error('Source content drift');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    for (const [path, digest] of Object.entries(archive.manifest))
      if (hash(readFileSync(join(scratch, path), 'utf8').replaceAll('\r\n', '\n')) !== digest)
        throw Error('Unrecoverable source ' + path);
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
        ...args,
        '--check',
      ],
      { cwd: scratch, stdio: 'inherit', windowsHide: true },
    );
    console.log('PR197 exact-source experiment PASS', key, recorded.fingerprint);
  } finally {
    cleanup();
  }
}
