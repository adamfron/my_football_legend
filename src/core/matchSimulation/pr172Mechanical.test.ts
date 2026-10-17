// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { startSecondHalf, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { deriveDefensiveWall, reconcileRestartWallTargets } from './restartGeometry';
import { areKickoffGoalkeepersReady, deriveRestartLegalReadiness } from './restartLaws';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { attacksRight, distance } from './matchSpace';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { shotProbeFixture } from '../../../scripts/pr171Probes';

const replay = (name: string): TacticalMatchState =>
  JSON.parse(gunzipSync(readFileSync(`docs/performance/pr172-states/${name}.json.gz`)).toString());

describe('PR172 original mechanical failures', () => {
  it.each([false, true])('completes the exact keeper handover tick, reversed=%s', (reversed) => {
    const before = replay(`pr171-failure-${reversed}`);
    const after = stepTacticalMatchAfterDecisionProbe(before);
    expect(after).toEqual(stepTacticalMatchAfterDecisionProbe(JSON.parse(JSON.stringify(before))));
    tacticalMatchStateSchema.parse(after);
    expect(new Set(after.players.map((p) => p.id)).size).toBe(after.players.length);
    for (const team of ['home', 'away'] as const) {
      const players = after.players.filter((p) => p.team === team);
      // In the reversed original a second legal outfield replacement is still walking in.
      const pending = after.substitutionState!.pending.filter((p) => p.team === team).length;
      expect(players).toHaveLength(11 - pending);
      expect(players.filter(isMatchGoalkeeper)).toHaveLength(1);
      expect(players.filter((p) => !isMatchGoalkeeper(p))).toHaveLength(10 - pending);
    }
    for (const p of after.players) {
      expect(after.restart!.targets[p.id]).toBeDefined();
      const original = before.players.find((q) => q.id === p.id);
      if (original) expect(distance(p.position, original.position)).toBeLessThan(0.5);
    }
    const fact = after.substitutionState!.completed.at(-1)!;
    expect(after.players.some((p) => p.id === fact.outgoingId)).toBe(false);
    expect(after.players.filter((p) => p.id === fact.incomingId)).toHaveLength(1);
    const keeper = after.players.find((p) => p.id === fact.incomingId)!;
    expect(isMatchGoalkeeper(keeper)).toBe(true);
    expect(distance(keeper.position, { x: 52.5, y: 0.2 })).toBeLessThan(0.3);
  });

  it.each(['central_possession-true', 'press_low-false'])(
    'legally releases the original censored %s state',
    (name) => {
      let state = replay(`pr171-censored-${name}`);
      const original = state;
      const award = state.restart!.awardId;
      const repaired = reconcileRestartWallTargets(state);
      expect(repaired.players).toBe(state.players);
      expect(repaired.ball).toBe(state.ball);
      expect(reconcileRestartWallTargets(repaired)).toBe(repaired);
      let legallyReady = false;
      for (
        let i = 0;
        i < 1200 && state.restart?.awardId === award && state.restart?.phase !== 'release';
        i++
      ) {
        if (deriveRestartLegalReadiness(state).ready) legallyReady = true;
        const next = stepTacticalMatchAfterDecisionProbe(state);
        for (const p of next.players) {
          const previous = state.players.find((q) => q.id === p.id);
          if (previous) expect(distance(p.position, previous.position)).toBeLessThan(0.5);
        }
        state = next;
      }
      expect(legallyReady).toBe(true);
      expect(state.restart?.awardId).toBe(award);
      expect(state.restart?.phase).toBe('release');
      expect(state.time - original.time).toBeLessThan(30);
      expect(state.score).toEqual(original.score);
      // The original ledger remains honest: only actual extra preparation is added once.
      expect(state.timekeeping!.requiredEndAt - original.timekeeping!.requiredEndAt).toBeLessThan(
        30,
      );
    },
  );

  it.each([0, 105])('keeps a complete wall spaced near goal line x=%s', (x) => {
    for (const y of [8, 56.33427471481506, 59, 67]) {
      const ball = { x: x === 0 ? 1.58 : 103.42, y },
        goal = { x, y: 34 };
      const wall = deriveDefensiveWall(ball, goal, 4);
      for (let i = 0; i < wall.length; i++) {
        expect(distance(ball, wall[i]!)).toBeGreaterThanOrEqual(9.499);
        expect(wall[i]!.x).toBeGreaterThanOrEqual(0.399);
        expect(wall[i]!.x).toBeLessThanOrEqual(104.601);
        for (let j = i + 1; j < wall.length; j++)
          expect(distance(wall[i]!, wall[j]!)).toBeGreaterThanOrEqual(1.299);
      }
    }
  });

  it.each([false, true])(
    'keeps human second-half kickoff pending until both keepers return, switched=%s',
    (switched) => {
      const { state: initial } = shotProbeFixture('unmarked_striker');
      initial.endsSwitched = switched;
      initial.players = initial.players.map((p) => ({ ...p, endsSwitched: switched }));
      let state = startSecondHalf({ ...initial, time: 2700, status: 'half_time' });
      state.controlledFootballerId = state.restart!.takerId;
      state.playerAgencyEnabled = true;
      const start = state;
      let legalBeforeTactical = false;
      for (let i = 0; i < 4800; i++) {
        const opportunity = projectPlayerDecisionOpportunity(state);
        if (deriveRestartLegalReadiness(state).ready && !areKickoffGoalkeepersReady(state))
          legalBeforeTactical = true;
        if (opportunity) {
          expect(areKickoffGoalkeepersReady(state)).toBe(true);
          break;
        }
        const next = stepTacticalMatchAfterDecisionProbe(state);
        expect(next.time).toBeGreaterThan(state.time);
        state = next;
      }
      expect(legalBeforeTactical).toBe(true);
      expect(projectPlayerDecisionOpportunity(state)?.kind).toBe('restart');
      expect(state.restart!.selectedAction).toBeUndefined();
      expect(state.restart!.phase).toBe('awaiting_decision');
      expect(stepTacticalMatchAfterDecisionProbe(state)).toBe(state);
      expect(state.score).toEqual(start.score);
      for (const keeper of state.players.filter(isMatchGoalkeeper)) {
        expect(
          attacksRight(keeper) ? keeper.position.x : 105 - keeper.position.x,
        ).toBeLessThanOrEqual(9);
        const old = start.players.find((p) => p.id === keeper.id)!;
        expect(distance(old.position, keeper.position)).toBeGreaterThan(20);
      }
    },
  );
});
