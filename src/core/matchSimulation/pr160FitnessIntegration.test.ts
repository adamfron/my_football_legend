// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { isEligibleForNormalPosition } from '../footballerWorld';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { createMatchFitness } from './matchFitness';
import { runFitnessDrill } from './fitnessMicroLab';
import { rollContextualInjury } from './matchInjuries';
import { advanceControlledBall } from './ballContactGeometry';
import { awardNaturalRestart } from './restartScenarios';
import { planCoachSubstitutions } from './substitutions';
import { qualifyingLostTime } from './matchTimekeeping';
import { ContactTacticalTracker } from './contactTacticalDiagnostics';
import { PerformanceProfiler, withPerformanceProfiler } from './performanceProfiling';
import { PresentationFrameProjector } from '../../app/match/tacticalRenderer/frameProjection';
import type { MatchAction, TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr160-integrated-physical'): TacticalMatchState => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed,
      control: { mode: 'spectator' },
    }),
  );
  state.time = 100;
  state.playerAgencyEnabled = false;
  delete state.restart;
  state.scenario = 'open_play';
  return state;
};
const depletedSubstitutionFixture = () => {
  const initial = fixture();
  initial.time = 4200;
  initial.status = 'second_half';
  initial.teams.home.style = 'pressing';
  for (const outgoing of initial.players.filter(
    (player) => player.team === 'home' && /winger|midfielder|striker/.test(player.slot.position),
  )) {
    const incoming = initial.bench!.home.find((player) =>
      isEligibleForNormalPosition(player.profile, outgoing.slot.position),
    );
    if (!incoming) continue;
    // The initial snapshot carries measured prior demanding work, rather than a minute-based
    // fatigue deduction. The canonical continuation remains an ordinary real match fixture.
    outgoing.fitness = runFitnessDrill(
      { ...outgoing, fitness: createMatchFitness() },
      'intensive_press',
      4000,
    ).fitness!;
    outgoing.position = { x: 45, y: 0.3 };
    outgoing.velocity = { x: 0, y: 0 };
    initial.bench = { home: [incoming], away: [] };
    const stopped = awardNaturalRestart(initial, 'throw_in', {
      restartTeam: 'away',
      incidentId: 'pr160-integrated-throw',
      restartPoint: { x: 55, y: 0 },
      incidentPoint: { x: 55, y: 0 },
      eventAt: initial.time,
    });
    const planned = planCoachSubstitutions(stopped);
    if (planned.substitutionState!.pending.some((request) => request.outgoing.id === outgoing.id))
      return {
        state: stopped,
        outgoingId: outgoing.id,
        incomingId: incoming.id,
        benchCondition: incoming.condition,
      };
  }
  throw new Error('No actual bench alternative improves the demanding-work fixture.');
};

type RngTrace = Array<{ before: string; value: number; after: string }>;
const captureRng = <T>(run: () => T): { result: T; trace: RngTrace } => {
  const original = RandomGenerator.prototype.float;
  const trace: RngTrace = [];
  RandomGenerator.prototype.float = function () {
    const before = this.export();
    const value = original.call(this);
    trace.push({ before, value, after: this.export() });
    return value;
  };
  try {
    return { result: run(), trace };
  } finally {
    RandomGenerator.prototype.float = original;
  }
};

