import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readDevelopmentInput } from './pr193Evidence.mjs';
import { read, hash, receipt, sourceIdentity, argumentsMap } from './pr197Evidence.mjs';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';
const args = argumentsMap(),
  version = args.get('version') ?? 'v1';
const outputFor = (path) =>
  `docs/performance/pr197/lineage/${basename(path).replace('.json.gz', `-lineage-${version}.json.gz`)}`;
if (args.has('input')) {
  const path = args.get('input'),
    old = read(path),
    source = sourceIdentity(),
    { input } = readDevelopmentInput(old.design, old.policy);
  let s = globalThis.structuredClone(input);
  Object.assign(s, {
    experimentalBallRecovery: true,
    experimentalRestartPreparation: true,
    experimentalTransitionIntelligence: true,
    experimentalStrategicClearances: true,
    experimentalActivePerception: true,
    experimentalReceivingPositions: true,
    experimentalTeamTempo: true,
    experimentalCanonicalArrival: false,
    ...(old.corrected
      ? {
          experimentalDefensiveReception: true,
          experimentalHeightAwarePassing: true,
          experimentalReceiverAnticipation: true,
        }
      : {}),
    seed: old.seed,
  });
  if (hash(s) !== old.initialHash) throw Error('Different replay input ' + path);
  const initialHash = hash(s),
    active = [],
    passOutcomes = [],
    started = performance.now(),
    cpu = process.cpuUsage();
  let ticks = 0;
  const finish = (e) =>
    passOutcomes.push({ ...e.metadata, outcome: interpretCanonicalOutcome(e.contract, e.samples) });
  withBoundedObserver(
    () => {},
    () => {
      while (!['full_time', 'abandoned'].includes(s.status) && s.time < 7200) {
        if (s.status === 'half_time') s = startSecondHalf(s);
        const before = s;
        s = step(s, 0.025);
        ticks++;
        const pass = s.lastPassDiagnostic;
        if (pass && pass.passId !== before.lastPassDiagnostic?.passId) {
          const actor = before.players.find((p) => p.id === pass.passerId);
          if (actor) {
            const target = pass.intendedTarget ?? pass.predictedReceptionPoint;
            active.push({
              contract: outcomeContractSchema.parse({
                version: 'original-delivery-v3',
                actorId: actor.id,
                receiverId: pass.intendedReceiverId,
                teamIds: before.players.filter((p) => p.team === actor.team).map((p) => p.id),
                opponentIds: before.players.filter((p) => p.team !== actor.team).map((p) => p.id),
                requestedAt: pass.releasedAt,
                releasedAt: pass.releasedAt,
                horizonAt: pass.releasedAt + 8,
                passId: pass.passId,
                shotId: null,
                previousShotId: before.ball.shot?.shotId ?? before.lastShot?.shotId ?? null,
                information: 'privileged_engineering_observer',
                conditionalOnRelease: true,
              }),
              samples: [],
              metadata: {
                passId: pass.passId,
                actorId: actor.id,
                receiverId: pass.intendedReceiverId,
                releasedAt: pass.releasedAt,
                delivery: pass.delivery ?? 'ground',
                intent: pass.intent ?? null,
                progress: (attacksRight(actor) ? 1 : -1) * (target.x - actor.position.x),
                length: Math.hypot(target.x - actor.position.x, target.y - actor.position.y),
                restartOrigin: !!before.restart,
              },
            });
          }
        }
        if (active.length) {
          const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
          for (let i = active.length - 1; i >= 0; i--) {
            const episode = active[i];
            episode.samples.push(sample);
            if (s.time >= episode.contract.horizonAt - 1e-8) {
              finish(episode);
              active.splice(i, 1);
            }
          }
        }
        if (ticks % 40000 === 0)
          console.log('lineage replay', old.design, old.policy, old.corrected, s.time.toFixed(1));
      }
    },
  );
  active.forEach(finish);
  const finalHash = hash(s),
    differences = [];
  for (const row of passOutcomes) {
    const previous = old.passOutcomes.find((p) => p.passId === row.passId);
    if (!previous) throw Error('Physical pass list changed');
    const fields = [
      'directReceiverTouch',
      'deflectedReceiverTouch',
      'receiverControl',
      'teamPossessionAtOneSecond',
      'defensiveContactAt',
      'defensiveDisruptionAt',
      'defensiveControlAt',
      'terminal',
      'censored',
    ];
    const changed = fields.filter((k) => previous.outcome[k] !== row.outcome[k]);
    if (changed.length)
      differences.push({
        passId: row.passId,
        fields: changed,
        before: Object.fromEntries(changed.map((k) => [k, previous.outcome[k]])),
        after: Object.fromEntries(changed.map((k) => [k, row.outcome[k]])),
      });
  }
  const equivalent =
    finalHash === old.finalHash &&
    ticks === old.ticks &&
    passOutcomes.length === old.passOutcomes.length &&
    s.status === 'full_time';
  receipt(outputFor(path), {
    schema: 'pr197-whole-match-lineage-v1',
    source,
    inputPath: path,
    design: old.design,
    policy: old.policy,
    corrected: old.corrected,
    seed: old.seed,
    initialHash,
    finalHash,
    expectedFinalHash: old.finalHash,
    ticks,
    status: s.status,
    equivalent,
    passOutcomes,
    differences,
    performance: {
      wallSeconds: (performance.now() - started) / 1000,
      cpu: process.cpuUsage(cpu),
      maxRSSKiB: process.resourceUsage().maxRSS,
      qualification:
        'Complete current-kernel replay with compact version3 observer; concurrent host, no football telemetry re-copying.',
    },
  });
  console.log(
    'complete match lineage',
    path,
    'same physical state',
    equivalent,
    'measurement differences',
    differences.length,
  );
  if (!equivalent) process.exitCode = 1;
} else {
  const selected = read('docs/performance/pr197/summary.json').fullMatches;
  if (selected.length !== 14) throw Error('Freeze fourteen complete selected matches first');
  const models = (args.get('models') ?? 'baseline,combined').split(',');
  const rows = selected.filter((r) => models.includes(r.model));
  const workers = Number(args.get('workers') ?? 4);
  let index = 0,
    failures = 0;
  mkdirSync('.benchmark-artifacts/pr197-lineage', { recursive: true });
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (index < rows.length) {
        const row = rows[index++],
          output = outputFor(row.path);
        if (existsSync(output)) {
          if (!read(output).equivalent) failures++;
          continue;
        }
        const log = openSync(`.benchmark-artifacts/pr197-lineage/${basename(output)}.log`, 'a');
        const code = await new Promise((resolve) => {
          const p = spawn(
            process.execPath,
            [
              '--max-semi-space-size=64',
              '--experimental-transform-types',
              '--import',
              './scripts/registerTypescriptLoader.mjs',
              'scripts/replayPr197Matches.mjs',
              `--input=${row.path}`,
              `--version=${version}`,
            ],
            { stdio: ['ignore', log, log], windowsHide: true },
          );
          p.once('error', (e) => {
            console.error(String(e));
            resolve(-1);
          });
          p.once('exit', resolve);
        });
        closeSync(log);
        if (code !== 0) failures++;
        console.log('whole match replay', row.path, 'exit', code);
      }
    }),
  );
  if (failures) process.exitCode = 1;
}
