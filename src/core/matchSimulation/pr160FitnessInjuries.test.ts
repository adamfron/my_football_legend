// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  advanceMatchFitness,
  advanceMatchIntervalFitness,
  createMatchFitness,
  deriveFitnessPhysicalModifiers,
  difficultActionPhysicalCost,
  matchFitnessSchema,
  recoverConditionAfterDays,
  recoverHalftimeFitness,
} from './matchFitness';
import {
  advanceMatchInjuries,
  canParticipatePhysically,
  matchInjurySchema,
  rollContextualInjury,
} from './matchInjuries';
import { runFitnessDrill, runFitnessMicroLab, type FitnessMicroLabResult } from './fitnessMicroLab';
import { deriveMovementCapability } from './locomotion';
import { derivePassDifficulty } from './passExecution';
import { deriveShootingDifficulty, type ShootingDifficultyContext } from './shootingDifficulty';
import { advanceControlledBall, deriveShieldBodyContest } from './ballContactGeometry';
import { beginDefensiveChallenge, resolveDefensiveChallenge } from './defensiveChallenges';

const world = createCanonicalWorldDatabase();
const fixture = (): TacticalMatchState => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr160-physical-fitness',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 100;
  return state;
};
const athlete = () =>
  fixture().players.find(
    (player) => player.team === 'home' && player.slot.position !== 'goalkeeper',
  )!;
const fatigued = (player: MatchPlayerState): MatchPlayerState => ({
  ...player,
  fitness: { ...createMatchFitness(55), burstReadiness: 0.08 },
});
let lab: FitnessMicroLabResult | undefined;
const rows = () => (lab ??= runFitnessMicroLab(athlete())).rows;