describe('PR160 integrated physical contracts', () => {
  it('continues measured high pressing through coach replacement, one lawful opportunity, lost time and incoming participation', () => {
    const context = depletedSubstitutionFixture();
    const exhausted = context.state.players.find((player) => player.id === context.outgoingId)!;
    expect(exhausted.fitness!.workload.intensivePressSeconds).toBeGreaterThan(1500);
    expect(exhausted.fitness!.burstReadiness).toBeLessThan(0.08);
    let state = context.state;
    for (let tick = 0; tick < 100 / FIXED_MATCH_DT; tick++) {
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      const entrant = state.players.find((player) => player.id === context.incomingId);
      if (entrant && entrant.fitness!.workload.seconds >= 2 && !state.stoppageLedger?.active) break;
    }
    const fact = state.substitutionState!.completed.find(
      (event) => event.outgoingId === context.outgoingId,
    )!;
    expect(fact).toBeDefined();
    expect(fact.reason).toBe('fatigue');
    expect(fact.enteredAt).toBeGreaterThan(fact.leftAt);
    expect(state.substitutionState!.opportunities.home).toBe(1);
    expect(state.players.some((player) => player.id === context.outgoingId)).toBe(false);
    const entrant = state.players.find((player) => player.id === context.incomingId)!;
    expect(entrant.profile).toBe(world.footballers[context.incomingId]!.profile);
    expect(entrant.fitness!.longTermCapacity).toBeGreaterThan(exhausted.fitness!.longTermCapacity);
    expect(entrant.fitness!.workload.seconds).toBeGreaterThanOrEqual(2);
    expect(
      state.statistics!.players.find((player) => player.playerId === context.incomingId)!
        .minutesPlayed,
    ).toBeGreaterThan(0);
    expect(
      state.statistics!.players.find((player) => player.playerId === context.outgoingId)!
        .minutesPlayed,
    ).toBeCloseTo(fact.leftAt / 60, 5);
    expect(
      state.matchEvents!.some(
        (event) => event.kind === 'substitution' && event.relatedPlayerId === context.outgoingId,
      ),
    ).toBe(true);
    expect(
      state.stoppageLedger!.intervals.some(
        (interval) => interval.reasons.includes('substitution') && interval.endedAt !== undefined,
      ),
    ).toBe(true);
    expect(qualifyingLostTime(state)).toBeGreaterThan(0);
  }, 30_000);

  it('has identical full football and actual RNG draws in normal, DEV and capture continuations after negative decision probes', () => {
    const context = depletedSubstitutionFixture();
    const modes = (['normal', 'dev', 'capture'] as const).map((mode) => ({
      mode,
      state: structuredClone(context.state),
      profiler: new PerformanceProfiler({ enabled: mode !== 'normal', sampleEveryTicks: 1 }),
      tracker: new ContactTacticalTracker(),
      frames: new PresentationFrameProjector(),
    }));
    let draws = 0;
    for (let tick = 0; tick < 20 / FIXED_MATCH_DT; tick++) {
      const traces: RngTrace[] = [];
      for (const mode of modes) {
        const previous = mode.state;
        expect(projectPlayerDecisionOpportunity(previous)).toBeUndefined();
        mode.profiler.beginTick(tick);
        const captured = captureRng(() => {
          const next = withPerformanceProfiler(mode.profiler, () =>
            mode.mode === 'normal'
              ? stepTacticalMatch(previous, FIXED_MATCH_DT)
              : stepTacticalMatchAfterDecisionProbe(previous, FIXED_MATCH_DT),
          );
          mode.tracker.observe(previous, next);
          mode.tracker.snapshot();
          mode.frames.frame(next, { includeAiCarryTarget: mode.mode !== 'normal' });
          if (mode.mode === 'capture') mode.frames.frame(next);
          return next;
        });
        mode.state = captured.result;
        traces.push(captured.trace);
      }
      expect(modes[1]!.state).toEqual(modes[0]!.state);
      expect(modes[2]!.state).toEqual(modes[0]!.state);
      expect(traces[1]).toEqual(traces[0]);
      expect(traces[2]).toEqual(traces[0]);
      draws += traces[0]!.length;
    }
    expect(draws).toBeGreaterThan(0);
    expect(modes[0]!.state.substitutionState!.completed.length).toBeGreaterThan(0);
  }, 30_000);

  it('uses identical selected pass physics and execution RNG for human and NPC with the same fatigue', () => {
    const state = fixture('pr160-chosen-pass-parity');
    const actor = state.players.find(
      (player) => player.team === 'home' && player.slot.position !== 'goalkeeper',
    )!;
    const receiver = state.players.find(
      (player) =>
        player.team === 'home' && player.id !== actor.id && player.slot.position !== 'goalkeeper',
    )!;
    state.players.forEach((player) => {
      player.position = { x: player.team === 'home' ? 20 : 90, y: 10 };
    });
    actor.position = { x: 50, y: 34 };
    actor.velocity = { x: 5, y: 0 };
    actor.facingAngle = 1;
    actor.fitness = { ...createMatchFitness(55), burstReadiness: 0.1 };
    receiver.position = { x: 59, y: 36 };
    state.ball = { x: 50.35, y: 34, height: 0, velocity: { x: 5, y: 0 }, ownerId: actor.id };
    state.actionCooldown = 0;
    const action: MatchAction = {
      type: 'pass',
      actorId: actor.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
      delivery: 'ground',
    };
    const human = captureRng(() =>
      resolveMatchAction(
        { ...structuredClone(state), controlledFootballerId: actor.id, playerAgencyEnabled: true },
        action,
        'human_selected',
      ),
    );
    const npc = captureRng(() =>
      resolveMatchAction(structuredClone(state), action, 'autonomous_npc'),
    );
    expect(human.trace.length).toBeGreaterThan(0);
    expect(human.trace).toEqual(npc.trace);
    expect(human.result.ball).toEqual(npc.result.ball);
    expect(human.result.players).toEqual(npc.result.players);
    expect(human.result.decisionIndex).toEqual(npc.result.decisionIndex);
    expect(human.result.lastPassDiagnostic?.physicalTarget).toEqual(
      npc.result.lastPassDiagnostic?.physicalTarget,
    );
  });

  it('rolls an injury from measured demanding movement, removes a serious actor before same-tick actions, and retains statistics', () => {
    let state = fixture();
    state.time = 4499.99;
    state.status = 'second_half';
    state.actionCooldown = 2;
    state.bench = { home: [], away: [] };
    const actor = state.players.find(
      (player) => player.team === 'home' && player.slot.position !== 'goalkeeper',
    )!;
    actor.fitness = runFitnessDrill(
      { ...actor, fitness: createMatchFitness() },
      'turns_braking',
      4400,
    ).fitness!;
    expect(actor.fitness!.movementRiskExposure).toBeGreaterThan(0);
    let selectedSeed: string | undefined;
    for (let index = 0; index < 100_000; index++) {
      const seed = `pr160-physical-injury-search:${index}`;
      const injury = rollContextualInjury(actor, {
        seed: `${seed}:movement-injury:${actor.id}:4500`,
        at: 4500.015,
        mechanism: 'movement',
        exposure: actor.fitness!.movementRiskExposure,
      });
      if (injury?.status === 'unable' || injury?.status === 'absence') {
        selectedSeed = seed;
        break;
      }
    }
    expect(selectedSeed).toBeDefined();
    state.seed = selectedSeed!;
    state.ball = {
      x: actor.position.x + 0.3,
      y: actor.position.y,
      ownerId: actor.id,
      velocity: { x: 0, y: 0 },
    };
    const previousDecisionIndex = state.decisionIndex;
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(
      state.injuries!.some((injury) => injury.playerId === actor.id && injury.assessmentRequired),
    ).toBe(true);
    expect(state.players.some((player) => player.id === actor.id)).toBe(false);
    expect(state.departedPlayers!.some((player) => player.id === actor.id)).toBe(true);
    expect(state.ball.ownerId).not.toBe(actor.id);
    expect(state.decisionIndex).toBe(previousDecisionIndex);
    expect(state.injuryAssessment).toBeDefined();
    expect(state.statistics!.players.some((player) => player.playerId === actor.id)).toBe(true);
    expect(
      state.matchEvents!.some((event) => event.kind === 'injury' && event.actorId === actor.id),
    ).toBe(true);
  }, 30_000);

  it('rejects a cached action/contact by a player already unable to continue without spending execution RNG', () => {
    const state = fixture();
    const actor = state.players[0]!;
    actor.injury = {
      id: 'serious-existing',
      playerId: actor.id,
      at: state.time,
      status: 'unable',
      mechanism: 'contact',
      injuryType: 'joint',
      recoveryDays: 4,
      assessmentRequired: true,
    };
    state.ball = { x: actor.position.x + 0.3, y: actor.position.y, ownerId: actor.id };
    const attempted = captureRng(() =>
      resolveMatchAction(
        state,
        {
          type: 'carry',
          actorId: actor.id,
          target: { x: actor.position.x + 8, y: actor.position.y },
        },
        'human_selected',
      ),
    );
    expect(attempted.trace).toEqual([]);
    expect(attempted.result).toBe(state);
    expect(advanceControlledBall(state, actor, FIXED_MATCH_DT).state).toBe(state);
  });

  it('assesses an already injured controlled restart taker before the human decision boundary can freeze removal', () => {
    const initial = awardNaturalRestart(fixture('pr160-injured-controlled-taker'), 'penalty', {
      restartTeam: 'home',
      incidentId: 'injured-taker-foul',
      incidentPoint: { x: 94, y: 34 },
    });
    const takerId = initial.restart!.takerId;
    const taker = initial.players.find((player) => player.id === takerId)!;
    initial.controlledFootballerId = takerId;
    initial.playerAgencyEnabled = true;
    taker.injury = {
      id: 'unable-controlled-taker',
      playerId: takerId,
      at: initial.time,
      status: 'unable',
      mechanism: 'tackle',
      injuryType: 'joint',
      recoveryDays: 4,
      assessmentRequired: true,
    };
    const next = stepTacticalMatch(initial, FIXED_MATCH_DT);
    expect(next.time).toBeGreaterThan(initial.time);
    expect(next.players.some((player) => player.id === takerId)).toBe(false);
    expect(next.departedPlayers!.some((player) => player.id === takerId)).toBe(true);
    expect(next.controlledFootballerId).toBe(takerId);
    expect(next.injuryAssessment).toBeDefined();
    expect(projectPlayerDecisionOpportunity(next)).toBeUndefined();
  });
});
