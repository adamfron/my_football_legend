import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  linkSync,
  unlinkSync,
  copyFileSync,
  constants,
} from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import { source, hash, read, git } from './pr199Evidence.mjs';
export { source, hash, read, git };
export const BASE = 'df6d93df39d1bebfa5d395e29620224670520971';
export const ROOT = 'docs/performance/pr201';
export const options = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
export const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  const data = JSON.stringify(value, null, path.endsWith('.gz') ? 0 : 2) + '\n';
  writeFileSync(path, path.endsWith('.gz') ? gzipSync(data, { level: 9 }) : data, { flag: 'wx' });
};
export const identity = () => {
  const manifest = source(),
    fingerprint = hash(manifest);
  const path = `${ROOT}/source/${fingerprint}.json.gz`;
  if (!existsSync(path)) {
    const baseline = read(`${ROOT}/frozen-pr200.json`).source;
    const value = {
      base: BASE,
      manifest,
      contents: Object.fromEntries(
        Object.keys(manifest)
          .filter((p) => manifest[p] !== baseline[p])
          .map((p) => [p, readFileSync(p, 'utf8').replaceAll('\r\n', '\n')]),
      ),
    };
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, gzipSync(JSON.stringify(value) + '\n', { level: 9 }), { flag: 'wx' });
    try {
      linkSync(temporary, path);
    } catch (e) {
      if (e.code === 'EPERM') {
        try {
          copyFileSync(temporary, path, constants.COPYFILE_EXCL);
        } catch (copy) {
          if (copy.code !== 'EEXIST') throw copy;
        }
      } else if (e.code !== 'EEXIST') throw e;
    } finally {
      unlinkSync(temporary);
    }
  }
  return { base: BASE, fingerprint, path };
};
export const finish = (name, result, costs) => {
  if (options.has('check')) {
    const { source: _old, ...old } = read(options.get('check')).result;
    const { source: _new, ...actual } = result;
    void _old;
    void _new;
    if (hash(old) !== hash(actual)) throw Error('PR201 exact result/hash drift: ' + name);
  } else write(`${ROOT}/${name}`, { result, costs });
};
