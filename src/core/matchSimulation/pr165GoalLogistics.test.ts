// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { beginPostGoalReaction } from './postGoalReactions';
import { advanceRestartPlacement } from './restartLifecycle';
import { deriveRestartLegalReadiness } from './restartLaws';
import { distance } from './matchSpace';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { isMatchGoalkeeper } from './matchGoalkeeper';

const world = createCanonicalWorldDatabase();
const fixture = (conceding: 'home' | 'away', urgent = false, backNet = false) => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: `pr165-goal-${conceding}-${urgent}`,
      control: { mode: 'spectator' },
    }),
  );
  const scoring = conceding === 'home' ? 'away' : 'home';
  const x = conceding === 'home' ? (backNet ? -2.3 : -1) : backNet ? 107.3 : 106;
  const scorer = initial.players.find((p) => p.team === scoring && p.slot.position === 'striker')!;
  const keeper = initial.players.find((p) => p.team === conceding && isMatchGoalkeeper(p))!;
  const state: TacticalMatchState = {
    ...initial,
    time: urgent ? 87 * 60 : 60 * 60,
    status: 'second_half',
    scenario: 'open_play',
    playerAgencyEnabled: false,
    score: {
      home: scoring === 'home' ? 1 : urgent ? 2 : 0,
      away: scoring === 'away' ? 1 : urgent ? 2 : 0,
    },
    ball: { x, y: 34, height: 0, velocity: { x: 0, y: 0, z: 0 }, lastTouchPlayerId: scorer.id },
    players: initial.players.map((p) => ({
      ...p,
      velocity: { x: 0, y: 0 },
      position:
        p.id === keeper.id
          ? { x: conceding === 'home' ? 0.2 : 104.8, y: 34 }
          : p.id === scorer.id
            ? { x: conceding === 'home' ? 3 : 102, y: 34 }
            : p.position,
    })),
  };
  return {
    state: beginPostGoalReaction(state, scoring, scorer.id, `pr165-goal-${conceding}-${urgent}`),
    keeperId: keeper.id,
  };
};
const competitive = (s: TacticalMatchState) => ({
  players: s.statistics?.players.map((p) => [
    p.playerId,
    p.touches,
    p.passesAttempted,
    p.passesCompleted,
    p.passesReceived,
    p.shots,
    p.interceptions,
    p.possessionWon,
    p.possessionLost,
  ]),
  possession: [
    s.statistics?.teamAccounting?.home.possessionSeconds,
    s.statistics?.teamAccounting?.away.possessionSeconds,
  ],
  index: s.decisionIndex,
});

