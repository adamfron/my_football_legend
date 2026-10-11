// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { awardNaturalRestart } from './restartScenarios';
import { deriveRestartLegalReadiness } from './restartLaws';
import { enumerateRestartActions, resolveMatchAction } from './matchActions';
import { distance } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { observeRestartLiveness, restartBlockingDiagnosticSchema } from './restartLiveness';

const world = createCanonicalWorldDatabase();
/** Historical export absent: equivalent late-match packed geometry at the reported spot. */
const fixture = (team: 'home' | 'away', human = false) => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'lab-mv47opno',
      control: { mode: 'spectator' },
    }),
  );
  const rng = RandomGenerator.fromSeed('pr165-packed-7');
  const mirror = (point: { x: number; y: number }) =>
    team === 'home' ? point : { x: 105 - point.x, y: 68 - point.y };
  const spot = mirror({ x: 78.775, y: 23.418 });
  const input: TacticalMatchState = {
    ...initial,
    time: 3529,
    status: 'second_half',
    scenario: 'open_play',
    actionCooldown: 30,
    playerAgencyEnabled: false,
    ball: { ...spot, height: 0, velocity: { x: 0, y: 0, z: 0 } },
    players: initial.players.map((p) => ({
      ...p,
      team: team === 'home' ? p.team : p.team === 'home' ? 'away' : 'home',
      neutralAnchor: mirror(p.neutralAnchor),
      anchor: mirror(p.anchor),
      position: mirror(
        p.profile.primaryPosition === 'goalkeeper'
          ? p.position
          : { x: 68.775 + rng.float() * 30, y: 9.418 + rng.float() * 28 },
      ),
      velocity: { x: 0, y: 0 },
    })),
  };
  const state = awardNaturalRestart(input, 'free_kick_close', {
    restartTeam: team,
    cause: 'foul',
    incidentId: `pr165-packed-7:${team}`,
    incidentPoint: spot,
    eventAt: 3529,
  });
  return {
    ...state,
    ...(human ? { controlledFootballerId: state.restart!.takerId, playerAgencyEnabled: true } : {}),
  };
};

describe('PR165 equivalent late free-kick wall preparation', () => {
  it('keeps the legal wall slots independent of overlapping attacking plans', () => {
    const state = fixture('home');
    const wall = state.players.filter((p) => state.restart!.roles[p.id]?.key === 'wall');
    expect(wall).toHaveLength(4);
    for (const player of wall) {
      expect(state.restart!.targets[player.id]).toEqual(
        state.restart!.roles[player.id]!.zone.centre,
      );
      for (const other of wall.filter((p) => p.id !== player.id))
        expect(
          distance(state.restart!.targets[player.id]!, state.restart!.targets[other.id]!),
        ).toBeGreaterThan(1.29);
    }
  });
  it('reports unchanged blockers, assigned targets, body clearance and transition history without intervening', () => {
    const initial = fixture('home');
    let state: TacticalMatchState = {
      ...initial,
      restart: {
        ...initial.restart!,
        retrieval: { playerId: initial.restart!.takerId, stage: 'placed' },
        readiness: {
          ballReady: true,
          takerReady: true,
          legalReady: false,
          tacticalReady: true,
          blockers: ['wall_developing'],
        },
      },
    };
    const before = structuredClone(state);
    for (let i = 0; i <= 40; i++)
      state = observeRestartLiveness({ ...state, time: initial.time + i });
    const diagnostic = state.restartLivenessDiagnostics!.at(-1)!;
    expect(restartBlockingDiagnosticSchema.safeParse(diagnostic).success).toBe(true);
    expect(diagnostic).toMatchObject({
      classification: 'soft_lock',
      blockers: ['wall_developing'],
      retrieverId: initial.restart!.takerId,
      transitions: [{ at: initial.time, phase: 'preparing', retrievalStage: 'placed' }],
    });
    expect(
      diagnostic.actors.every(
        (p) =>
          p.targetDistance !== undefined &&
          p.minimumBodySeparation !== undefined &&
          p.assignedTarget,
      ),
    ).toBe(true);
    expect(state.players).toEqual(before.players);
    expect(state.ball).toEqual(before.ball);
    expect(state.restart).toEqual(before.restart);
    expect(state.statistics).toEqual(before.statistics);
    expect(state.decisionIndex).toBe(before.decisionIndex);
  });
  it.each(['home', 'away'] as const)(
    'physically prepares a packed %s free kick and preserves the human boundary',
    (team) => {
      let state = fixture(team, true);
      const award = state.restart!.awardId;
      const started = state.time;
      let placed = false;
      for (let i = 0; i < 2000 && state.restart?.phase !== 'awaiting_decision'; i++) {
        const before = state;
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        expect(distance(before.ball, state.ball)).toBeLessThan(0.4);
        placed ||= state.restart?.retrieval?.stage === 'placed';
      }
      expect(placed).toBe(true);
      expect(state.time).toBeGreaterThan(started);
      expect(state.restart?.phase).toBe('awaiting_decision');
      expect(deriveRestartLegalReadiness(state).ready).toBe(true);
      expect(state.restart?.selectedAction).toBeUndefined();
      const waiting = state;
      for (let i = 0; i < 20; i++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.time).toBe(waiting.time);
      expect(state.decisionIndex).toBe(waiting.decisionIndex);
      const action = enumerateRestartActions(state).find((a) => a.type === 'pass')!;
      expect(action).toBeDefined();
      state = resolveMatchAction(state, action, 'human_selected');
      for (let i = 0; i < 1600 && state.restart?.phase !== 'release'; i++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.restart?.phase).toBe('release');
      expect(state.restart?.selectedAction).toEqual(action);
      expect(state.restart?.selectedSource).toBe('human_selected');
      expect(state.restart?.readiness?.blockers).toEqual([]);
      const releaseBall = { ...state.ball };
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(distance(releaseBall, state.ball)).toBeGreaterThan(0.01);
      expect(Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0)).toBeGreaterThan(
        1,
      );
      for (let i = 0; i < 300 && state.restart?.awardId === award; i++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.restart?.awardId).not.toBe(award);
      expect(state.stoppageLedger?.intervals.filter((s) => s.awardId === award)).toHaveLength(1);
    },
  );
  it('completes the same preparation autonomously through actual physical release', () => {
    let state = fixture('home');
    for (let i = 0; i < 2400 && state.restart?.phase !== 'release'; i++)
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(state.restart?.phase).toBe('release');
    expect(state.restart?.selectedSource).toBe('autonomous_npc');
    expect(state.decisionIndex).toBeGreaterThan(0);
    expect(state.ball.from).toBeDefined();
    expect(state.ball.launchSpeed).toBeGreaterThan(0);
  });
});
