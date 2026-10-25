import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
const root = 'docs/performance/pr189';
const sha = (v) => createHash('sha256').update(v).digest('hex');
const converted = [];
for (const file of readdirSync(root).filter((p) => /^(ww|ss|sw)-.*\.json$/.test(p))) {
  const path = `${root}/${file}`,
    raw = readFileSync(path),
    r = JSON.parse(raw);
  if (r.rawReceiptArchive || !r.statistics?.observedPassAttemptIds) continue;
  const archive = `${path}.gz`;
  if (existsSync(archive)) throw Error(`Preserve ${archive}`);
  const bytes = gzipSync(raw);
  writeFileSync(archive, bytes);
  if (sha(gunzipSync(readFileSync(archive))) !== sha(raw))
    throw Error('Lossless receipt archive failed');
  const compact = {
    ...r,
    statistics: {
      players: r.statistics.players,
      teamAccounting: r.statistics.teamAccounting,
      passingNetwork: r.statistics.passingNetwork,
    },
    rawReceiptArchive: archive,
    rawReceiptArchiveSha256: sha(bytes),
    rawReceiptSha256: sha(raw),
    compaction:
      'Full original receipt bytes, including diagnostic identity histories, preserved losslessly in gzip; same measurements in compact JSON.',
  };
  writeFileSync(path, JSON.stringify(compact, null, 2) + '\n');
  converted.push({
    path,
    originalBytes: raw.length,
    compactBytes: readFileSync(path).length,
    archiveBytes: bytes.length,
  });
}
console.log(JSON.stringify({ converted }));
