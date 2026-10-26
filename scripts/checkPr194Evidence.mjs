import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import {
  hash,
  manifest,
  canonicalKernelManifest,
  files,
  readDevelopmentInput,
  PR193_BASE,
} from './pr194Evidence.mjs';
import { readPr194Evidence } from './readPr194Evidence.mjs';
const root = 'docs/performance/pr194',
  read = (path) => JSON.parse(readFileSync(path));
const requireTrue = (condition, message) => {
  if (!condition) throw Error(message);
};
const baseline = read(root + '/frozen-pr193.json'),
  baseContents = new Map();
requireTrue(baseline.base === PR193_BASE, 'Wrong merged baseline');
const entries = [...baseline.source, ...baseline.reports];
const bytes = execFileSync('git', ['cat-file', '--batch'], {
  input: entries.map((p) => `${PR193_BASE}:${p.path}`).join('\n') + '\n',
  maxBuffer: 128 * 1024 * 1024,
  windowsHide: true,
});
let offset = 0;
for (const entry of entries) {
  const end = bytes.indexOf(10, offset),
    header = bytes.subarray(offset, end).toString().split(' '),
    size = Number(header[2]);
  requireTrue(header[1] === 'blob' && Number.isFinite(size), 'Missing baseline ' + entry.path);
  const raw = bytes
    .subarray(end + 1, end + 1 + size)
    .toString('utf8')
    .replaceAll('\r\n', '\n');
  offset = end + size + 2;
  requireTrue(hash(raw) === entry.sha256, 'Merged baseline hash drift ' + entry.path);
  baseContents.set(entry.path, raw);
}
for (const p of baseline.historicalEvidence)
  requireTrue(
    hash(
      p.path.endsWith('.gz')
        ? readFileSync(p.path)
        : readFileSync(p.path, 'utf8').replaceAll('\r\n', '\n'),
    ) === p.sha256,
    'PR193 evidence changed ' + p.path,
  );
const changedHistory = execFileSync(
  'git',
  [
    'diff',
    '--name-only',
    PR193_BASE,
    '--',
    'docs/performance/pr193',
    ...baseline.reports.map((p) => p.path),
  ],
  { encoding: 'utf8', windowsHide: true },
).trim();
requireTrue(changedHistory === '', 'Historical Git blobs changed: ' + changedHistory);
for (const p of baseline.inputs) {
  const { input } = readDevelopmentInput(p.design, p.policy);
  requireTrue(hash(input) === p.sha256 && input.seed === p.seed, 'Frozen fixture drift');
}
const checked = new Set();
const validateSource = (r) => {
  requireTrue(hash(r.source) === r.sourceHash, 'Invalid recorded source manifest');
  const a = r.sourceArchive;
  if (checked.has(a.path)) return;
  const bytes = readFileSync(a.path),
    raw = gunzipSync(bytes),
    saved = JSON.parse(raw);
  requireTrue(
    hash(bytes) === a.sha256 && hash(raw) === a.originalSha256 && saved.base === PR193_BASE,
    'Source archive drift',
  );
  requireTrue(hash(saved.source) === r.sourceHash, 'Archive manifest mismatch');
  const overrides = new Map(saved.overrides.map((p) => [p.path, p.content]));
  for (const p of r.source)
    requireTrue(
      hash(overrides.get(p.path) ?? baseContents.get(p.path) ?? '') === p.sha256,
      'Unrecoverable source ' + p.path,
    );
  checked.add(a.path);
};
const kernel = canonicalKernelManifest(manifest()),
  kernelHash = hash(kernel),
  kernelPaths = new Set(kernel.map((p) => p.path));
const finalKernel = (r) =>
  requireTrue(
    hash(r.source.filter((p) => kernelPaths.has(p.path))) === kernelHash,
    'Final evidence uses another kernel',
  );
const protocol = read(root + '/laboratory-protocol-v1.json'),
  pointer = read(root + '/laboratory-v4.json');
const labBytes = readFileSync(pointer.archive.path),
  labRaw = gunzipSync(labBytes),
  lab = JSON.parse(labRaw);
requireTrue(
  hash(labBytes) === pointer.archive.sha256 && hash(labRaw) === pointer.archive.originalSha256,
  'Lab bytes drift',
);
requireTrue(
  hash(protocol) === lab.protocolHash && lab.rows.length === 73,
  'Incomplete controlled protocol',
);
validateSource(lab);
finalKernel(lab);
const receivingPointer = read(root + '/receiving-v4.json');
const receivingBytes = readFileSync(receivingPointer.archive.path),
  receivingRaw = gunzipSync(receivingBytes),
  receiving = JSON.parse(receivingRaw);
