import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  symlinkSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, dirname, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { ROOT, BASE, read, hash } from './pr200Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const cases = {
  information: ['information-boundary-final-v1.json.gz', 'benchmarkPr200Information.mjs'],
  frozen: ['local-frozen-v1.json.gz', 'benchmarkPr200Local.mjs', '--mode=frozen', 'lab'],
  changed: ['local-changed-v1.json.gz', 'benchmarkPr200Local.mjs', '--mode=changed', 'lab'],
  fresh: ['local-fresh-v1.json.gz', 'benchmarkPr200Local.mjs', '--mode=fresh', 'lab'],
  keepers: ['goalkeepers-v1.json.gz', 'benchmarkPr200Goalkeepers.mjs'],
  'keepers-v2': ['goalkeepers-v2.json.gz', 'benchmarkPr200Goalkeepers.mjs', '--version=v2'],
  'keepers-v3': ['goalkeepers-v3.json.gz', 'benchmarkPr200Goalkeepers.mjs', '--version=v3'],
  'frozen-final': [
    'local-frozen-final-v1.json.gz',
    'benchmarkPr200Local.mjs',
    '--mode=frozen',
    'lab',
  ],
  'fresh-final': ['local-fresh-final-v1.json.gz', 'benchmarkPr200Local.mjs', '--mode=fresh', 'lab'],
  'diagnosis-final': [
    'local-bounded-diagnosis-final-v1.json.gz',
    'benchmarkPr200Local.mjs',
    '--mode=bounded-diagnosis',
    'lab',
  ],
  diagnosis: [
    'local-bounded-diagnosis-v1.json.gz',
    'benchmarkPr200Local.mjs',
    '--mode=bounded-diagnosis',
    'lab',
  ],
  smoke: [
    'prefix/ww-state-value-v1-realism-candidate-v0-smoke-v1.json.gz',
    'benchmarkPr200Matches.mjs',
    '--seconds=20',
  ],
};
const matchCases = readdirSync(`${ROOT}/matches`).filter((n) => n.endsWith('.json.gz'));
for (const name of matchCases) {
  const r = read(`${ROOT}/matches/${name}`).result;
  cases[`match-${name.replace('.json.gz', '')}`] = [
    `matches/${name}`,
    'benchmarkPr200Matches.mjs',
    `--design=${r.design}`,
    `--policy=${r.policy}`,
    `--profile=${r.profile}`,
  ];
}
const requested =
  args.get('case') ??
  'frozen,changed,fresh,keepers,keepers-v2,diagnosis,smoke,frozen-final,fresh-final,diagnosis-final,keepers-v3,information';
let selected = requested.startsWith('matches-')
  ? Object.keys(cases).filter((k) => k.startsWith(`match-${requested.slice(8)}-`))
  : requested === 'matches'
    ? Object.keys(cases).filter((k) => k.startsWith('match-'))
    : requested.split(',');
if (args.has('cohort'))
  selected = selected.filter((k) =>
    args.get('cohort') === 'current'
      ? /-canonical-pr199-v1$/.test(k) || /-realism-candidate-v0-v3$/.test(k)
      : !(/-canonical-pr199-v1$/.test(k) || /-realism-candidate-v0-v3$/.test(k)),
  );
