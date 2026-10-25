import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { PassLifecycleDiagnostics } from '../src/core/matchSimulation/passLifecycleDiagnostics.ts';
import { measureEffectivePlayingTime } from '../src/core/matchSimulation/effectivePlayingTime.ts';
import { capturePathologicalState } from '../src/core/matchSimulation/pathologicalReplay.ts';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from '../src/core/matchSimulation/matchFlowTelemetry.ts';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const design = args.get('design') ?? 'ww',
  policy = args.get('policy') ?? 'state-value-v1',
  mode = args.get('mode') ?? 'default';
if (!['ww', 'ss', 'sw'].includes(design) || !['default', 'body'].includes(mode))
  throw Error('Invalid experiment');
const version = args.get('version');
if (version && !/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
const root = 'docs/performance/pr191',
  output = `${root}/${design}-${policy}-${mode}${version ? '-' + version : ''}.json`;
if (existsSync(output)) throw Error('Refusing to overwrite ' + output);
mkdirSync(root, { recursive: true });
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const manifest = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: 'src/' + p,
    sha256: sha(readFileSync('src/' + p, 'utf8').replaceAll('\r\n', '\n')),
  }));
const sourceHash = sha(manifest);
const old = JSON.parse(
  readFileSync(`docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`),
);
const initial = JSON.parse(gunzipSync(readFileSync(old.archive))).input;
if (sha(initial) !== old.inputSha256) throw Error('Frozen input drift');
let s = JSON.parse(JSON.stringify(initial));
if (mode === 'body') s.experimentalBodyContacts = { version: 'body-v1', readyAt: {}, locks: [] };
const cpu = process.cpuUsage(),
  started = performance.now(),
  observer = new PassLifecycleDiagnostics(),
  captures = [],
  surfaces = [],
  contactIds = new Set();
const categories = new Set();
let ticks = 0,
  failure = null;
let flow = createMatchFlowTelemetry(`pr191:${design}:${mode}`);
try {
  withBoundedObserver(
    (t) => observer.trace(t),
    () => {
      while (!['full_time', 'abandoned'].includes(s.status) && s.time < 7200) {
        if (s.status === 'half_time') s = startSecondHalf(s);
        // These are genuine running states, never moved into contact for capture.
        if (
          mode === 'default' &&
          !s.restart &&
          !s.ball.ownerId &&
          s.ball.travelKind &&
          !s.ball.shot
        ) {
          const h = s.ball.height ?? 0.11;
          const receiver = s.players.find((p) => p.id === s.receptionPreparation?.actorId);
          const near =
            receiver &&
            Math.hypot(receiver.position.x - s.ball.x, receiver.position.y - s.ball.y) < 2;
          const kind = h > 0.8 && h < 1.8 ? 'aerial' : near && h <= 0.65 ? 'ground' : null;
          if (
            kind &&
            captures.filter((c) => c.kind === kind).length < 2 &&
            near &&
            !categories.has(kind + ':' + s.currentActorId)
          ) {
            categories.add(kind + ':' + s.currentActorId);
            const path = `${root}/capture-${design}-${captures.length}-${kind}.json.gz`;
            const capture = capturePathologicalState(
              s,
              '251ec9f88f212f7a93d26ebc7491b1176e5a25ef',
              `PR191 genuine default development continuation; source ${sourceHash}; ${kind}`,
            );
            const bytes = gzipSync(JSON.stringify(capture));
            writeFileSync(path, bytes);
            captures.push({
              path,
              kind,
              stateHash: sha(s),
              archiveHash: createHash('sha256').update(bytes).digest('hex'),
              at: s.time,
            });
          }
        }
        const before = s;
        s = step(s, 0.025);
        if (s === before) throw Error('Stalled at ' + s.time);
        observer.observe(before, s);
        flow = observeMatchFlow(flow, before, s);
        const last = s.experimentalBodyContacts?.last;
        if (last) {
          const key = last.playerId + ':' + last.at;
          if (!contactIds.has(key)) {
            contactIds.add(key);
            surfaces.push(last);
          }
        }
        if (++ticks % 64000 === 0)
          console.log(
            `${design}/${policy}/${mode}: ${s.time.toFixed(1)} s, body contacts ${surfaces.length}`,
          );
      }
    },
  );
} catch (e) {
  failure = String(e);
}
const rows = Object.values(s.statistics?.players ?? {}),
  passes = {
    attempted: rows.reduce((n, p) => n + p.passesAttempted, 0),
    completed: rows.reduce((n, p) => n + p.passesCompleted, 0),
  },
  shots = rows.reduce((n, p) => n + p.shots, 0);
const reference = JSON.parse(
  readFileSync(`docs/performance/pr190/${design}-${policy}-spin-final.json`),
);
const finalHash = sha(s),
  diagnosticsHash = sha(observer.snapshot());
assertTelemetryInvariants(flow);
const records = observer.snapshot();
const priorPath = `${root}/${design}-${policy}-${mode}.json`;
const priorHash =
  version && existsSync(priorPath) ? JSON.parse(readFileSync(priorPath)).finalHash : null;
if (priorHash && priorHash !== finalHash && !args.get('engine-change'))
  throw Error('Added telemetry changed the full match');
const result = {
  schemaVersion: 1,
  design,
  policy,
  mode,
  classification: 'paired development; not independent confirmation',
  sourceHash,
  manifest,
  inputHash: sha(initial),
  seed: initial.seed,
  stepSeconds: 0.025,
  ticks,
  status: s.status,
  seconds: s.time,
  score: s.score,
  passes,
  shots,
  time: measureEffectivePlayingTime(s, 0),
  surfaces,
  captures,
  finalHash,
  diagnosticsHash,
  priorComparison: {
    finalHash: priorHash,
    equal: priorHash ? priorHash === finalHash : null,
    engineChange: args.get('engine-change') ?? null,
  },
  football: {
    firstTimePassAttempts: flow.firstTimePassAttempts,
    firstTimePassCompleted: flow.firstTimePassCompleted,
    receptions: flow.receptions,
    finalThirdEntries: flow.finalThirdEntries,
    boxEntries: flow.boxEntries,
    carries: flow.carries,
    possessionChanges: flow.possessionChanges,
    recoveriesAfterPoorTouch: records.filter((r) => r.sameTeamRecovery).length,
    passFailureCauses: Object.fromEntries(
      [...new Set(records.map((r) => r.failureCause))].map((c) => [
        c,
        records.filter((r) => r.failureCause === c).length,
      ]),
    ),
  },
  baseline: {
    path: `docs/performance/pr190/${design}-${policy}-spin-final.json`,
    finalHash: reference.finalStateSha256,
    defaultFinalMatches: mode === 'default' ? finalHash === reference.finalStateSha256 : null,
  },
  performance: {
    wallSeconds: (performance.now() - started) / 1000,
    cpu: process.cpuUsage(cpu),
    rssBytes: process.memoryUsage().rss,
  },
  failure,
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    status: s.status,
    passes,
    shots,
    contacts: surfaces.length,
    captures: captures.length,
    defaultMatches: result.baseline.defaultFinalMatches,
    failure,
  }),
);
if (
  failure ||
  s.status !== 'full_time' ||
  (mode === 'default' && !result.baseline.defaultFinalMatches)
)
  process.exitCode = 1;
