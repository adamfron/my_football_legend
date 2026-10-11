import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { passConditionSchema, runMarkingLab, runPassLab } from './pr165TacticalLab';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [key, ...value] = a.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const sourceFiles = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'src/core',
    'src/schemas',
    'src/types',
  ],
  {
    encoding: 'utf8',
  },
)
  .trim()
  .split(/\r?\n/)
  .filter((p) => !p.endsWith('.test.ts'))
  .sort();
const fingerprint = () =>
  createHash('sha256')
    .update(
      sourceFiles
        .map((p) => `${p}\n${readFileSync(p, 'utf8').replaceAll('\r\n', '\n')}`)
        .join('\n'),
    )
    .digest('hex');
const sourceBefore = fingerprint();
const passRows = runPassLab(
  args.has('smoke') ? ['baseline', 'blocked_build_up'] : passConditionSchema.options,
  args.has('smoke') ? ['pr165-tactic-1'] : undefined,
);
const markingRows = runMarkingLab(undefined, args.has('smoke') ? ['pr165-mark-1'] : undefined);
const mean = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : null);
const grouped = [...new Set(passRows.map((r) => `${r.condition}:${r.outlet}`))].map((key) => {
  const rows = passRows.filter((r) => `${r.condition}:${r.outlet}` === key);
  const comparable = rows.filter((r) => r.physical?.released && !r.physical.censored);
  return {
    key,
    n: rows.length,
    generated: rows.filter((r) => r.generated).length,
    firstRanked: rows.filter((r) => r.rank === 1).length,
    meanRank: mean(rows.flatMap((r) => (r.rank === null ? [] : [r.rank]))),
    released: rows.filter((r) => r.physical?.released).length,
    comparableCompletionN: comparable.length,
    meanPredictedCompletion: mean(
      comparable.flatMap((r) => (r.predictedCompletion === null ? [] : [r.predictedCompletion])),
    ),
    completed: comparable.filter((r) => r.physical?.result === 'completed').length,
    intendedContactCompleted: comparable.filter((r) => r.physical?.intendedReceiverContact).length,
    intercepted: comparable.filter((r) => r.physical?.defensiveInterception).length,
    censored: rows.filter((r) => r.physical?.censored).length,
    retainedTwoSeconds: comparable.filter((r) => r.physical?.retainedTwoSecondsAfterCompletion)
      .length,
  };
});
const sourceAfter = fingerprint();
const out = resolve(args.get('output') ?? 'docs/performance/PR165-tactics.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      canonicalSourceBefore: sourceBefore,
      canonicalSourceAfter: sourceAfter,
      sourceStableDuringRun: sourceBefore === sourceAfter,
      runnerHash: createHash('sha256')
        .update(readFileSync('scripts/pr165TacticalLab.ts'))
        .update(readFileSync('scripts/benchmarkPr165Tactics.ts'))
        .digest('hex'),
      fixedDt: 0.025,
      method: {
        passing:
          'Five simultaneous outlets, one-factor matched conditions and combined blocked_build_up fixture; three paired seeds (one in smoke). Canonical ranked options are independently counterfactually selected for physical probes; firstRanked is an observation, not proof of execution. Predictor models the intended receiver reaching the error envelope: intendedContactCompleted is its comparable numerator; completed is canonical first actual teammate contact (which can differ). Neither promises control or later retention. Future progression is predicted completion times intended signed depth gain, not a full continuation forecast. No prediction is pooled with censored outcomes.',
        marking:
          'Eight-second isolated motion harness with scripted threat routes and an advancing fullback in the DM-cover scenario. At=0 is static initial geometry, subsequent samples/final are dynamic. Baseline uses current canonical targets; experimental greedily assigns local zone/man responsibility with line and zone costs/hysteresis. Shared capability/facing/fitness, fixture acceleration and separation produce meaningful motion; this is not the canonical full-match movement integrator. Final geometries launch genuine canonical eight-second ball/contact probes, which immediately resume production tactics. No experimental marking installed in production.',
        limits:
          'Small synthetic paired sample, not population calibration. Accessible lanes, missedThreats (>5m), central gap, space behind average line and excess movement are geometric proxies. Interceptions/fouls are actual canonical post-geometry probe counts, not motion-harness events; zero does not establish safety. Null means unavailable/censored. No historical playtest checkpoint reconstructed.',
      },
      passRows,
      grouped,
      markingRows,
    },
    (_key, value: unknown) => (typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value),
  ) + '\n',
);
console.log(
  `PR165 tactical receipt: ${passRows.length} pass probes; ${markingRows.length} marking runs; stable source=${sourceBefore === sourceAfter}; ${out}`,
);
