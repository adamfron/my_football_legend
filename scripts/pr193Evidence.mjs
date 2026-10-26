import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
export const PR192_BASE = '8106f28c68e7bed5368d8140cfe97ede79e9d19e';
export const POLICIES = [
  'state-value-v1',
  'phase-role-hybrid-v1',
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
];
export const hash = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
export const files = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((p) =>
    p.isDirectory() ? files(root + '/' + p.name) : [root + '/' + p.name],
  );
export const manifest = () =>
  files('src')
    .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
    .sort()
    .map((path) => ({ path, sha256: hash(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')) }));
/** Conservative closure including type imports. Complete UI/apparatus source is
 * retained separately, even when it cannot influence canonical match stepping. */
export const canonicalKernelManifest = (source = manifest()) => {
  const known = new Map(source.map((p) => [p.path, p]));
  const visited = new Set();
  const visit = (path) => {
    if (visited.has(path) || !known.has(path)) return;
    visited.add(path);
    const content = readFileSync(path, 'utf8');
    for (const match of content.matchAll(/\b(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      const target = posix.normalize(posix.join(posix.dirname(path), match[1]));
      const resolved = [target, target + '.ts', target + '.tsx', target + '/index.ts'].find((p) =>
        known.has(p),
      );
      if (resolved) visit(resolved);
    }
  };
  visit('src/core/matchSimulation/matchSimulation.ts');
  return source.filter((p) => visited.has(p.path));
};
export const writeReceipt = (path, value) => {
  if (existsSync(path)) throw Error('Refusing to overwrite evidence: ' + path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};
export const retainSourceVersion = (source) => {
  const frozen = JSON.parse(readFileSync('docs/performance/pr193/frozen-pr192.json'));
  const baseline = new Map(frozen.source.map((p) => [p.path, p.sha256]));
  const overrides = source
    .filter((p) => baseline.get(p.path) !== p.sha256)
    .map((p) => ({ ...p, content: readFileSync(p.path, 'utf8').replaceAll('\r\n', '\n') }));
  const value = JSON.stringify({ base: PR192_BASE, source, overrides });
  const path = `docs/performance/pr193/source-versions/${hash(source)}.json.gz`;
  const bytes = gzipSync(value);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    if (hash(gunzipSync(readFileSync(path))) !== hash(value))
      throw Error('Source archive collision');
  } else writeFileSync(path, bytes, { flag: 'wx' });
  return { path, sha256: hash(readFileSync(path)), originalSha256: hash(value) };
};
export const readDevelopmentInput = (design, policy) => {
  if (!['ww', 'ss', 'sw'].includes(design) || !POLICIES.includes(policy))
    throw Error('Only frozen development inputs are allowed');
  const path = `docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`;
  const reference = JSON.parse(readFileSync(path));
  const input = JSON.parse(gunzipSync(readFileSync(reference.archive))).input;
  if (hash(input) !== reference.inputSha256) throw Error('Development input drift: ' + path);
  return { path, reference, input };
};
