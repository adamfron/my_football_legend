import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
const output = 'docs/performance/pr189/failed-cycle-one-source.json.gz';
if (existsSync(output)) throw Error('Preserve failed source');
const sourceSha256 = 'fae76f475c24957884c3c515bb6ac4df40f79cbf35e24beb452801af87ad9b40';
const failed = JSON.parse(readFileSync(`docs/performance/pr189/source-${sourceSha256}.json`));
const baseline = JSON.parse(readFileSync('docs/performance/PR188-evidence-index.json')).source;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const files = failed
  .filter((f) => !baseline.some((b) => b.path === f.path && b.sha256 === f.sha256))
  .map((f) => {
    let content = readFileSync(f.path, 'utf8').replaceAll('\r\n', '\n');
    if (f.path.endsWith('/decisionReadiness.ts'))
      content = content
        .replace(
          "import { playerContactGeometry, motorContactReadyAt } from './ballContactGeometry';",
          "import { playerContactGeometry } from './ballContactGeometry';",
        )
        .replace(
          '  const readyAt = motorContactReadyAt(state, actor.id);',
          `  const last = state.lastGroundContact;
  const readyAt =
    last?.actorId === actor.id
      ? last.at + Math.max(0.12, last.surfaceContact?.recoverySeconds ?? 0)
      : state.time;`,
        );
    if (sha(content) !== f.sha256)
      throw Error(`Failed source reconstruction does not match original manifest: ${f.path}`);
    return { ...f, content };
  });
writeFileSync(
  output,
  gzipSync(
    JSON.stringify({
      schemaVersion: 1,
      baseCommit: 'a74be9ee846ac4958fd67e42795cf3d86946e937',
      sourceSha256,
      files,
    }),
  ),
);
console.log(
  JSON.stringify({
    output,
    files: files.length,
    sourceSha256,
    verifiedAgainstOriginalManifest: true,
  }),
);
