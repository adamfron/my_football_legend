// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ballBodyClearance,
  retainContinuousBodyContacts,
  separateBallFromBody,
  supportContinuousBodyContacts,
} from './ballContactResolution';
import {
  BALL_RADIUS,
  deriveWallContactCandidate,
  findFirstBallContact,
  resolveBallRebound,
  type ContactCandidate,
} from './ballFlight';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { assertMatchStatisticsInvariants } from './playerMatchStats';
import type { TacticalMatchState } from './matchState';

const zero = { x: 0, y: 0, z: 0 };
const body: ContactCandidate = {
  kind: 'defender',
  playerId: 'body',
  centre: { x: 50, y: 34, z: 0.9 },
  radius: 0.72,
};
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

describe('PR178 continuous contacts and geometric separation', () => {
  it.each([0.11, 0.42, 0.9, 1.65])(
    'resolves stationary overlap at height %s without crossing grass',
    (z) => {
      const point = { x: 50.15, y: 34, z };
      const separated = separateBallFromBody(point, body, zero);
      expect(separated.z).toBeGreaterThanOrEqual(BALL_RADIUS);
      expect(ballBodyClearance(separated, body)).toBeGreaterThan(0);
      expect(
        Math.hypot(separated.x - point.x, separated.y - point.y, separated.z - point.z),
      ).toBeLessThan(0.84);
    },
  );
  it('retains every overlapping body, then re-arms only after real separation', () => {
    const second = { ...body, playerId: 'second', centre: { ...body.centre, x: 50.1 } };
    const point = { x: 50.2, y: 34, z: 0.9 };
    expect(retainContinuousBodyContacts(point, [body, second], ['body', 'second'])).toEqual([
      'body',
      'second',
    ]);
    expect(
      retainContinuousBodyContacts({ ...point, x: 52 }, [body, second], ['body', 'second']),
    ).toEqual([]);
    expect(
      findFirstBallContact({
        previous: { ...point, x: 52 },
        next: point,
        attackingTeam: 'home',
        candidates: [body],
      })?.playerId,
    ).toBe('body');
  });
  it('does not reflect or dissipate an already separating ball', () => {
    const velocity = { x: 3, y: 1, z: 0 };
    expect(
      resolveBallRebound('defender', velocity, 'home', undefined, {
        surfaceNormal: { x: 1, y: 0, z: 0 },
      }).velocity,
    ).toEqual(velocity);
  });
  it('uses relative measured body motion and dissipates energy in its rest frame', () => {
    const surfaceVelocity = { x: 4, y: 0, z: 0 },
      incoming = { x: 1, y: 2, z: 0 };
    const result = resolveBallRebound('defender', incoming, 'home', undefined, {
      surfaceNormal: { x: 1, y: 0, z: 0 },
      surfaceVelocity,
    }).velocity;
    expect(result.x).toBeGreaterThan(surfaceVelocity.x);
    expect(Math.hypot(result.x - 4, result.y, result.z)).toBeLessThan(
      Math.hypot(incoming.x - 4, incoming.y, incoming.z),
    );
  });
  it('does not create kinetic energy while supporting a stationary body', () => {
    const result = supportContinuousBodyContacts(
      { x: 50.4, y: 34, z: 0.42 },
      { x: -2, y: 1, z: -1 },
      [body],
      0.025,
    );
    expect(ballBodyClearance(result.position, body)).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(result.velocity.x, result.velocity.y, result.velocity.z)).toBeLessThanOrEqual(
      Math.sqrt(6),
    );
  });
  it.each([2, 3])('resolves %s nearby moving bodies deterministically', (count) => {
    const bodies = Array.from({ length: count }, (_, i) => ({
      ...body,
      playerId: `body-${i}`,
      centre: { x: 50 + i * 0.3, y: 34 + i * 0.1, z: 0.9 },
      previousCentre: { x: 50 + i * 0.3 - 0.01, y: 34 + i * 0.1, z: 0.9 },
    }));
    const run = () =>
      supportContinuousBodyContacts({ x: 50.25, y: 33.85, z: 0.42 }, zero, bodies, 0.025);
    expect(run()).toEqual(run());
    for (const b of bodies) expect(ballBodyClearance(run().position, b)).toBeGreaterThan(-0.0001);
  });
  it('resolves a finite foot/lower-leg wall capsule at the floor', () => {
    const wall = deriveWallContactCandidate('wall', { x: 50, y: 34 }, 1.8);
    const result = separateBallFromBody({ x: 50.1, y: 34, z: 0.11 }, wall, zero);
    expect(ballBodyClearance(result, wall)).toBeGreaterThanOrEqual(0);
    expect(result.z).toBeGreaterThanOrEqual(0.11);
  });
  it('permits an immediate different-player block and later same-player impact', () => {
    const other = { ...body, playerId: 'attacker', centre: { ...body.centre, x: 49 } };
    const query = {
      previous: { x: 49.9, y: 34, z: 0.9 },
      next: { x: 48, y: 34, z: 0.9 },
      attackingTeam: 'home' as const,
      candidates: [other],
    };
    expect(findFirstBallContact(query)?.playerId).toBe('attacker');
    expect(
      findFirstBallContact({
        ...query,
        previous: query.next,
        next: { ...query.previous, x: 51 },
        candidates: [body],
      })?.playerId,
    ).toBe('body');
  });
});

