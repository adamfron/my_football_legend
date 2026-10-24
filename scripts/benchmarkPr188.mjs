/* global structuredClone */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createRelativeTrial } from '../src/core/matchSimulation/relativeDecisionLab.ts';
import {
  inspectBoundedAction,
  withBoundedObserver,
} from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  derivePressingPlan,
  deriveDefensiveContext,
  enumerateDefensiveChallengeActions,
} from '../src/core/matchSimulation/defensiveChallenges.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { createFormationBenchmarkMatch } from '../src/core/matchSimulation/benchmarkFixtures.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'baseline';
if (!/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
const path = `docs/performance/PR188-labs-${version}.json`;
const replay = args.has('replay');
if (existsSync(path) && !replay) throw Error('Archived evidence must not be overwritten');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const source = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(tsx?|mjs)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const cpu = process.cpuUsage(),
  start = performance.now(),
  rows = [],
  traces = [];
const policies = ['opportunity-driven-v1', 'hierarchical-intent-v1', 'contextual-judgment-v1'];
for (const [skill, opposition] of [
  [40, 40],
  [60, 60],
  [80, 80],
  [40, 80],
  [80, 40],
]) {
  for (const situation of [
    'safe',
    'approaching',
    'arrived',
    'outlet',
    'blocked',
    'exposed',
    'passive',
    'delay',
  ]) {
    if (args.has('situation') && args.get('situation') !== situation) continue;
    for (const policy of policies)
      for (const reversed of [false, true]) {
        const f = createRelativeTrial({
          skill,
          opposition,
          situation,
          policy,
          reversed,
          seed: `pr188-development-paired-${reversed ? 2 : 1}`,
        });
        let s = f.state;
        const input = structuredClone(s),
          initial = inspectBoundedAction(
            s,
            s.players.find((p) => p.id === f.actorId),
          );
        const decisions = [],
          attempts = [],
          physical = [],
          sampled = [];
        let stationary = 0,
          maxStationary = 0,
          ownerDuration = 0,
          firstChange = null,
          previousPass = null,
          previousChallenge = null;
        withBoundedObserver(
          args.has('bare')
            ? undefined
            : (t) => {
                if (t.stage === 'decision' && t.actorId === f.actorId)
                  decisions.push({
                    at: t.at,
                    decision: t.decision,
                    action: t.action,
                    reason: t.reason,
                  });
                if (t.stage === 'attempt' && t.actorId === f.actorId) attempts.push(t);
              },
          () => {
            for (let tick = 0; tick < 480; tick++) {
              const prev = s;
              s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
              if (s === prev) throw Error(`Stall ${s.time}`);
              const actor = s.players.find((p) => p.id === f.actorId);
              if (!actor) {
                firstChange ??= s.time;
                break;
              }
              stationary =
                s.ball.ownerId === f.actorId &&
                Math.hypot(actor.velocity.x, actor.velocity.y) < 0.35
                  ? stationary + 0.025
                  : 0;
              maxStationary = Math.max(maxStationary, stationary);
              if (s.ball.ownerId === f.actorId) ownerDuration += 0.025;
              else if (firstChange === null) firstChange = s.time;
              const pass = s.lastPassDiagnostic,
                challenge = s.lastChallenge;
              if (pass && pass.passId !== previousPass) {
                physical.push({ kind: 'pass', ...pass });
                previousPass = pass.passId;
              }
              if (challenge && challenge.id !== previousChallenge) {
                physical.push({ kind: 'challenge', ...challenge });
                previousChallenge = challenge.id;
              }
              if (tick % 40 === 0)
                sampled.push({
                  at: s.time,
                  owner: s.ball.ownerId ?? null,
                  ball: { ...s.ball },
                  separation: f.defenderIds.map((id) => {
                    const d = s.players.find((p) => p.id === id),
                      context = deriveDefensiveContext(s, id);
                    if (!d) return { id, unavailable: true };
                    return {
                      id,
                      position: d.position,
                      velocity: d.velocity,
                      ballDistance: distance(d.position, s.ball),
                      carrierDistance: distance(d.position, actor.position),
                      facingError: context?.facingError ?? null,
                      plan: derivePressingPlan(s, id),
                      eligible: enumerateDefensiveChallengeActions(s, id).length,
                    };
                  }),
                });
              if (situation === 'passive' && s.ball.ownerId !== f.actorId) break;
            }
          },
        );
        tacticalMatchStateSchema.parse(s);
        const row = {
          config: f.config,
          inputSha256: sha(input),
          initial,
          decisions: decisions.length,
          selectedTypes: decisions.reduce(
            (a, d) => ((a[d.action?.type ?? 'wait'] = (a[d.action?.type ?? 'wait'] ?? 0) + 1), a),
            {},
          ),
          attempts: attempts.length,
          releases: attempts.filter((t) => t.released).length,
          physicalPasses: physical.filter((p) => p.kind === 'pass').length,
          ownerDuration,
          maxStationary,
          firstChange,
          finalOwner: s.ball.ownerId ?? null,
          elapsedSeconds: s.time - input.time,
          canonicalTicks: Math.round((s.time - input.time) / 0.025),
          finalSha256: sha(s),
        };
        rows.push(row);
        traces.push({ config: f.config, input, decisions, attempts, physical, sampled });
      }
  }
  console.log(`${version}: ${skill}:${opposition} completed`);
}
const opening = createTacticalMatch(
  createFormationBenchmarkMatch({ opponent: '4-3-3', seed: 'pr188-opening' }).session,
);
const result = {
  schemaVersion: 1,
  version,
  classification: 'reconstructed development; not source-file replay or independent confirmation',
  humanExportsAvailable: false,
  protocol: {
    seconds: 12,
    dt: 0.025,
    pairedSeeds: ['pr188-development-paired-1', 'pr188-development-paired-2'],
    falsifier: 'passive stationary ownership despite reachable alternatives and intervention',
    limits: [
      '12s episodes do not prove absence of arbitrarily long stalemates',
      'initial placements are apparatus, subsequent motion canonical',
      'forecasts are subjective uncalibrated estimates',
    ],
  },
  source,
  sourceSha256: sha(source),
  runnerSha256: sha(readFileSync('scripts/benchmarkPr188.mjs', 'utf8').replaceAll('\r\n', '\n')),
  rows,
  opening: { scenario: opening.scenario, ball: opening.ball, restart: opening.restart ?? null },
  performance: {
    wallMs: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    rss: process.memoryUsage().rss,
  },
};
if (args.has('reference')) {
  const previous = JSON.parse(
    readFileSync(`docs/performance/PR188-labs-${args.get('reference')}.json`, 'utf8'),
  );
  result.referenceComparison = {
    version: args.get('reference'),
    sourceSha256: previous.sourceSha256,
    variants: rows.length,
    equalInputs:
      rows.length === previous.rows.length &&
      rows.every((r, i) => r.inputSha256 === previous.rows[i].inputSha256),
    equalFinalStates:
      rows.length === previous.rows.length &&
      rows.every((r, i) => r.finalSha256 === previous.rows[i].finalSha256),
    equalChoices:
      rows.length === previous.rows.length &&
      rows.every((r, i) => sha(r.selectedTypes) === sha(previous.rows[i].selectedTypes)),
  };
  if (
    !result.referenceComparison.equalInputs ||
    !result.referenceComparison.equalFinalStates ||
    !result.referenceComparison.equalChoices
  )
    process.exitCode = 1;
}
if (replay) {
  const previous = JSON.parse(readFileSync(path, 'utf8'));
  if (
    previous.sourceSha256 !== result.sourceSha256 ||
    previous.rows.length !== rows.length ||
    rows.some(
      (r, i) =>
        r.inputSha256 !== previous.rows[i].inputSha256 ||
        r.finalSha256 !== previous.rows[i].finalSha256 ||
        (!args.has('bare') && sha(r.selectedTypes) !== sha(previous.rows[i].selectedTypes)),
    )
  )
    throw Error('Deterministic canonical replay mismatch');
} else {
  writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
  writeFileSync(
    `docs/performance/PR188-traces-${version}.json.gz`,
    gzipSync(JSON.stringify(traces)),
  );
}
console.log(
  JSON.stringify({
    path,
    trials: rows.length,
    maxStationary: Math.max(...rows.map((r) => r.maxStationary)),
    wallMs: result.performance.wallMs,
  }),
);