describe('PR165 single-ball post-goal logistics', () => {
  it.each(['home', 'away'] as const)(
    'retrieves from the deep back net and returns the %s keeper without a body snap',
    (conceding) => {
      const f = fixture(conceding, false, true);
      let state = f.state;
      let transfer = false;
      for (let i = 0; i < 4000 && state.restart?.phase !== 'release'; i++) {
        const previous = state.players.find((p) => p.id === f.keeperId)!;
        const previousBall = { ...state.ball };
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        const keeper = state.players.find((p) => p.id === f.keeperId)!;
        expect(distance(previous.position, keeper.position)).toBeLessThan(0.35);
        expect(distance(previousBall, state.ball)).toBeLessThan(0.35);
        const retrieval = state.restart?.retrieval;
        transfer ||= retrieval?.stage === 'transfer';
        if (retrieval?.playerId === f.keeperId && retrieval.stage === 'handoff')
          expect(distance(keeper.position, state.ball)).toBeLessThan(1.16);
      }
      expect(transfer).toBe(true);
      expect(state.restart?.phase).toBe('release');
      const keeper = state.players.find((p) => p.id === f.keeperId)!;
      expect(conceding === 'home' ? keeper.position.x : 105 - keeper.position.x).toBeGreaterThan(0);
      expect(distance(keeper.position, keeper.target)).toBeLessThan(0.1);
    },
  );
  it.each(['home', 'away'] as const)(
    'lets the nearest %s goalkeeper retrieve and transfer, while an outfielder transports to midfield',
    (conceding) => {
      const f = fixture(conceding);
      let state = f.state;
      const stats = competitive(state);
      let handoff = false,
        transfer = false,
        outfieldTransport = false,
        keeperRetrieval = false;
      let maxKeeperDepth = 0;
      for (let i = 0; i < 4000 && state.restart?.phase !== 'release'; i++) {
        const before = state;
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        const keeper = state.players.find((p) => p.id === f.keeperId)!;
        maxKeeperDepth = Math.max(
          maxKeeperDepth,
          conceding === 'home' ? keeper.position.x : 105 - keeper.position.x,
        );
        const r = state.restart?.retrieval;
        keeperRetrieval ||= r?.playerId === f.keeperId;
        handoff ||= r?.stage === 'handoff';
        transfer ||= r?.stage === 'transfer';
        outfieldTransport ||= r?.stage === 'transport' && r.playerId !== f.keeperId;
        expect(distance(before.ball, state.ball)).toBeLessThan(0.6);
        if (state.restart?.phase !== 'release') expect(competitive(state)).toEqual(stats);
      }
      expect({ keeperRetrieval, handoff, transfer, outfieldTransport }).toEqual({
        keeperRetrieval: true,
        handoff: true,
        transfer: true,
        outfieldTransport: true,
      });
      expect(state.restart?.phase).toBe('release');
      expect(state.restart?.restartTeam).toBe(conceding);
      expect(state.restart?.takerId).not.toBe(f.keeperId);
      expect(state.restart?.readiness?.legalReady).toBe(true);
      expect(maxKeeperDepth).toBeLessThan(12);
      const keeper = state.players.find((p) => p.id === f.keeperId)!;
      expect(distance(keeper.position, keeper.target)).toBeLessThan(0.1);
      expect(distance(keeper.position, state.restart!.targets[f.keeperId]!)).toBeLessThan(3.2);
      expect(state.statistics?.players.reduce((n, p) => n + p.passesAttempted, 0)).toBe(1);
      const parsed = tacticalMatchStateSchema.safeParse(JSON.parse(JSON.stringify(state)));
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
      for (let i = 0; i < 120; i++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      const activeKeeper = state.players.find((p) => p.id === f.keeperId)!;
      expect(
        conceding === 'home' ? activeKeeper.position.x : 105 - activeKeeper.position.x,
      ).toBeLessThan(20);
    },
  );
  it.each(['home', 'away'] as const)(
    'preserves urgent retrieval and completes the %s conceded kickoff',
    (conceding) => {
      let state = fixture(conceding, true).state;
      expect(state.postGoal?.urgent).toBe(true);
      const retriever = state.postGoal!.retrieverId;
      expect(isMatchGoalkeeper(state.players.find((p) => p.id === retriever)!)).toBe(false);
      let urgentTransport = false;
      for (let i = 0; i < 4000 && state.restart?.phase !== 'release'; i++) {
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        urgentTransport ||=
          state.restart?.retrieval?.playerId === retriever &&
          state.restart.retrieval.stage === 'transport';
      }
      expect(urgentTransport).toBe(true);
      expect(state.restart?.phase).toBe('release');
      expect(state.restart?.restartTeam).toBe(conceding);
      expect(state.restart?.readiness?.legalReady).toBe(true);
    },
  );
  it('models a nearby handover continuously and leaves competitive accounting untouched', () => {
    let state = fixture('home').state;
    for (let i = 0; i < 2000 && state.restart?.retrieval?.stage !== 'handoff'; i++)
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(state.restart?.retrieval?.stage).toBe('handoff');
    const retrieval = state.restart!.retrieval!;
    const point = { x: state.ball.x + 1.2, y: state.ball.y };
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === retrieval.recipientId ? { ...p, position: point, velocity: { x: 0, y: 0 } } : p,
      ),
      restart: { ...state.restart!, retrieval: { ...retrieval, handoffPoint: point } },
    };
    const before = competitive(state);
    state = advanceRestartPlacement(state, FIXED_MATCH_DT);
    expect(state.restart?.retrieval?.transfer?.method).toBe('hand');
    const from = { ...state.ball };
    state = advanceRestartPlacement(state, FIXED_MATCH_DT);
    expect(distance(from, state.ball)).toBeGreaterThan(0);
    expect(distance(from, state.ball)).toBeLessThan(0.2);
    expect(competitive(state)).toEqual(before);
    expect(deriveRestartLegalReadiness(state).ballReady).toBe(false);
  });
});