requireTrue(
  hash(receivingBytes) === receivingPointer.archive.sha256 &&
    hash(receivingRaw) === receivingPointer.archive.originalSha256 &&
    receiving.rows.length === 40,
  'Receiving phases drift',
);
validateSource(receiving);
finalKernel(receiving);
for (const r of lab.rows) {
  requireTrue(r.observerNeutral !== false, 'Lab observer divergence');
  requireTrue(
    protocol.conditions.some((c) => c.id === r.config.id && c.seed === r.config.seed),
    'Lab input drift',
  );
  for (const s of r.samples)
    requireTrue(!s.plan || s.plan.options.length <= 3, 'Unbounded preparation');
  for (const c of r.contacts)
    if (c.surfaceContact)
      requireTrue(c.executed === c.surfaceContact.available, 'Fictional contact');
}
const matches = files(root + '/matches')
  .filter((p) => p.endsWith('.json'))
  .map((path) => ({ path, ...readPr194Evidence(path) }));
for (const r of matches) validateSource(r);
const final = matches.filter((r) => r.version === 'v4');
requireTrue(final.length === 27, 'Incomplete staged full-match design');
for (const r of final) {
  requireTrue(r.status === 'full_time' && !r.failure, 'Incomplete match ' + r.path);
  finalKernel(r);
  requireTrue(
    r.inputHash ===
      baseline.inputs.find((p) => p.design === r.design && p.policy === r.policy)?.sha256,
    'Match input drift',
  );
}
for (const design of ['ww', 'ss', 'sw'])
  for (const policy of baseline.policies)
    requireTrue(
      final.filter(
        (r) => r.design === design && r.policy === policy && r.mode === 'combined' && r.observed,
      ).length === 1,
      'Missing combined fixture',
    );
for (const r of final.filter((r) => !r.observed))
  requireTrue(
    final.find(
      (t) => t.design === r.design && t.policy === r.policy && t.mode === r.mode && t.observed,
    )?.finalHash === r.finalHash,
    'Full observer-on/off divergence',
  );
requireTrue(
  final.find((r) => r.mode === 'baseline')?.baselineParity === true,
  'Full PR193 final-state parity lost',
);
const profile = read(root + '/profile-v4.json');
validateSource(profile);
finalKernel(profile);
for (const r of profile.rows) {
  const twin = profile.rows.find(
    (t) => t.mode === r.mode && t.repeat === r.repeat && t.debug !== r.debug,
  );
  requireTrue(
    twin.finalHash === r.finalHash && r.ticks === 160 && Math.abs(r.actualSeconds - 4) < 1e-6,
    'Profile observer/time divergence',
  );
}
const replay = read(root + '/replay-v4.json');
requireTrue(
  replay.kernelHash === kernelHash &&
    replay.rows.length === 15 &&
    replay.rows.every((r) => r.observerNeutral && r.repeated),
  'Incomplete final captured replays',
);
const circulation = read(root + '/circulation-v4.json');
validateSource(circulation);
finalKernel(circulation);
requireTrue(
  circulation.rows.length === 4 &&
    circulation.runnerHash ===
      hash(readFileSync('scripts/analyzePr194Circulation.mjs', 'utf8').replaceAll('\r\n', '\n')),
  'Incomplete causal prefixes or changed apparatus',
);
for (const r of circulation.rows) {
  requireTrue(
    r.decisions.length === 128 &&
      Math.abs(r.seconds - 120) < 1e-6 &&
      hash(readFileSync(r.capture.path)) === r.capture.sha256 &&
      hash(JSON.parse(gunzipSync(readFileSync(r.capture.path)))) === r.inputHash,
    'Causal prefix input or horizon drift',
  );
}
const browser = read(root + '/browser-inspection-v4.json');
requireTrue(
  browser.kernelHash === kernelHash &&
    browser.consoleErrors.length === 0 &&
    hash(readFileSync(browser.image.path)) === browser.image.sha256,
  'Final browser evidence drift',
);
const verification = read(root + '/verification-v4.json');
validateSource(verification);
finalKernel(verification);
requireTrue(
  verification.kernelHash === kernelHash &&
    verification.exitCode === 0 &&
    verification.tests.total === 2354,
  'Missing final-kernel local verification',
);
const dispatch = read(root + '/development-v4.json');
requireTrue(
  dispatch.allPassed && dispatch.jobs.length === 27 && dispatch.kernelHash === kernelHash,
  'Staged dispatch failed',
);
const index = read(root + '/evidence-index-v4.json');
for (const p of index.files)
  requireTrue(
    hash(
      p.path.endsWith('.gz') || p.path.endsWith('.jpg')
        ? readFileSync(p.path)
        : readFileSync(p.path, 'utf8').replaceAll('\r\n', '\n'),
    ) === p.sha256,
    'PR194 evidence drift ' + p.path,
  );
console.log(
  'PR194 evidence PASS: baseline,73 lab conditions,40 receiving phases,27 complete matches,15 captured replays,source/history integrity',
);
