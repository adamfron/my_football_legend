// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { advanceBallAcquisition } from './ballAcquisition';
import { playerContactGeometry } from './ballContactGeometry';
import { collectContactEvidence, projectControlEpisodes } from './contactEvidence';
import { createTacticalMatch, stepTacticalMatch } from './matchSimulation';
import { distance } from './matchSpace';
import { RandomGenerator } from '../random/RandomGenerator';

const world = createCanonicalWorldDatabase();
const fixture = (metres: number) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: `pr158-acquisition-reach:${metres}`,
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 600;
  state.actionCooldown = 20;
  state.players.forEach((p, i) => {
    p.position = {
      x: p.team === 'home' ? 20 - (i % 3) * 3 : 85 + (i % 3) * 3,
      y: 5 + (i % 10) * 5,
    };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  const claimant = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  claimant.position = { x: 52, y: 34 };
  claimant.target = { x: 52 + metres, y: 34 };
  claimant.facingAngle = Math.PI / 2;
  state.possessionTeam = 'home';
  state.ballEpisode = 0;
  state.ball = {
    x: 52 + metres,
    y: 34,
    velocity: { x: 0, y: 0 },
    looseSince: 599,
    lastTouchPlayerId: claimant.id,
  };
  state.ballAcquisition = {
    id: `pr158-acquisition:${metres}`,
    candidateId: claimant.id,
    startedAt: 599.8,
    readyAt: 599.95,
    ballEpisode: 0,
    origin: { x: state.ball.x, y: state.ball.y },
    controlQuality: 0.7,
    incomingSpeed: 0,
  };
  return { state, claimant };
};
const reachesBall = (state: ReturnType<typeof fixture>['state'], actorId: string) => {
  const actor = state.players.find((p) => p.id === actorId)!;
  const geometry = playerContactGeometry(actor);
  return (
    Math.min(distance(geometry.leftFoot, state.ball), distance(geometry.rightFoot, state.ball)) <=
    geometry.footReach
  );
};

describe('PR158 loose-ball acquisition requires physical contact', () => {
  it('a ready nomination at 2.06 m keeps pursuing instead of creating a false claim and loss', () => {
    const { state, claimant } = fixture(2.06);
    const attempted = advanceBallAcquisition(state, claimant, 2.1);
    expect(attempted.securedPlayerId).toBeUndefined();
    expect(attempted.failedVelocity).toBeUndefined();
    expect(attempted.state.ballAcquisition).toEqual(state.ballAcquisition);
    const next = stepTacticalMatch(state, 0.025);
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.ballAcquisition?.candidateId).toBe(claimant.id);
    expect(collectContactEvidence(state, next)).toEqual([]);
    expect(next.contactControlTelemetry?.failedControls ?? 0).toBe(0);
  });

  it.each([1.2, 2.06])(
    'a %s m nomination reaches the ball through canonical movement and starts exactly one public touch',
    (metres) => {
      const { state: initial, claimant } = fixture(metres);
      let state = initial;
      let episode;
      let publicTouches = 0;
      let acquiredAt: number | undefined;
      for (let tick = 0; tick < 120; tick++) {
        const previous = state;
        state = stepTacticalMatch(state, 0.025);
        const contacts = collectContactEvidence(previous, state);
        const projected = projectControlEpisodes(previous, state, contacts, episode);
        episode = projected.active;
        publicTouches += projected.started.length;
        if (state.ball.ownerId === claimant.id && acquiredAt === undefined) {
          expect(reachesBall(state, claimant.id)).toBe(true);
          acquiredAt = state.time;
        }
        if (acquiredAt === undefined) {
          expect(contacts).toEqual([]);
          expect(state.ball.ownerId).toBeUndefined();
        }
      }
      expect(acquiredAt).toBeDefined();
      expect(acquiredAt!).toBeGreaterThan(initial.time + 0.025);
      expect(state.ball.ownerId).toBe(claimant.id);
      expect(publicTouches).toBe(1);
      expect(state.contactControlTelemetry?.physicalContacts).toBeGreaterThan(1);
      expect(state.contactControlTelemetry?.failedControls).toBe(0);
      expect(state.ballEpisode).toBe(initial.ballEpisode);
    },
  );

  it('a reachable ready acquisition still secures, while height invalidates a ground-foot claim', () => {
    const { state, claimant } = fixture(0.8);
    expect(advanceBallAcquisition(state, claimant, 2.1).securedPlayerId).toBe(claimant.id);
    const highBall = { ...state, ball: { ...state.ball, height: 0.8 } };
    expect(advanceBallAcquisition(highBall, claimant, 2.1).securedPlayerId).toBeUndefined();
  });

  it('a future nomination yields to a reachable rival with their own preparation and no early random draw', () => {
    const { state, claimant } = fixture(1.5);
    const rival = state.players.find((p) => p.team !== claimant.team)!;
    rival.position = { x: state.ball.x + 0.2, y: state.ball.y };
    rival.facingAngle = -Math.PI / 2;
    const random = vi.spyOn(RandomGenerator.prototype, 'float');
    try {
      const redirected = advanceBallAcquisition(state, claimant, 2.1);
      expect(redirected.securedPlayerId).toBeUndefined();
      expect(redirected.state.ballAcquisition?.candidateId).toBe(rival.id);
      expect(redirected.state.ballAcquisition?.startedAt).toBe(state.time);
      expect(redirected.state.ballAcquisition!.readyAt).toBeGreaterThan(state.time);
      expect(random).not.toHaveBeenCalled();
      const ready = {
        ...redirected.state,
        time: redirected.state.ballAcquisition!.readyAt + 0.025,
      };
      expect(advanceBallAcquisition(ready, rival, 2.1).securedPlayerId).toBe(rival.id);
      // The old nominee cannot contest from outside the same real foot reach.
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it('an unavailable ground contact neither consumes RNG nor lets a restricted thrower replace the nominee', () => {
    const { state, claimant } = fixture(1.5);
    const thrower = state.players.find((p) => p.team !== claimant.team)!;
    thrower.position = { x: state.ball.x + 0.2, y: state.ball.y };
    thrower.facingAngle = -Math.PI / 2;
    state.throwInRestriction = { throwerId: thrower.id, releasedAt: state.time - 1 };
    const random = vi.spyOn(RandomGenerator.prototype, 'float');
    try {
      for (let sample = 0; sample < 10; sample++) {
        const result = advanceBallAcquisition(
          { ...state, time: state.time + sample * 0.025 },
          claimant,
          2.1,
        );
        expect(result.securedPlayerId).toBeUndefined();
        expect(result.state.ballAcquisition?.candidateId).toBe(claimant.id);
      }
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});
