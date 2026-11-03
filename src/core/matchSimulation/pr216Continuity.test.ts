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
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  advanceLowerBodyPose,
  deriveLowerBodyGeometry,
  interpolateLowerBodyPose,
} from './lowerBodyGeometry';
import { canonicalStrikeFoot, findStrikeIntervalContact } from './pendingStrike';
import { stepTacticalMatch } from './matchSimulation';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
const reload = (value: unknown) =>
  tacticalMatchStateSchema.parse(value) as unknown as TacticalMatchState;

it('continues the saved competing boot/support rearming incident without penetrating a proxy body', () => {
  let s = reload(
    JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr216/p1-support-rearm-input.json.gz')).toString(),
    ),
  );
  for (let i = 0; i < 400; i++) s = stepTacticalMatch(s, 0.025);
  expect(s.executionWitnesses?.unresolved).toBeUndefined();
});

it('refines an actual supported crossing before a competing event without enlarging the foot', () => {
  const s = createPr215LooseScene();
  s.ball = { x: 50, y: 34, height: 0.11, velocity: { x: 0, y: 0, z: 0 }, looseSince: s.time };
  const hit = findStrikeIntervalContact(
    s,
    0.025,
    () => ({
      position: { x: 50.5, y: 34, z: 0.04 },
      velocity: { x: 0, y: 0, z: 0 },
      speedBound: 0,
    }),
    0.035,
    2560,
    (t) => ({
      position: { x: 50 + 20 * t, y: 34, z: 0.11 },
      velocity: { x: 20, y: 0, z: 0 },
      airborne: false,
      bounceCount: 0,
    }),
  );
  expect(hit.outcome).toBe('contact');
  expect(hit.local).toBeCloseTo((0.5 - Math.sqrt(0.145 ** 2 - 0.07 ** 2)) / 20, 8);
  expect(hit.evaluations).toBeLessThanOrEqual(2560);
});

it('hands a settled shot rebound back to the physical reaching interval without erasing shot lineage', () => {
  let s = reload(
    JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr216/p1-settled-rebound-input.json.gz'),
      ).toString(),
    ),
  );
  const initial = s;
  expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
  for (let i = 0; i < 400; i++) s = stepTacticalMatch(s, 0.025);
  expect(s.executionWitnesses?.unresolved).toBeUndefined();
  expect(s.decisionIndex).toBeGreaterThan(initial.decisionIndex);
  expect(s.lastGroundContact!.at).toBeGreaterThan(initial.time);
});

it('services an unlabelled free ball after the historical aerial consumer declines control', () => {
  let s = reload(
    JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr216/p1-unlabelled-loose-input.json.gz'),
      ).toString(),
    ),
  );
  expect(s.ball.ownerId).toBeUndefined();
  expect(s.ball.looseSince).toBeUndefined();
  expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
  const initial = s;
  for (let i = 0; i < 400; i++) s = stepTacticalMatch(s, 0.025);
  expect(s.executionWitnesses?.unresolved).toBeUndefined();
  expect(s.decisionIndex).toBeGreaterThan(initial.decisionIndex);
});

it('keeps a latched reaching foot solid when a standing stroke starts and recovers', () => {
  let s = reload(
    JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr216/p1-standing-latch-input.json.gz')).toString(),
    ),
  );
  for (let i = 0; i < 24; i++) s = stepTacticalMatch(s, 0.025);
  expect(s.executionWitnesses?.unresolved).toBeUndefined();
  expect(s.defensiveChallenge).toBeUndefined();
  expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
});

it('spends a finite ankle budget and keeps the searched foot on the connected IK geometry', () => {
  const actor = createPr215LooseScene().players.find((p) => p.slot.position !== 'goalkeeper')!;
  actor.facingAngle = 0.6;
  delete actor.lowerBodyPose;
  const next = {
    ...actor,
    position: { x: actor.position.x + 0.03, y: actor.position.y + 0.01 },
    facingAngle: 0.63,
    lowerBodyPose: advanceLowerBodyPose(actor, 0.025, {
      x: actor.position.x + 0.6,
      y: actor.position.y + 0.2,
    }),
  };
  expect(
    Math.hypot(next.lowerBodyPose!.reachOffset!.x, next.lowerBodyPose!.reachOffset!.y),
  ).toBeCloseTo(0.03, 12);
  for (const t of [0, 0.00625, 0.0125, 0.01875, 0.025])
    for (const foot of ['left', 'right'] as const) {
      const f = t / 0.025;
      const geometry = deriveLowerBodyGeometry({
        ...next,
        position: { x: actor.position.x + 0.03 * f, y: actor.position.y + 0.01 * f },
        facingAngle: 0.6 + 0.03 * f,
        lowerBodyPose: interpolateLowerBodyPose(actor.lowerBodyPose, next.lowerBodyPose, f),
      })[foot];
      const searched = canonicalStrikeFoot(undefined, actor, next, foot, 0, 0.025, t);
      expect(searched.position.x).toBeCloseTo(geometry.foot.x, 12);
      expect(searched.position.y).toBeCloseTo(geometry.foot.y, 12);
      expect(
        Math.hypot(
          geometry.knee.x - geometry.hip.x,
          geometry.knee.y - geometry.hip.y,
          geometry.knee.z - geometry.hip.z,
        ),
      ).toBeCloseTo(geometry.thighLength, 12);
    }
  const returned = advanceLowerBodyPose(next, 0.025, null)!;
  expect(Math.hypot(returned.reachOffset!.x, returned.reachOffset!.y)).toBeLessThan(1e-10);
  expect(advanceLowerBodyPose(next, 0.025)?.reachOffset).toEqual(next.lowerBodyPose!.reachOffset);
});

it('escapes the preserved resting loose-ball deadlock through actual foot contact and onward decisions', () => {
  const old = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr216/canonical-final-v2.json.gz')).toString(),
  );
  let s = reload(old.match.terminal);
  const initial = s;
  for (let i = 0; i < 400; i++) s = stepTacticalMatch(s, 0.025);
  expect(s.executionWitnesses?.unresolved).toBeUndefined();
  expect(s.decisionIndex).toBeGreaterThan(initial.decisionIndex);
  expect(s.lastGroundContact!.at).toBeGreaterThan(initial.time);
  expect(s.executionWitnesses!['controlled-reception']!.executed).toBeGreaterThan(
    initial.executionWitnesses!['controlled-reception']!.executed,
  );
  expect(Math.hypot(s.ball.x - initial.ball.x, s.ball.y - initial.ball.y)).toBeGreaterThan(0.5);
  expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
});

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
