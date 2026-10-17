import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { findFirstBallContact, resolveBallRebound } from '../src/core/matchSimulation/ballFlight';
import { integrateBallFlight, type PhysicalBall } from '../src/core/matchSimulation/ballPhysics';
import { findPitchBoundaryCrossing } from '../src/core/matchSimulation/pitchBoundary';
import { pr172Manifest } from './pr172Evidence';
const vector = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const rowSchema = z.object({
  team: z.enum(['home', 'away']),
  endsSwitched: z.boolean(),
  kind: z.enum(['defender', 'goalkeeper']),
  action: z.enum(['block', 'parry', 'parry_away', 'failed_save']),
  offset: z.number(),
  normal: vector,
  incoming: vector,
  outgoing: vector,
  energyRatio: z.number().nonnegative().max(1.000001),
  forward: z.boolean(),
  crossing: z.unknown(),
});
const rows: z.infer<typeof rowSchema>[] = [];
for (const team of ['home', 'away'] as const)
  for (const endsSwitched of [false, true])
    for (const kind of ['defender', 'goalkeeper'] as const)
      for (const action of (kind === 'defender'
        ? ['block']
        : ['parry', 'parry_away', 'failed_save']) as (
        | 'block'
        | 'parry'
        | 'parry_away'
        | 'failed_save'
      )[])
        for (const offset of [-0.96, -0.7, -0.2, 0, 0.2, 0.7, 0.96]) {
          const dir = (team === 'home' ? 1 : -1) * (endsSwitched ? -1 : 1),
            orientation = { team, endsSwitched };
          const radius = kind === 'defender' ? 0.72 : 1.05;
          const body = { x: dir === 1 ? 103.8 : 1.2, y: 36.7, z: 0.9 };
          const y = body.y + offset * (radius + 0.11);
          const contact = findFirstBallContact({
            previous: { x: body.x - dir * 3, y, z: 0.9 },
            next: { x: body.x + dir * 0.2, y, z: 0.9 },
            attackingTeam: orientation,
            candidates: [{ kind, playerId: 'intervener', centre: body, radius }],
          })!;
          if (!contact?.surfaceNormal) throw new Error('Missing genuine CCD surface');
          const incoming = { x: dir * 26, y: 0, z: 0 };
          const outgoing = resolveBallRebound(kind, incoming, orientation, undefined, {
            surfaceNormal: contact.surfaceNormal,
            point: contact.point,
            ...(action !== 'block' ? { goalkeeperAction: action } : {}),
          }).velocity;
          let ball: PhysicalBall = {
              position: { ...contact.point },
              velocity: outgoing,
              airborne: false,
              bounceCount: 0,
            },
            crossing: unknown = null;
          for (let tick = 0; tick < 320; tick++) {
            const next = integrateBallFlight(ball, 0.025);
            const crossed = findPitchBoundaryCrossing(ball.position, next.position);
            if (crossed) {
              crossing = { ...crossed, at: (tick + 1) * 0.025 };
              break;
            }
            ball = next;
          }
          rows.push(
            rowSchema.parse({
              team,
              endsSwitched,
              kind,
              action,
              offset,
              normal: contact.surfaceNormal,
              incoming,
              outgoing,
              energyRatio: (outgoing.x ** 2 + outgoing.y ** 2 + outgoing.z ** 2) / 676,
              forward: outgoing.x * dir > 0,
              crossing,
            }),
          );
        }
writeFileSync(
  'docs/performance/PR172-deflection-physics.json',
  JSON.stringify(
    {
      version: 1,
      manifest: pr172Manifest(),
      scope:
        '112 deterministic contacts on the actual CCD surface; unopposed physical continuation after contact, separate from natural match and save-frequency evidence',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Measured ${rows.length} CCD deflections`);