describe.each(['legacy-pr176', 'state-value-v1'] as const)(
  'PR178 exact frozen replay: %s',
  (policy) => {
    it('reaches genuine control, preserves identities and repeats the entire final state', () => {
      const initial = JSON.parse(
        gunzipSync(
          readFileSync('docs/performance/pr177-evidence/loose-contact-loop-input.json.gz'),
        ).toString(),
      ) as TacticalMatchState;
      expect(hash(initial)).toBe(
        '5dd675727630c61d2bd57ef01f1de912a70d38a93fd461231c0ffd15184c5fad',
      );
      const run = () => {
        let state = structuredClone(initial),
          controlled = false;
        state.decisionPolicy = policy;
        delete state.decisionReadiness;
        for (let tick = 0; tick < 200; tick++) {
          const previous = state;
          state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
          controlled ||= Boolean(state.ball.ownerId);
          for (const v of [
            state.ball.x,
            state.ball.y,
            state.ball.height ?? 0,
            state.ball.velocity?.x ?? 0,
            state.ball.velocity?.y ?? 0,
            state.ball.velocity?.z ?? 0,
          ])
            expect(Number.isFinite(v)).toBe(true);
          expect(
            Math.hypot(
              state.ball.velocity?.x ?? 0,
              state.ball.velocity?.y ?? 0,
              state.ball.velocity?.z ?? 0,
            ),
          ).toBeLessThan(80);
          if (
            state.lastBallContact?.at !== previous.lastBallContact?.at &&
            state.lastBallContact?.playerId
          )
            expect(previous.ball.continuousBodyContacts ?? []).not.toContain(
              state.lastBallContact.playerId,
            );
        }
        expect(controlled).toBe(true);
        assertMatchStatisticsInvariants(state.statistics!);
        return hash(state);
      };
      expect(run()).toBe(run());
    });
  },
);

it('uses the velocity at an initial-overlap contact before advancing the remaining time', () => {
  const state = JSON.parse(
    gunzipSync(
      readFileSync('docs/performance/pr177-evidence/loose-contact-loop-input.json.gz'),
    ).toString(),
  ) as TacticalMatchState;
  state.decisionPolicy = 'state-value-v1';
  delete state.decisionReadiness;
  const speed = Math.hypot(
    state.ball.velocity!.x,
    state.ball.velocity!.y,
    state.ball.velocity!.z ?? 0,
  );
  const next = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  expect(next.lastBallContact!.segmentFraction).toBe(0);
  expect(next.lastBallContact!.preContactSpeed).toBeCloseTo(speed, 10);
});