describe('PR160 completed-work fatigue and physical fidelity', () => {
  it('records paired workload evidence, preserving reserve bounds and conditioning meaning', () => {
    for (const row of rows()) {
      expect(matchFitnessSchema.safeParse(row.fitness).success).toBe(true);
      expect(row.fitness.burstReadiness).toBeLessThanOrEqual(row.fitness.longTermCapacity);
    }
    for (const scenario of [
      'continuous_jog',
      'repeated_sprints',
      'turns_braking',
      'shield_contact',
    ]) {
      const low = rows().find((row) => row.scenario === scenario && row.stamina === 30)!;
      const high = rows().find((row) => row.scenario === scenario && row.stamina === 90)!;
      expect(high.fitness.longTermCapacity).toBeGreaterThan(low.fitness.longTermCapacity);
    }
    const row = rows().find((entry) => entry.scenario === 'turns_braking' && entry.stamina === 60)!;
    expect(row.fitness.workload.brakingImpulse).toBeGreaterThan(0);
    expect(row.fitness.workload.turningLoad).toBeGreaterThan(0);
  }, 30_000);

  it('produces substantially different fitness at the same minute from pressing versus screening', () => {
    const press = rows().find((row) => row.scenario === 'intensive_press' && row.stamina === 60)!;
    const screen = rows().find(
      (row) => row.scenario === 'economical_screen' && row.stamina === 60,
    )!;
    expect(press.canonicalSeconds).toBe(screen.canonicalSeconds);
    expect(screen.fitness.longTermCapacity - press.fitness.longTermCapacity).toBeGreaterThan(0.08);
    expect(screen.fitness.burstReadiness - press.fitness.burstReadiness).toBeGreaterThan(0.3);
    expect(press.fitness.workload.intensivePressSeconds).toBeGreaterThan(400);
    expect(screen.fitness.workload.intensivePressSeconds).toBe(0);
    expect(press.finalEightSecondSprintDistance).toBeLessThan(press.firstEightSecondSprintDistance);
  });

  it('allows recovered isolated bursts while repeated sprints temporarily reduce readiness', () => {
    const repeated = rows().find(
      (row) => row.scenario === 'repeated_sprints' && row.stamina === 60,
    )!;
    const isolated = rows().find(
      (row) => row.scenario === 'isolated_long_sprint' && row.stamina === 60,
    )!;
    expect(isolated.fitness.burstReadiness).toBeCloseTo(isolated.fitness.longTermCapacity, 6);
    expect(repeated.fitness.burstReadiness).toBeLessThan(isolated.fitness.burstReadiness * 0.5);
    const limited = { ...athlete(), fitness: createMatchFitness(35) };
    const burst = runFitnessDrill(limited, 'isolated_long_sprint', 5);
    expect(burst.fitness!.workload.distanceSprint).toBeGreaterThan(20);
    expect(burst.fitness!.burstReadiness).toBeLessThan(limited.fitness.burstReadiness);
    const rest = runFitnessDrill({ ...burst, velocity: { x: 0, y: 0 } }, 'shield_contact', 2);
    expect(rest.fitness!.burstReadiness).toBeLessThan(rest.fitness!.longTermCapacity);
  });

  it('a blocked sprint intent costs only completed movement and not its requested distance', () => {
    const player = athlete();
    const idle = advanceMatchFitness(player, {
      dt: 1,
      distance: 0,
      speed: 0,
      previousSpeed: 0,
      turnRadians: 0,
      pressing: true,
    });
    const run = advanceMatchFitness(player, {
      dt: 1,
      distance: 8,
      speed: 8,
      previousSpeed: 8,
      turnRadians: 0,
      pressing: true,
    });
    expect(idle.exertionSpent).toBe(0);
    expect(idle.workload.intensivePressSeconds).toBe(0);
    expect(run.exertionSpent).toBeGreaterThan(0);
    expect(run.workload.intensivePressSeconds).toBe(1);
  });

  it('halftime and calendar rest recover according to condition and supported stamina', () => {
    const player = fatigued(athlete());
    const halfway = recoverHalftimeFitness(player);
    expect(halfway.fitness!.burstReadiness).toBeGreaterThan(player.fitness!.burstReadiness);
    expect(halfway.fitness!.longTermCapacity).toBeLessThan(0.65);
    expect(halfway.fitness!.workload.seconds).toBe(player.fitness!.workload.seconds);
    const one = recoverConditionAfterDays(55, 60, 1);
    const three = recoverConditionAfterDays(55, 60, 3);
    expect(one).toBeGreaterThan(55);
    expect(one).toBeLessThan(100);
    expect(three).toBeGreaterThan(one);
    expect(recoverConditionAfterDays(55, 90, 1)).toBeGreaterThan(
      recoverConditionAfterDays(55, 30, 1),
    );
    expect(recoverConditionAfterDays(55, 60, 1, true)).toBeLessThan(one);
    expect(recoverConditionAfterDays(55, 60, 0)).toBe(55);
  });

  it('recovers retained standing players during a clocked interval once, without invented stopped-velocity work', () => {
    const previous = fixture();
    const player = previous.players[0]!;
    player.fitness = { ...createMatchFitness(45), burstReadiness: 0.04 };
    player.velocity = { x: 6, y: 0 };
    const next = advanceMatchIntervalFitness(previous, { ...previous, time: previous.time + 2 }, 2);
    const fitness = next.players[0]!.fitness!;
    expect(fitness.burstReadiness).toBeGreaterThan(player.fitness.burstReadiness);
    expect(fitness.burstReadiness).toBeLessThan(fitness.longTermCapacity);
    expect(fitness.workload.seconds).toBe(2);
    expect(fitness.workload.accelerationImpulse).toBe(0);
    expect(fitness.workload.brakingImpulse).toBe(0);
    expect(fitness.movementRiskExposure).toBe(0);
    expect(advanceMatchIntervalFitness(previous, next, 2)).toBe(next);
    expect(
      advanceMatchIntervalFitness(previous, { ...previous, status: 'half_time' }, 2).players[0]!
        .fitness,
    ).toEqual(player.fitness);
  });

  it('changes continuous physical speed/acceleration without mutating permanent attributes or position bonuses', () => {
    const player = athlete();
    const tired = fatigued(player);
    expect(deriveMovementCapability(tired).acceleration).toBeLessThan(
      deriveMovementCapability(player).acceleration,
    );
    expect(deriveMovementCapability(tired).maximumSprintSpeed).toBeLessThan(
      deriveMovementCapability(player).maximumSprintSpeed,
    );
    expect(tired.profile.attributes).toEqual(player.profile.attributes);
    expect(
      deriveFitnessPhysicalModifiers({ ...tired, slot: { ...tired.slot, position: 'striker' } }),
    ).toEqual(deriveFitnessPhysicalModifiers(tired));
    expect(difficultActionPhysicalCost(tired, 0)).toBe(0);
  });

  it('keeps a stationary simple five-metre pass and settled shot identical, but exposes difficult body-control uncertainty', () => {
    const state = fixture();
    const player = {
      ...state.players[0]!,
      position: { x: 50, y: 34 },
      velocity: { x: 0, y: 0 },
      facingAngle: Math.PI / 2,
    };
    const tired = fatigued(player);
    const target = { x: 55, y: 34 };
    expect(derivePassDifficulty(state, tired, target, 'support', 'ground')).toEqual(
      derivePassDifficulty(state, player, target, 'support', 'ground'),
    );
    const difficultState = {
      ...state,
      ball: { ...state.ball, velocity: { x: 18, y: 2 }, height: 0.4 },
    };
    const options = { firstTime: true };
    expect(
      derivePassDifficulty(difficultState, tired, target, 'support', 'ground', options)
        .uncertaintyMetres,
    ).toBeGreaterThan(
      derivePassDifficulty(difficultState, player, target, 'support', 'ground', options)
        .uncertaintyMetres,
    );
    const context: ShootingDifficultyContext = {
      distance: 12,
      angle: 1,
      pressure: 0,
      orientation: 0,
      weakFoot: 0,
      incomingSpeed: 0,
      ballHeight: 0.11,
      contact: 'settled',
      intent: 'placed',
      targetWindow: 0,
      blockers: 0,
    };
    expect(deriveShootingDifficulty(tired, context)).toEqual(
      deriveShootingDifficulty(player, context),
    );
    const volley = { ...context, contact: 'volley' as const, incomingSpeed: 20, ballHeight: 0.8 };
    expect(deriveShootingDifficulty(tired, volley).horizontalSigma).toBeGreaterThan(
      deriveShootingDifficulty(player, volley).horizontalSigma,
    );
  });

  it('charges shielding only for actual torso contact and reduces tired balance resistance', () => {
    const state = fixture();
    const carrier = state.players.find(
      (player) => player.team === 'home' && player.slot.position !== 'goalkeeper',
    )!;
    const defender = state.players.find(
      (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
    )!;
    state.players.forEach((player) => {
      player.position = { x: player.team === 'home' ? 5 : 95, y: 5 };
    });
    carrier.position = { x: 50, y: 34 };
    carrier.velocity = { x: 0, y: 0 };
    defender.position = { x: 49.75, y: 34 };
    defender.velocity = { x: 2, y: 0 };
    state.ball = { x: 50.6, y: 34, ownerId: carrier.id, velocity: { x: 0, y: 0 } };
    state.onBallPreparation = {
      actorId: carrier.id,
      gainedAt: state.time,
      readyAt: state.time,
      kind: 'shielding',
      incomingSpeed: 0,
      micro: {
        phase: 'shielding',
        startedAt: state.time,
        origin: carrier.position,
        localTarget: carrier.position,
        ballOffset: { x: 0.4, y: 0 },
        orientationTarget: Math.PI / 2,
        shielding: true,
        pressure: 0.7,
        reason: 'protect_from_pressure',
      },
    };
    const contest = deriveShieldBodyContest(state, carrier);
    expect(contest.load).toBeGreaterThan(0);
    expect(deriveShieldBodyContest(state, fatigued(carrier)).balanceDemand).toBeGreaterThan(
      contest.balanceDemand,
    );
    const next = advanceControlledBall(state, carrier, 0.025).state;
    expect(
      next.players.find((player) => player.id === carrier.id)!.fitness!.workload.bodyContactLoad,
    ).toBeGreaterThan(0);
    defender.position = { x: 30, y: 34 };
    expect(deriveShieldBodyContest(state, carrier).load).toBe(0);
  });
});

describe('PR160 contextual injuries and shared physical consequences', () => {
  it('has no injury lottery without physical risk, including exhausted stationary players', () => {
    const player = fatigued(athlete());
    for (let index = 0; index < 256; index++)
      expect(
        rollContextualInjury(player, {
          seed: `no-work:${index}`,
          at: 100,
          mechanism: 'movement',
          exposure: 0,
        }),
      ).toBeUndefined();
  });

  it('replays injury draws exactly, with restrained probability for even demanding contact', () => {
    const player = athlete();
    let total = 0;
    for (let index = 0; index < 4096; index++) {
      const context = {
        seed: `pr160-contact-frequency:${index}`,
        at: 100,
        mechanism: 'tackle' as const,
        exposure: 0.004,
        force: 7,
      };
      const first = rollContextualInjury(player, context);
      expect(rollContextualInjury(player, context)).toEqual(first);
      if (first) {
        total++;
        expect(matchInjurySchema.safeParse(first).success).toBe(true);
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(64);
  });

  it('allows discomfort/minor injury to remain playable and stops serious physical action eligibility', () => {
    const player = athlete();
    const injury = {
      id: 'injury-context',
      playerId: player.id,
      at: 100,
      status: 'playable' as const,
      mechanism: 'contact' as const,
      injuryType: 'impact' as const,
      recoveryDays: 2,
      assessmentRequired: false,
    };
    const playable = { ...player, injury };
    expect(canParticipatePhysically(playable)).toBe(true);
    expect(deriveMovementCapability(playable).maximumSprintSpeed).toBeLessThan(
      deriveMovementCapability(player).maximumSprintSpeed,
    );
    expect(
      canParticipatePhysically({
        ...player,
        injury: { ...injury, status: 'unable', assessmentRequired: true },
      }),
    ).toBe(false);
    expect(
      canParticipatePhysically({
        ...player,
        injury: { ...injury, status: 'absence', recoveryDays: 14, assessmentRequired: true },
      }),
    ).toBe(false);
  });

  it('expires only temporary discomfort and does not erase the historical injury event', () => {
    const previous = fixture();
    const player = previous.players[0]!;
    const injury = {
      id: 'temporary-discomfort',
      playerId: player.id,
      at: 90,
      status: 'discomfort' as const,
      mechanism: 'movement' as const,
      injuryType: 'muscle' as const,
      expiresAt: 100.025,
      recoveryDays: 0,
      assessmentRequired: false,
    };
    player.injury = injury;
    previous.injuries = [injury];
    const next = advanceMatchInjuries(previous, { ...previous, time: 100.025 });
    expect(next.players[0]!.injury).toBeUndefined();
    expect(next.injuries).toEqual([injury]);
  });

  it('assesses actual resolved opponent contact once and preserves existing stoppage context', () => {
    const previous = fixture();
    const carrier = previous.players.find(
      (player) => player.team === 'home' && player.slot.position !== 'goalkeeper',
    )!;
    const defender = previous.players.find(
      (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
    )!;
    carrier.position = { x: 50, y: 34 };
    carrier.velocity = { x: 0, y: 0 };
    defender.position = { x: 49.1, y: 34 };
    defender.velocity = { x: 6, y: 0 };
    defender.facingAngle = Math.PI / 2;
    previous.ball = { x: 49.4, y: 34, ownerId: carrier.id };
    let selected = beginDefensiveChallenge(
      previous,
      { type: 'challenge', actorId: defender.id, opponentId: carrier.id, technique: 'committed' },
      'human_selected',
    );
    expect(selected.defensiveChallenge).toBeDefined();
    selected = { ...selected, time: selected.time + 0.2 };
    const resolved = resolveDefensiveChallenge(selected).state;
    expect(resolved.lastChallenge!.opponentContact).toBe(true);
    const assessed = advanceMatchInjuries(previous, resolved);
    expect(
      assessed.players.find((player) => player.id === defender.id)!.fitness!.workload
        .bodyContactLoad,
    ).toBeGreaterThan(0);
    expect(advanceMatchInjuries(resolved, assessed)).toEqual(assessed);
    const ledger = {
      intervals: [],
      completedSeconds: 0,
      completedCount: 0,
      active: {
        id: 'existing',
        incidentId: 'existing',
        reasons: ['foul' as const],
        startedAt: 100,
        eventAt: 100,
      },
    };
    const stopped = { ...resolved, stoppageLedger: ledger };
    expect(advanceMatchInjuries(previous, stopped).stoppageLedger).toEqual(ledger);
  });

  it('human/NPC source does not enter actual workload or identical contact injury seeds', () => {
    const player = athlete();
    const sample = {
      dt: 0.025,
      distance: 0.175,
      speed: 7,
      previousSpeed: 6.9,
      turnRadians: 0.05,
      pressing: true,
    };
    expect(advanceMatchFitness(structuredClone(player), sample)).toEqual(
      advanceMatchFitness(player, sample),
    );
    const context = {
      seed: 'identical-physical-context',
      at: 100,
      mechanism: 'contact' as const,
      exposure: 0.003,
      force: 5,
    };
    expect(rollContextualInjury(structuredClone(player), context)).toEqual(
      rollContextualInjury(player, context),
    );
  });
});
