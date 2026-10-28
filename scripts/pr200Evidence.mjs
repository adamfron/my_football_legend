import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  linkSync,
  unlinkSync,
  copyFileSync,
  constants,
} from 'node:fs';
import process from 'node:process';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { source, hash, read, git } from './pr199Evidence.mjs';
export { hash, read, git };
export const BASE = '97ea53b1a6d3098105586668678a2270cd589f2f';
export const ROOT = 'docs/performance/pr200';
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
    const baseline = read(`${ROOT}/frozen-pr199.json`).source;
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
