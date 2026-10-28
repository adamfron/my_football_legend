import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  symlinkSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  lstatSync,
  existsSync,
} from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join, resolve, sep, dirname, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { ROOT, BASE, read, hash, options, write } from './pr201Evidence.mjs';
const baselineRuntime = options.has('baseline-runtime');
const baseline = baselineRuntime ? read(`${ROOT}/frozen-pr200.json`) : null;
const available = readdirSync(ROOT).filter((n) => n.endsWith('.json.gz'));
const requested =
  options.get('case')?.split(',') ?? available.map((n) => n.replace('.json.gz', ''));
for (const key of requested) {
  if (!/^[a-z0-9-]+$/.test(key)) throw Error('Unsafe replay key');
  const path = key.startsWith('match-')
    ? `${ROOT}/matches/${key.slice(6)}.json.gz`
    : `${ROOT}/${key}.json.gz`;
  const record = read(path).result,
    archive = read(record.source.path);
  if (archive.base !== BASE || hash(archive.manifest) !== record.source.fingerprint)
    throw Error('PR201 archive identity');
  if (baselineRuntime && (!key.startsWith('match-') || record.profile !== 'canonical-pr199'))
    throw Error('Final-main baseline verification requires a canonical match');
  const manifest = baselineRuntime
    ? Object.fromEntries(
        Object.entries(archive.manifest).map(([p, d]) => [
          p,
          p.startsWith('src/') ? baseline.source[p] : d,
        ]),
      )
    : archive.manifest;
  if (Object.values(manifest).some((d) => !d)) throw Error('Unversioned baseline source');
  const runtimeSource = {
    base: BASE,
    fingerprint: hash(manifest),
    path: `${ROOT}/source/${hash(manifest)}.json.gz`,
  };
  if (baselineRuntime && !existsSync(runtimeSource.path)) {
    try {
      write(runtimeSource.path, {
        base: BASE,
        manifest,
        contents: Object.fromEntries(
          Object.entries(archive.contents).filter(([p]) => !p.startsWith('src/')),
        ),
      });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  const started = performance.now();
  const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr201-replay-'));
  const safe = () => {
    if (
      !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
      !basename(scratch).startsWith('mfl-pr201-replay-')
    )
      throw Error('Unsafe replay directory');
  };
  safe();
  const cleanup = () => {
    safe();
    for (const name of ['node_modules', 'docs', '.git']) {
      const path = join(scratch, name);
      try {
        if (!lstatSync(path).isSymbolicLink()) throw Error('Unsafe replay link');
        rmSync(path, { recursive: true, force: true });
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    rmSync(scratch, { recursive: true, force: true });
  };
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
    for (const [p, content] of Object.entries(archive.contents)) {
      const target = resolve(scratch, p);
      if (
        !/^(src\/(core|schemas|types)\/|scripts\/|package(?:-lock)?\.json$)/.test(p) ||
        !target.startsWith(resolve(scratch) + sep) ||
        hash(content) !== archive.manifest[p]
      )
        throw Error('Unsafe source reconstruction');
      if (baselineRuntime && p.startsWith('src/')) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    for (const [p, digest] of Object.entries(manifest))
      if (hash(readFileSync(join(scratch, p), 'utf8').replaceAll('\r\n', '\n')) !== digest)
        throw Error('Source bytes drift');
    for (const name of ['node_modules', 'docs', '.git'])
      symlinkSync(
        resolve(name),
        join(scratch, name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    let script,
      args = [],
      lab = false;
    if (key.startsWith('receivers-')) {
      script = 'benchmarkPr201Receivers.mjs';
      args = [`--mode=${record.mode}`];
      lab = true;
    } else if (key.startsWith('goalkeepers-')) {
      script = 'benchmarkPr201Goalkeepers.mjs';
      args = [`--version=${key.split('-').at(-1)}`];
    } else if (key.startsWith('information-')) {
      script = 'benchmarkPr201Information.mjs';
      args = [`--version=${key.slice('information-boundary-'.length)}`];
    } else if (key.startsWith('match-')) {
      script = 'benchmarkPr201Matches.mjs';
      args = [
        `--design=${record.design}`,
        `--policy=${record.policy}`,
        `--profile=${record.profile}`,
      ];
    } else throw Error('Unknown replay case');
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        lab ? './scripts/registerPr199Lab.mjs' : './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        ...args,
        `--check=${path}`,
      ],
      { cwd: scratch, stdio: 'inherit', windowsHide: true },
    );
    if (baselineRuntime) {
      const proofPath = `${ROOT}/baseline-final-pr200/${record.design}-${record.policy}.json`;
      const proof = {
        schema: 'pr201-final-main-baseline-v1',
        base: BASE,
        source: runtimeSource,
        comparison: path,
        initialHash: record.initialHash,
        finalHash: record.finalHash,
        wallSeconds: (performance.now() - started) / 1000,
        node: process.version,
        platform: process.platform,
        qualification:
          'All src runtime bytes are merged PR200; archived measurement harness unchanged. The complete result and final-state hash must equal the PR201 canonical record. Intermediate PR200 v1 metadata receipts remain independently reproduced without modification.',
      };
      if (existsSync(proofPath)) {
        const { wallSeconds: previousWall, ...previous } = read(proofPath);
        const { wallSeconds: currentWall, ...current } = proof;
        assert.ok(previousWall > 0 && currentWall > 0);
        assert.deepEqual(current, previous, 'Final-main baseline proof drift');
      } else write(proofPath, proof);
      console.log('PR200 final-main runtime / complete-state equality PASS', key);
    } else console.log('PR201 exact-source/full-state replay PASS', key);
  } finally {
    cleanup();
  }
}
