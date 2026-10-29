import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { source } from './pr199Evidence.mjs';
export const BASE = '5a9e12a2b7e4054bb1f68366ac82569f575b19f6';
export const FINAL_VERSION = 'v2';
export const ROOT = 'docs/performance/pr203';
export const hash = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
export const read = (path) =>
  JSON.parse(path.endsWith('.gz') ? gunzipSync(readFileSync(path)) : readFileSync(path, 'utf8'));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceArchiveSchema = z.object({
  base: z.literal(BASE),
  manifest: z.record(z.string(), digest),
  contents: z.record(z.string(), z.string()),
});
const git = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
export const currentIdentity = () => {
  const manifest = source(),
    fingerprint = hash(manifest),
    path = `${ROOT}/source/${fingerprint}.json.gz`;
  const changed = new Set([
    ...git(['diff', BASE, '--name-only']).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ]);
  const archive = sourceArchiveSchema.parse({
    base: BASE,
    manifest,
    contents: Object.fromEntries(
      Object.keys(manifest)
        .filter((p) => changed.has(p))
        .map((p) => [p, readFileSync(p, 'utf8').replaceAll('\r\n', '\n')]),
    ),
  });
  if (!existsSync(path)) {
    mkdirSync(`${ROOT}/source`, { recursive: true });
    writeFileSync(path, gzipSync(JSON.stringify(archive) + '\n', { level: 9 }), { flag: 'wx' });
  }
  return { base: BASE, fingerprint, path };
};
/** Old evidence is immutable; current runtime is bound to a separately recorded
 * successor manifest. This is not an assertion that PR203 runtime equals PR201. */
export const checkCurrentSource = () => {
  const binding = read(`${ROOT}/current-source.json`),
    archive = sourceArchiveSchema.parse(read(binding.path));
  assert.equal(hash(archive.manifest), binding.fingerprint, 'PR203 archive fingerprint');
  assert.deepEqual(source(), archive.manifest, 'PR203 current source differs from measured source');
  for (const [p, t] of Object.entries(archive.contents)) {
    assert.ok(
      /^(src\/(core|schemas|types)\/|scripts\/|package(?:-lock)?\.json$)/.test(p) &&
        !p.split('/').includes('..'),
    );
    assert.equal(hash(t), archive.manifest[p], 'PR203 archived source bytes');
  }
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'docs/performance/pr195',
      'docs/performance/pr196',
      'docs/performance/pr197',
      'docs/performance/pr198',
      'docs/performance/pr199',
      'docs/performance/pr200',
      'docs/performance/pr201',
      'docs/performance/pr202',
      'package-lock.json',
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
};
