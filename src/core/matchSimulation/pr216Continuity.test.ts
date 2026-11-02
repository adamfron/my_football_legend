// @vitest-environment node
import { expect, it } from 'vitest';
import {
  createPr215LooseScene,
  createPr215ReceptionBlocker,
} from '../../../scripts/pr215Scenarios';
import { advancePendingStrikeInterval } from './pendingStrikeInterval';
import { integrateCanonicalBodyRemainder } from './canonicalMovement';
import { playerBodyClearance } from './playerBodyContact';
import { multiBodyParticipants } from './multiBodyContact';
import { tacticalMatchStateSchema } from './matchState';

it('routes an unready passive foot through contact laws and ends the previous protected owner', () => {
  const s = createPr215ReceptionBlocker();
  const actor = s.players.find(
    (p) => Math.hypot(p.position.x - s.ball.x, p.position.y - s.ball.y) < 1,
  )!;
  const other = s.players.find((p) => p.id !== actor.id && p.slot.position !== 'goalkeeper')!;
  other.position = { x: s.ball.x + 1.5, y: s.ball.y };
  other.velocity = { x: 0, y: 0 };
  s.players = [actor, other];
  s.ball.ownerId = other.id;
  s.lastGroundContact = {
    actorId: actor.id,
    at: s.time,
    region: 'right_foot',
    point: { x: s.ball.x, y: s.ball.y },
    incomingVelocity: { x: -1, y: 0 },
    outgoingVelocity: { x: -1, y: 0 },
    retained: false,
    executed: false,
    physicalCount: 0,
  };
  let laws = 0,
    controls = 0;
  let out = s;
  for (let i = 0; i < 4 && !laws; i++)
    out = advancePendingStrikeInterval(out, { ...out, time: out.time + 0.025 }, 0.025, {
      ordinary: true,
      boundary: (s) => s,
      control: (s) => {
        controls++;
        return s;
      },
      body: (s) => {
        laws++;
        return s;
      },
    });
  expect(laws).toBe(1);
  expect(controls).toBe(0);
  expect(out.ball.ownerId).toBeUndefined();
  expect(out.ball.lastTouchPlayerId).toBe(actor.id);
  expect(out.executionWitnesses?.['ball-body-contact']?.executed).toBe(1);
});

for (const [name, a, b, va, vb] of [
  ['head-on', [30, 30], [31, 30], [10, 0], [-10, 0]],
  ['oblique', [30, 30], [30.7, 30.2], [8, 1], [-6, 0]],
  ['behind', [30, 30], [30.85, 30], [10, 0], [1, 0]],
  ['stationary', [30, 30], [30.8, 30], [8, 0], [0, 0]],
  ['opposed-turn', [30, 30], [30, 30.8], [0, 8], [0, -8]],
] as const)
  it(`detects ${name} before deep overlap without a ball-local pending action`, () => {
    const s = createPr215LooseScene();
    const players = s.players.filter((p) => p.slot.position !== 'goalkeeper').slice(0, 2);
    s.players = players;
    const [p, q] = players;
    p!.position = { x: a[0], y: a[1] };
    q!.position = { x: b[0], y: b[1] };
    p!.velocity = { x: va[0], y: va[1] };
    q!.velocity = { x: vb[0], y: vb[1] };
    s.ball = { x: 60, y: 50, height: 0.11, velocity: { x: 0, y: 0, z: 0 }, looseSince: s.time };
    expect(multiBodyParticipants(s, 0.025).size).toBe(2);
    const moved = {
      ...s,
      time: s.time + 0.025,
      players: s.players.map((p) => ({
        ...p,
        position: integrateCanonicalBodyRemainder(p, 0.025),
      })),
    };
    const out = advancePendingStrikeInterval(s, moved, 0.025, {
      ordinary: true,
      boundary: (s) => s,
      control: (s) => s,
      body: (s) => s,
    });
    expect(out.executionWitnesses?.unresolved).toBeUndefined();
    expect(out.playerBodyContacts?.some((c) => c.kind === 'impact' && c.normalImpulse > 0)).toBe(
      true,
    );
    expect(playerBodyClearance(out.players[0]!, out.players[1]!)).toBeGreaterThanOrEqual(-1e-8);
    expect(
      out.playerBodyContacts?.every(
        (c) => c.at >= s.time && c.at <= out.time && c.locomotionWorkAfter === 0,
      ),
    ).toBe(true);
    expect(tacticalMatchStateSchema.safeParse(out).success).toBe(true);
  });