if (!selected.length) throw Error('Empty PR200 replay selection');
for (const key of selected) {
  const item = cases[key];
  if (!item) throw Error('Unknown PR200 replay ' + key);
  const [name, script, ...rest] = item,
    path = `${ROOT}/${name}`,
    record = read(path).result;
  const archive = read(record.source.path);
  if (archive.base !== BASE || hash(archive.manifest) !== record.source.fingerprint)
    throw Error('PR200 source identity');
  const current =
    !args.has('historical-source') &&
    (key.endsWith('-realism-candidate-v0-v3') ||
      ['frozen-final', 'fresh-final', 'diagnosis-final', 'keepers-v3', 'information'].includes(
        key,
      ));
  if (current) {
    const lab = rest.includes('lab');
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        lab ? './scripts/registerPr199Lab.mjs' : './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        ...rest.filter((v) => v !== 'lab'),
        `--check=${path}`,
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    console.log('PR200 current-source physical equivalence PASS', key);
    continue;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr200-replay-'));
  const safe = () => {
    if (
      !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
      !basename(scratch).startsWith('mfl-pr200-replay-')
    )
      throw Error('Unsafe source replay scratch');
  };
  safe();
  const cleanup = () => {
    safe();
    for (const name of ['node_modules', 'docs', '.git']) {
      const p = join(scratch, name);
      try {
        if (!lstatSync(p).isSymbolicLink()) throw Error('Unsafe replay link');
        rmSync(p, { recursive: true, force: true });
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
        throw Error('Unsafe/corrupt source path');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    for (const [p, digest] of Object.entries(archive.manifest))
      if (hash(readFileSync(join(scratch, p), 'utf8').replaceAll('\r\n', '\n')) !== digest)
        throw Error('Source reconstruction drift');
    if (args.has('diagnose') && script === 'benchmarkPr200Matches.mjs') {
      const harness = join(scratch, 'scripts', script);
      const original = readFileSync(harness, 'utf8');
      const marker =
        /if\s*\(\s*hash\(actual\)\s*!==\s*hash\(old\)\s*\)\s*throw Error\('PR200 full deterministic replay drift'\);/;
      if (!marker.test(original)) throw Error('Unknown diagnostic harness');
      writeFileSync(
        harness,
        original.replace(
          marker,
          `if (hash(actual) !== hash(old)) {
        console.error('PR200 DIAGNOSTIC ONLY: exact source checked before adding failure reporting');
        for (const key of new Set([...Object.keys(actual), ...Object.keys(old)]))
          if (hash(actual[key] ?? null) !== hash(old[key] ?? null))
            console.error('DRIFT', key, JSON.stringify({ actual: actual[key], expected: old[key] }).slice(0, 10000));
        throw Error('PR200 full deterministic replay drift');
      }`,
        ),
      );
    }
    for (const name of ['node_modules', 'docs', '.git'])
      symlinkSync(
        resolve(name),
        join(scratch, name),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    if (args.has('preflight') && script === 'benchmarkPr200Matches.mjs') {
      execFileSync(
        process.execPath,
        [
          '--experimental-transform-types',
          '--import',
          './scripts/registerTypescriptLoader.mjs',
          '--input-type=module',
          '-e',
          `
        import {read,hash} from './scripts/pr200Evidence.mjs';
        import {readDevelopmentInput} from './scripts/pr193Evidence.mjs';
        import {withIntegrationProfile,resolveIntegrationProfile} from './src/core/matchSimulation/integrationProfile.ts';
        const saved=read(${JSON.stringify(path)}).result;
        const {input,path:inputPath}=readDevelopmentInput(saved.design,saved.policy);
        const initial=withIntegrationProfile(structuredClone(input),saved.profile,saved.policy);
        initial.seed=saved.seed;
        const manifest=resolveIntegrationProfile(saved.profile,saved.policy);
        console.log('DIAGNOSTIC initial',hash(initial),saved.initialHash,'input',hash(input),saved.originalInputHash,inputPath===saved.inputPath);
        for(const key of new Set([...Object.keys(manifest),...Object.keys(saved.manifest)]))
          if(hash(manifest[key]??null)!==hash(saved.manifest[key]??null)) console.log('DIAGNOSTIC MANIFEST',key,JSON.stringify({actual:manifest[key],expected:saved.manifest[key]}));
      `,
        ],
        { cwd: scratch, stdio: 'inherit', windowsHide: true },
      );
      continue;
    }
    const lab = rest.includes('lab');
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        lab ? './scripts/registerPr199Lab.mjs' : './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        ...rest.filter((v) => v !== 'lab'),
        `--check=${path}`,
      ],
      { cwd: scratch, stdio: 'inherit', windowsHide: true },
    );
    console.log('PR200 exact-source replay PASS', key);
  } finally {
    cleanup();
  }
}
