import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  linkSync,
  unlinkSync,
} from 'node:fs';
import process from 'node:process';
import { dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
export const BASE = '34f1a9aa5c04c5517d81f63ba581f6c3b4e4f9cd';
export const hash = (x) =>
  createHash('sha256')
    .update(typeof x === 'string' || x instanceof Uint8Array ? x : JSON.stringify(x))
    .digest('hex');
export const files = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${root}/${e.name}`) : [`${root}/${e.name}`],
  );
export const source = () =>
  Object.fromEntries(
    [
      ...files('src/core'),
      ...files('src/schemas'),
      ...files('src/types'),
      ...files('scripts').filter((p) => /[Pp]r196/.test(p)),
      'scripts/registerTypescriptLoader.mjs',
      'package-lock.json',
    ]
      .filter((p) => !/\.test\./.test(p))
      .sort()
      .map((p) => [p, hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n'))]),
  );
export const read = (path) =>
  JSON.parse(path.endsWith('.gz') ? gunzipSync(readFileSync(path)) : readFileSync(path, 'utf8'));
export const retainSource = () => {
  const manifest = source(),
    id = hash(manifest),
    path = `docs/performance/pr196/source/${id}.json.gz`;
  if (!existsSync(path)) {
    const value = {
      base: BASE,
      manifest,
      contents: Object.fromEntries(
        Object.keys(manifest)
          .filter((p) => p !== 'package-lock.json')
          .map((p) => [p, readFileSync(p, 'utf8').replaceAll('\r\n', '\n')]),
      ),
    };
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, gzipSync(JSON.stringify(value) + '\n'), { flag: 'wx' });
    try {
      linkSync(temporary, path);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    } finally {
      unlinkSync(temporary);
    }
    if (hash(read(path).manifest) !== id) throw Error('Concurrent source collision');
  }
  return { path, sha256: hash(readFileSync(path)), sourceHash: id };
};
export const sourceForReplay = (output, check) => {
  if (!check) return retainSource();
  const saved = read(output).sourceArchive,
    archive = read(saved.path);
  if (
    hash(readFileSync(saved.path)) !== saved.sha256 ||
    hash(archive.manifest) !== saved.sourceHash
  )
    throw Error('Recorded source archive drift');
  // Check the complete physical kernel and this apparatus. Other retained research/report
  // scripts are provenance, not imports of the experiment; editing them cannot change its output.
  const runner = `scripts/${process.argv[1].replaceAll('\\', '/').split('/').at(-1)}`;
  for (const [path, expected] of Object.entries(archive.manifest)) {
    if (
      path.startsWith('scripts/') &&
      ![runner, 'scripts/pr196Evidence.mjs', 'scripts/registerTypescriptLoader.mjs'].includes(path)
    )
      continue;
    if (hash(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')) !== expected)
      throw Error('Source changed: ' + path);
  }
  return saved;
};
export const receipt = (path, value, check = false) => {
  if (check) {
    if (hash(read(path)) !== hash(value)) throw Error(`Evidence drift: ${path}`);
  } else {
    if (existsSync(path)) throw Error(`Preserve versioned evidence: ${path}`);
    mkdirSync(dirname(path), { recursive: true });
    const text = JSON.stringify(value, null, path.endsWith('.gz') ? undefined : 2) + '\n';
    writeFileSync(path, path.endsWith('.gz') ? gzipSync(text) : text, { flag: 'wx' });
  }
};
