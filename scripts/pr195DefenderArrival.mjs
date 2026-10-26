import { z } from 'zod';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { estimatePlayerArrivalTime } from '../src/core/matchSimulation/playerArrival.ts';
import { estimateUsefulContact } from '../src/core/matchSimulation/opportunityWindows.ts';
import { integrateCanonicalMovement } from '../src/core/matchSimulation/canonicalMovement.ts';
import { projectLocomotion } from '../src/core/matchSimulation/locomotion.ts';
import { advanceMatchFitness } from '../src/core/matchSimulation/matchFitness.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { angleForVector, normalizeAngle } from '../src/core/matchSimulation/playerOrientation.ts';
import { digest } from './pr195SourceInventory.mjs';

const resultSchema = z.object({
  skill: z.number(),
  direction: z.string(),
  mirror: z.boolean(),
  estimated: z.number(),
  bounded: z.number(),
  observed: z.number().nullable(),
  inputHash: z.string(),
  finalHash: z.string(),
});
/** Prescribes a movement objective, never a position or successful contact.
 * This isolates locomotion-model error. Autonomous pass trials separately test
 * whether a defender chooses that target and actually disrupts/controls a ball. */
export const defenderArrivalTrials = () => {
  const rows = [];
  for (const skill of [20, 40, 60, 80, 100])
    for (const direction of ['toward', 'away', 'transverse'])
      for (const mirror of [false, true]) {
        const f = createCalibrationFixture({
            scenario: 'moving_defender',
            attacker: 60,
            defender: skill,
            mirror,
          }),
          s = f.state;
        let p = globalThis.structuredClone(s.players.find((p) => p.id === f.defenderId));
        const target = { x: p.position.x + 8, y: p.position.y };
        p.velocity =
          direction === 'toward'
            ? { x: 4, y: 0 }
            : direction === 'away'
              ? { x: -4, y: 0 }
              : { x: 0, y: mirror ? -4 : 4 };
        p.facingAngle = angleForVector(p.velocity);
        const state = {
          ...s,
          playerMovementIntent: {
            actorId: p.id,
            type: 'attack_space',
            target,
            startedAt: s.time,
            expiresAt: s.time + 10,
          },
        };
        const estimated = estimatePlayerArrivalTime(state, p, target, 'intercept').estimatedTime,
          bounded = estimateUsefulContact(
            { position: p.position, velocity: p.velocity, facing: p.facingAngle },
            target,
          ).playableSeconds;
        const inputHash = digest({ state, player: p, target });
        let observed = null;
        for (let tick = 0; tick < 400; tick++) {
          if (distance(p.position, target) <= 0.8) {
            observed = tick * 0.025;
            break;
          }
          const before = p,
            projected = projectLocomotion({ ...state, time: s.time + tick * 0.025 }, p, target);
          const motion = integrateCanonicalMovement(p, {
            target,
            targetSpeed: projected.targetSpeed,
            desiredFacingAngle: angleForVector({
              x: target.x - p.position.x,
              y: target.y - p.position.y,
            }),
            dt: 0.025,
            balance: 1,
            structural: false,
          });
          p = {
            ...p,
            position: motion.position,
            velocity: motion.velocity,
            facingAngle: motion.facingAngle,
          };
          p.fitness = advanceMatchFitness(before, {
            dt: 0.025,
            distance: distance(before.position, p.position),
            speed: Math.hypot(p.velocity.x, p.velocity.y),
            previousSpeed: Math.hypot(before.velocity.x, before.velocity.y),
            turnRadians: Math.abs(normalizeAngle(p.facingAngle - before.facingAngle)),
          });
        }
        rows.push(
          resultSchema.parse({
            skill,
            direction,
            mirror,
            estimated,
            bounded,
            observed,
            inputHash,
            finalHash: digest(p),
          }),
        );
      }
  return rows;
};
