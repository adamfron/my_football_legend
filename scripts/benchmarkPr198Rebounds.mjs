import console from 'node:console';
import process from 'node:process';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { sampleCanonicalOutcome } from '../src/core/matchSimulation/canonicalOutcome.ts';
import {
  createDisruptionLedger,
  observeDisruption,
  disruptionLedgerSchema,
} from '../src/core/matchSimulation/disruptionLedger.ts';
import { args, hash, sourceIdentity, finish } from './pr198Evidence.mjs';
const options = args(),
  identity = sourceIdentity(),
  rows = [];
for (const scenario of ['good_shot', 'rebound', 'blocked_shot', 'keeper_away'])
  for (const skill of [40, 80])
    for (let seed = 0; seed < 4; seed++)
      for (const mirror of [false, true]) {
        const f = createCalibrationFixture({
            scenario,
            attacker: skill,
            defender: 60,
            seed: `pr198-rebound-development-${seed}`,
            mirror,
          }),
          initial = f.state;
        Object.assign(initial, {
          experimentalDefensiveReception: true,
          experimentalBallRecovery: true,
        });
        let s = resolveMatchAction(globalThis.structuredClone(initial), f.action, 'autonomous_npc');
        const originalShotId = s.ball.shot?.shotId ?? null,
          ledger = createDisruptionLedger(initial),
          events = [];
        for (let tick = 0; tick < 320; tick++) {
          const before = s;
          s = step(s, 0.025);
          const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
          observeDisruption(ledger, initial, before, s, 'home', undefined, sample);
          if (
            s.lastShot?.shotId === originalShotId &&
            (s.lastShot.goalkeeperAction !== before.lastShot?.goalkeeperAction ||
              s.lastShot.outcome !== before.lastShot?.outcome)
          )
            events.push({
              at: s.time,
              shot: s.lastShot,
              contact: s.lastBallContact ?? null,
              ownerId: s.ball.ownerId ?? null,
              ball: s.ball,
            });
          if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status)) break;
        }
        rows.push({
          scenario,
          skill,
          seed,
          mirror,
          classification: 'forced ordinary shot; later phase events separately retained',
          inputHash: hash(initial),
          action: f.action,
          originalShotId,
          events,
          originalKeeperLoose: events.some(
            (e) =>
              e.contact?.kind === 'goalkeeper' &&
              ['parry', 'parry_away'].includes(e.shot.goalkeeperAction) &&
              !e.ownerId,
          ),
          ledger: disruptionLedgerSchema.parse(ledger),
          finalHash: hash(s),
          score: s.score,
        });
        if (rows.length % 32 === 0) console.log('rebounds', rows.length);
      }
finish(
  `docs/performance/pr198/rebounds-${options.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr198-rebound-lab-v1',
    source: identity,
    method:
      'Preregistered four geometries, two ability bands, four development seeds and mirrors. Every requested shot and negative outcome retained. Only a keeper contact on the original shot with unowned outgoing ball counts as its rebound. No rebound or corner guaranteed.',
    rows,
  },
  { cpu: process.cpuUsage(), maxRSSKiB: process.resourceUsage().maxRSS },
);
console.log(
  'original physically loose keeper rebounds',
  rows.filter((r) => r.originalKeeperLoose).length,
  'of',
  rows.length,
);
