import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { source, hash, normalized } from './pr199Evidence.mjs';
import { BASE } from './pr207SourceGuard.mjs';
const root = 'docs/performance/pr207';
const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
const paths = git([
  'ls-tree',
  '-r',
  '--name-only',
  BASE,
  '--',
  'src/core',
  'src/schemas',
  'src/types',
  'scripts',
  'package.json',
  'package-lock.json',
])
  .trim()
  .split('\n')
  .filter((p) => !/\.test\./.test(p));
const blobs = execFileSync('git', ['cat-file', '--batch'], {
  input: paths.map((p) => `${BASE}:${p}`).join('\n') + '\n',
  windowsHide: true,
  maxBuffer: 64 * 1024 * 1024,
});
let offset = 0;
const previous = Object.fromEntries(
  paths.map((p) => {
    const end = blobs.indexOf(10, offset),
      header = blobs.subarray(offset, end).toString('utf8');
    const size = Number(header.split(' ')[2]);
    assert.ok(Number.isFinite(size), `Missing base blob ${p}`);
    const content = blobs
      .subarray(end + 1, end + 1 + size)
      .toString('utf8')
      .replaceAll('\r\n', '\n');
    offset = end + 1 + size + 1;
    return [p, hash(content)];
  }),
);
const receipt = process.argv.find((a) => a.startsWith('--receipt='))?.slice(10);
const manifest = receipt
  ? JSON.parse(gunzipSync(readFileSync(`${root}/${receipt}.json.gz`))).manifest
  : source();
const fingerprint = hash(manifest);
const contents = Object.fromEntries(
  Object.keys(manifest)
    .filter((p) => manifest[p] !== previous[p])
    .map((p) => {
      const content = normalized(p);
      assert.equal(hash(content), manifest[p], `Cannot archive changed interim source ${p}`);
      return [p, content];
    }),
);
const archive = {
  base: BASE,
  fingerprint,
  baseline: previous,
  manifest,
  contents,
  removed: Object.keys(previous).filter((p) => !(p in manifest)),
};
mkdirSync(root, { recursive: true });
const output = `${root}/source-${fingerprint}.json.gz`;
if (!existsSync(output))
  writeFileSync(output, gzipSync(JSON.stringify(archive), { level: 9 }), { flag: 'wx' });
if (!receipt)
  writeFileSync(
    `${root}/current-source.json`,
    JSON.stringify({ base: BASE, fingerprint, manifest }, null, 2) + '\n',
  );
console.log(fingerprint);
