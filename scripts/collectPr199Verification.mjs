import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import console from 'node:console';
import { files, read, hash, identity, ROOT, options } from './pr199Evidence.mjs';
const input = resolve(options.get('input') ?? '../pr199-verification');
const records = [];
for (const path of files(input).filter((p) => p.endsWith('.json'))) {
  const rows = read(path);
  if (!Array.isArray(rows)) continue;
  for (const r of rows) {
    const from = resolve(dirname(path), r.log),
      rel = relative(input, from).replaceAll('\\', '/');
    const to = resolve(ROOT, 'verification', rel);
    if (!from.startsWith(input + sep) || !to.startsWith(resolve(ROOT, 'verification') + sep))
      throw Error('Unsafe verification log path');
    mkdirSync(dirname(to), { recursive: true });
    const digest = hash(readFileSync(from));
    if (existsSync(to)) {
      if (hash(readFileSync(to)) !== digest) throw Error('Existing verification log changed');
    } else copyFileSync(from, to);
    records.push({ ...r, log: `${ROOT}/verification/${rel}`, logSha256: digest });
  }
}
records.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const required = [
  'benchmark:pr195:check',
  'benchmark:pr196:historical',
  'benchmark:pr196:check',
  'benchmark:pr196:replay',
  'benchmark:pr197:check',
  'benchmark:pr197:replay',
  'benchmark:pr197:source-replay',
  'benchmark:pr198:check',
  'benchmark:pr198:replay',
  'benchmark:pr198:source-replay',
  'benchmark:pr199:check',
  'benchmark:pr199:replay',
  'benchmark:realism:check',
  'verify',
].map((s) => 'npm run ' + s);
const latest = required.map((command) => records.findLast((r) => r.command === command));
const status = latest.every((r) => r?.code === 0) ? 'PASS' : 'PENDING';
const value = {
  schema: 'pr199-verification-v1',
  status,
  runtimeSource: identity(),
  required,
  latest: latest.filter(Boolean),
  records,
  notes: [
    'Initial PR197 report comparison failed because Windows checkout mixed CRLF template/report with LF generated tables. Stable .gitattributes and exact LF checkout repair preserve historical expected content; successful retry retained.',
    'Earlier verify is preliminary. Final verification records bind runtime source before/after; final-head CI is checked separately on the PR head.',
    'Stored source replay logs compare exact archived experiments, including rejected laboratory apparatus; preservation is distinct from validating those models.',
  ],
};
writeFileSync(`${ROOT}/verification.json`, JSON.stringify(value, null, 2) + '\n');
console.log('PR199 verification collected', status, records.length, 'actual commands');
