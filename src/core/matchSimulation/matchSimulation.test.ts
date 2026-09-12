import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { FORMATIONS } from '../footballerWorld';
import { createSingleMatchSession } from '../singleMatch';
import {
  chooseNpcAction,
  ballReactionWeight,
  applyRestartScenario,
  advanceTacticalMatch,
  FIXED_MATCH_DT,
  calculateOffsideLine,
  constrainTargetOnside,
  createTacticalMatch,
  deriveNeutralFormationAnchor,
  derivePressingAssignment,
  deriveDefensiveWall,
  deriveTacticalTargets,
  distance,
  fieldValue,
  enumerateAvailableActions,
  formationSlotToPitch,
  PITCH_LENGTH,
  PITCH_WIDTH,
  resolveMatchAction,
  projectPassReception,
  stepTacticalMatch,
  type TacticalMatchState,
  tacticalMatchStateSchema,
} from '.';

describe('receiver-aware passing', () => {
  it('leads a moving receiver but keeps a stationary support target close to their feet', () => {
    const state = createTacticalMatch(session('receiver-projection'));
    const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
    const receiver = state.players.find(
      (player) =>
        player.team === passer.team &&
        player.id !== passer.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    receiver.position = { x: passer.position.x + 18, y: passer.position.y + 4 };
    receiver.target = { x: receiver.position.x, y: receiver.position.y + 12 };
    receiver.velocity = { x: 0, y: 4.5 };
    const moving = projectPassReception(state, passer, receiver, 'support');
    expect(moving.releaseTarget.y).toBeGreaterThan(receiver.position.y);
    expect(moving.leadDistance).toBeGreaterThan(0.5);
    receiver.velocity = { x: 0, y: 0 };
    receiver.target = { ...receiver.position };
    expect(projectPassReception(state, passer, receiver, 'support').leadDistance).toBeLessThan(0.6);
  });

  it('lets an elite passer anticipate more and an aware receiver react sooner', () => {
    const state = createTacticalMatch(session('receiver-attributes'));
    const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
    const receiver = state.players.find(
      (player) =>
        player.team === passer.team &&
        player.id !== passer.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    receiver.velocity = { x: 0, y: 4 };
    const poor = projectPassReception(
      state,
      {
        ...passer,
        profile: {
          ...passer.profile,
          attributes: {
            ...passer.profile.attributes,
            passing: 25,
            technique: 25,
            gameReading: 25,
            composure: 25,
          },
        },
      },
      receiver,
      'progressive',
    );
    const elite = projectPassReception(
      state,
      {
        ...passer,
        profile: {
          ...passer.profile,
          attributes: {
            ...passer.profile.attributes,
            passing: 95,
            technique: 95,
            gameReading: 95,
            composure: 95,
          },
        },
      },
      receiver,
      'progressive',
    );
    expect(elite.leadDistance).toBeGreaterThan(poor.leadDistance);
    const unaware = projectPassReception(
      state,
      passer,
      {
        ...receiver,
        profile: {
          ...receiver.profile,
          attributes: { ...receiver.profile.attributes, gameReading: 25, concentration: 25 },
        },
      },
      'support',
    );
    const aware = projectPassReception(
      state,
      passer,
      {
        ...receiver,
        profile: {
          ...receiver.profile,
          attributes: { ...receiver.profile.attributes, gameReading: 95, concentration: 95 },
        },
      },
      'support',
    );
    expect(aware.receiverAwarenessDelay).toBeLessThan(unaware.receiverAwarenessDelay);
  });
});

const world = createCanonicalWorldDatabase(),
  home = world.clubs[0]!,
  away = world.clubs[1]!;
const session = (seed = 'simulation-89', player = false) =>
  createSingleMatchSession(world, {
    homeClubId: home.id,
    awayClubId: away.id,
    seed,
    control: player
      ? {
          mode: 'player',
          clubId: home.id,
          footballerId: home.squadPlayerIds![0]!,
          forceIntoXI: true,
        }
      : { mode: 'spectator' },
  });
const run = (seed: string, seconds = 60) => {
  let state = createTacticalMatch(session(seed));
  for (let i = 0; i < seconds * 10; i++) state = stepTacticalMatch(state, 0.1);
  return state;
};

describe('canonical match space', () => {
  it('values forward territory monotonically and symmetrically', () => {
    expect(fieldValue({ x: 75, y: 34 }, 'home')).toBeGreaterThan(
      fieldValue({ x: 45, y: 34 }, 'home'),
    );
    expect(fieldValue({ x: 82, y: 34 }, 'home')).toBeGreaterThan(
      fieldValue({ x: 75, y: 34 }, 'home'),
    );
    expect(fieldValue({ x: 75, y: 25 }, 'home')).toBeCloseTo(fieldValue({ x: 30, y: 43 }, 'away'));
  });
  it('keeps 105 x 68 and mirrors semantic left/right', () => {
    expect([PITCH_LENGTH, PITCH_WIDTH]).toEqual([105, 68]);
    const slots = FORMATIONS['4-3-3'],
      lb = slots.find((s) => s.position === 'left_back')!,
      rb = slots.find((s) => s.position === 'right_back')!;
    const hl = formationSlotToPitch(lb, 'home'),
      hr = formationSlotToPitch(rb, 'home'),
      al = formationSlotToPitch(lb, 'away'),
      ar = formationSlotToPitch(rb, 'away');
    expect(hl.y).toBeLessThan(hr.y);
    expect(al.y).toBeGreaterThan(ar.y);
    [hl, hr, al, ar].forEach((p) =>
      expect(p).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })),
    );
  });
  it('maps slots to compact, mirrored resting blocks while preserving line order', () => {
    const state = createTacticalMatch(session('neutral'));
    const field = state.players.filter(
      (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
    );
    expect(field.every((p) => p.position.x <= 52.5)).toBe(true);
    const defender = field.find((p) => p.slot.position === 'center_back')!;
    const midfielder = field.find((p) => p.slot.position === 'central_midfielder')!;
    const forward = field.find((p) => p.slot.position === 'striker')!;
    expect(defender.position.x).toBeLessThan(midfielder.position.x);
    expect(midfielder.position.x).toBeLessThan(forward.position.x);
    const mirrored = deriveNeutralFormationAnchor({ ...defender, team: 'away' });
    expect(mirrored.x).toBeCloseTo(PITCH_LENGTH - defender.position.x);
    expect(mirrored.y).toBeCloseTo(PITCH_WIDTH - defender.position.y);
  });
  it('weights local ball reactions smoothly and monotonically', () => {
    expect(ballReactionWeight(5)).toBeGreaterThan(ballReactionWeight(20));
    expect(ballReactionWeight(20)).toBeGreaterThan(ballReactionWeight(45));
    expect(ballReactionWeight(50)).toBeLessThan(0.1);
  });
  it('uses the ball and second-last opponent symmetrically for offside geometry', () => {
    const state = createTacticalMatch(session('offside'));
    state.ball = { x: 60, y: 34 };
    state.players
      .filter((p) => p.team === 'away')
      .forEach((p, index) => (p.position = { x: 70 + index, y: p.position.y }));
    expect(calculateOffsideLine(state, 'home')).toBe(79);
    state.ball.x = 82;
    expect(calculateOffsideLine(state, 'home')).toBe(82);
    const mirrored = {
      ...state,
      ball: { x: 23, y: 34 },
      players: state.players.map((p) => ({
        ...p,
        team: p.team === 'home' ? ('away' as const) : ('home' as const),
        position: { ...p.position, x: PITCH_LENGTH - p.position.x },
      })),
    };
    expect(calculateOffsideLine(mirrored, 'away')).toBe(23);
    expect(constrainTargetOnside({ x: 90, y: 30 }, 80, 'home').x).toBeLessThan(80);
  });
});

describe('restart geometry and lifecycle', () => {
  const preset = (name: Parameters<typeof applyRestartScenario>[1], seed = `geometry-${name}`) =>
    applyRestartScenario(createTacticalMatch(session(seed)), name);

  it('builds long and short goalkeeper distribution shapes', () => {
    const long = preset('goal_kick');
    const centreBacks = long.players.filter(
      (p) => p.team === 'home' && p.slot.position === 'center_back',
    );
    expect(centreBacks.every((p) => p.position.x >= 35 && p.position.x <= 45)).toBe(true);
    expect(
      long.players
        .filter((p) => p.team === 'home' && p.duty === 'attack')
        .some((p) => p.position.x > 52.5),
    ).toBe(true);
    expect(long.restart?.landingZone?.x).toBeGreaterThan(52.5);

    const base = createTacticalMatch(session('short-press'));
    base.teams.away.style = 'pressing';
    const pressing = applyRestartScenario(base, 'gk_short');
    const lowBase = createTacticalMatch(session('short-press'));
    lowBase.teams.away.style = 'counter_attacking';
    const low = applyRestartScenario(lowBase, 'gk_short');
    const meanX = (state: TacticalMatchState) =>
      state.players
        .filter((p) => p.team === 'away' && p.profile.primaryPosition !== 'goalkeeper')
        .reduce((sum, p) => sum + p.position.x, 0) / 10;
    expect(meanX(pressing)).toBeLessThan(meanX(low));
    expect(
      pressing.players
        .filter((p) => p.team === 'home' && p.slot.position === 'center_back')
        .every((p) => p.position.x < 25),
    ).toBe(true);
  });

  it('keeps canonical time and mirrors away-owned restarts', () => {
    const initial = createTacticalMatch(session('away-restarts'));
    initial.time = 17.2;
    const kickOff = applyRestartScenario(initial, 'kick_off', { restartTeam: 'away' });
    expect(kickOff.time).toBe(17.2);
    expect(kickOff.restart).toMatchObject({ restartTeam: 'away', startedAt: 17.2 });
    expect(kickOff.players.find((player) => player.id === kickOff.restart!.takerId)?.team).toBe(
      'away',
    );
    expect(kickOff.teams.away.phase).toBe('attacking_transition');
    expect(kickOff.teams.home.phase).toBe('defensive_block');

    const goalKick = applyRestartScenario(initial, 'goal_kick', { restartTeam: 'away' });
    const taker = goalKick.players.find((player) => player.id === goalKick.restart!.takerId)!;
    expect(taker.team).toBe('away');
    expect(taker.profile.primaryPosition).toBe('goalkeeper');
    expect(goalKick.ball.x).toBeGreaterThan(95);
    let released = goalKick;
    for (let tick = 0; tick < 100; tick += 1)
      released = stepTacticalMatch(released, FIXED_MATCH_DT);
    expect(released.time).toBeGreaterThan(initial.time);
    expect(released.restart?.executedAt).toBeGreaterThanOrEqual(released.restart!.startedAt);
  });

  it('clusters corners without overlap and keeps both goalkeepers at their ends', () => {
    const corner = preset('corner');
    const homeGk = corner.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition === 'goalkeeper',
    )!;
    const awayGk = corner.players.find(
      (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
    )!;
    expect(homeGk.position.x).toBeLessThan(12);
    expect(awayGk.position.x).toBeGreaterThan(102);
    const box = corner.players.filter(
      (p) => p.profile.primaryPosition !== 'goalkeeper' && p.position.x > 88,
    );
    expect(box.length).toBeGreaterThan(8);
    for (let i = 0; i < corner.players.length; i++)
      for (let j = i + 1; j < corner.players.length; j++)
        expect(distance(corner.players[i]!.position, corner.players[j]!.position)).toBeGreaterThan(
          0.35,
        );
    const gaps = box
      .map((p) => p.position.y)
      .sort((a, b) => a - b)
      .slice(1)
      .map((y, i) => y - box.map((p) => p.position.y).sort((a, b) => a - b)[i]!);
    expect(new Set(gaps.map((gap) => gap.toFixed(2))).size).toBeGreaterThan(2);
  });

  it('varies free-kick walls and aligns them across the goal ray', () => {
    const near = deriveDefensiveWall({ x: 83, y: 30 }, { x: 105, y: 34 }, 5);
    const far = deriveDefensiveWall({ x: 69, y: 31 }, { x: 105, y: 34 }, 2);
    expect(near.length).toBeGreaterThan(far.length);
    const wallVector = { x: near.at(-1)!.x - near[0]!.x, y: near.at(-1)!.y - near[0]!.y };
    const goalVector = { x: 22, y: 4 };
    expect(Math.abs(wallVector.x * goalVector.x + wallVector.y * goalVector.y)).toBeLessThan(0.01);
    expect(
      preset('free_kick_wide').players.filter((p) => p.team === 'home' && p.position.x > 88).length,
    ).toBeGreaterThan(3);
  });

  it('keeps all penalty participants plausible and setup stable until execution', () => {
    let penalty = preset('penalty');
    expect(penalty.players).toHaveLength(22);
    const takerId = penalty.restart!.takerId;
    expect(
      penalty.players.filter((p) => distance(p.position, penalty.ball) < 5).map((p) => p.id),
    ).toEqual([takerId]);
    expect(
      penalty.players
        .filter((p) => p.id !== takerId && p.profile.primaryPosition !== 'goalkeeper')
        .every((p) => p.position.x < 84.5),
    ).toBe(true);
    const setup = penalty.players.map((p) => p.position);
    for (let i = 0; i < 20; i++) penalty = stepTacticalMatch(penalty, 0.1);
    expect(penalty.players.map((p) => p.position)).toEqual(setup);
    const receiver = penalty.players.find(
      (p) => p.team === 'home' && p.id !== takerId && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    penalty = resolveMatchAction(penalty, {
      type: 'pass',
      actorId: takerId,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    });
    expect(penalty.restart?.phase).toBe('release');
    const immediate = deriveTacticalTargets(penalty).find((p) => p.id === receiver.id)!;
    expect(distance(immediate.idealTarget, penalty.restart!.targets[receiver.id]!)).toBe(0);
    penalty = stepTacticalMatch(penalty, 1);
    expect(
      distance(
        penalty.players.find((p) => p.id === receiver.id)!.idealTarget,
        penalty.restart!.targets[receiver.id]!,
      ),
    ).toBeGreaterThan(0);
  });
});
describe('autonomous tactical simulation', () => {
  it('uses the canonical 40 Hz timestep', () => {
    expect(FIXED_MATCH_DT).toBe(0.025);
  });

  it('is invariant to presentation cadence after equal fixed simulated time', () => {
    const initial = createTacticalMatch(session('fixed-time'));
    const direct = advanceTacticalMatch(initial, 20);
    let cadenced = initial;
    for (const seconds of [2, 1, 4, 0.5, 7.5, 5])
      cadenced = advanceTacticalMatch(cadenced, seconds);
    expect(cadenced).toEqual(direct);
    expect(direct.time).toBeCloseTo(20, 10);
  });

  it('uses plausible acceleration-limited metre-per-second movement', () => {
    const initial = createTacticalMatch(session('kinematics'));
    const player = initial.players.find(
      (candidate) => candidate.profile.primaryPosition !== 'goalkeeper',
    )!;
    player.target = { x: Math.min(105, player.position.x + 50), y: player.position.y };
    const start = { ...player.position };
    let state = initial;
    for (let tick = 0; tick < 20; tick += 1) state = stepTacticalMatch(state, FIXED_MATCH_DT);
    const moved = distance(
      start,
      state.players.find((candidate) => candidate.id === player.id)!.position,
    );
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(10);

    const moving = state.players.find((candidate) => candidate.id === player.id)!;
    const oldVelocity = { ...moving.velocity };
    moving.target = { x: Math.max(0, moving.position.x - 40), y: moving.position.y };
    const reversed = stepTacticalMatch(state, FIXED_MATCH_DT).players.find(
      (candidate) => candidate.id === player.id,
    )!;
    expect(oldVelocity.x * reversed.velocity.x).toBeGreaterThanOrEqual(0);
    expect(state.players.every((candidate) => Number.isFinite(candidate.position.x))).toBe(true);
  });
  it('offers progressive, long and genuinely leading passes plus varied carries', () => {
    const state = createTacticalMatch(session('intent'));
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    const teammate = state.players.find(
      (p) => p.team === actor.team && p.id !== actor.id && p.duty === 'attack',
    )!;
    teammate.position = { x: Math.min(95, actor.position.x + 48), y: actor.position.y };
    const actions = enumerateAvailableActions(state, actor.id);
    expect(actions.filter((a) => a.type === 'carry').length).toBeGreaterThan(2);
    expect(actions).toContainEqual(
      expect.objectContaining({ type: 'pass', receiverId: teammate.id, intent: 'direct' }),
    );
    const through = actions.find(
      (a) => a.type === 'pass' && a.receiverId === teammate.id && a.intent === 'through',
    );
    expect(through?.type === 'pass' && through.target.x).toBeGreaterThan(teammate.position.x);
  });

  it('creates every restart preset deterministically, plausibly and in bounds', () => {
    const names = ['kick_off', 'goal_kick', 'gk_short', 'corner', 'free_kick', 'penalty'] as const;
    for (const name of names) {
      const initial = createTacticalMatch(session(`restart-${name}`));
      const first = applyRestartScenario(initial, name);
      expect(first).toEqual(applyRestartScenario(initial, name));
      expect(first.ball.ownerId).toBeTruthy();
      expect(
        first.players.every(
          (p) =>
            p.position.x >= 0 && p.position.x <= 105 && p.position.y >= 0 && p.position.y <= 68,
        ),
      ).toBe(true);
      expect(() => tacticalMatchStateSchema.parse(first)).not.toThrow();
    }
  });
  it('creates unique canonical XIs in bounds and sane goalkeepers', () => {
    const state = run('shape', 10);
    expect(new Set(state.players.map((p) => p.id)).size).toBe(22);
    for (const p of state.players) {
      expect(p.position.x).toBeGreaterThanOrEqual(0);
      expect(p.position.x).toBeLessThanOrEqual(105);
      expect(p.position.y).toBeGreaterThanOrEqual(0);
      expect(p.position.y).toBeLessThanOrEqual(68);
      if (p.profile.primaryPosition === 'goalkeeper')
        expect(p.team === 'home' ? p.position.x < 25 : p.position.x > 80).toBe(true);
    }
    expect(() => tacticalMatchStateSchema.parse(state)).not.toThrow();
  });
  it('is reproducible, but seed-specific', () => {
    expect(run('same', 15)).toEqual(run('same', 15));
    expect(run('other', 15)).not.toEqual(run('same', 15));
  });
  it('survives a 60 second deterministic soak and continues decisions', () => {
    const state = run('soak', 60);
    expect(state.decisionIndex).toBeGreaterThan(5);
    expect(
      state.players.every((p) => Number.isFinite(p.position.x) && Number.isFinite(p.position.y)),
    ).toBe(true);
    expect(
      state.ball.ownerId === undefined || state.players.some((p) => p.id === state.ball.ownerId),
    ).toBe(true);
  });
  it('uses identical action enumeration, policy and resolution for a selected player', () => {
    const spectator = createTacticalMatch(session('shared')),
      selected = createTacticalMatch(session('shared', true));
    const id = spectator.ball.ownerId!;
    selected.controlledFootballerId = id;
    expect(enumerateAvailableActions(selected, id)).toEqual(
      enumerateAvailableActions(spectator, id),
    );
    const action = chooseNpcAction(spectator, id)!;
    expect(chooseNpcAction(selected, id)).toEqual(action);
    const strip = (s: ReturnType<typeof resolveMatchAction>) => ({
      ...s,
      controlledFootballerId: undefined,
    });
    expect(strip(resolveMatchAction(selected, action))).toEqual(
      strip(resolveMatchAction(spectator, action)),
    );
  });
  it('builds press and cover layers without dragging the cover as aggressively', () => {
    const state = createTacticalMatch(session('press'));
    const assignment = derivePressingAssignment(state, 'away');
    const targets = deriveTacticalTargets(state);
    const carrier = targets.find((p) => p.id === state.ball.ownerId)!;
    const primary = targets.find((p) => p.id === assignment.primary)!;
    const cover = targets.find((p) => p.id === assignment.cover)!;
    expect(distance(primary.idealTarget, carrier.position)).toBeLessThan(
      distance(primary.neutralAnchor, carrier.position),
    );
    expect(distance(cover.idealTarget, cover.neutralAnchor)).toBeLessThan(
      distance(primary.idealTarget, primary.neutralAnchor),
    );
  });
  it('gives a committed primary presser a challenge-distance approach point', () => {
    const state = createTacticalMatch(session('committed-press'));
    state.teams.away.style = 'balanced';
    const carrier = state.players.find((player) => player.id === state.ball.ownerId)!;
    const assignment = derivePressingAssignment(state, 'away');
    const primary = state.players.find((player) => player.id === assignment.primary)!;
    const cover = state.players.find((player) => player.id === assignment.cover)!;
    primary.position = { x: carrier.position.x + 6, y: carrier.position.y };
    cover.position = { x: carrier.position.x + 8, y: carrier.position.y + 4 };
    const targets = deriveTacticalTargets(state);
    const primaryTarget = targets.find((player) => player.id === primary.id)!;
    const coverTarget = targets.find((player) => player.id === cover.id)!;
    expect(distance(primaryTarget.idealTarget, carrier.position)).toBeGreaterThanOrEqual(0.8);
    expect(distance(primaryTarget.idealTarget, carrier.position)).toBeLessThanOrEqual(1.4);
    expect(distance(coverTarget.idealTarget, carrier.position)).toBeGreaterThan(3);
  });
  it('constrains only the ideal offside target, never physical position', () => {
    const state = createTacticalMatch(session('physical-offside'));
    const attacker = state.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition === 'striker',
    )!;
    attacker.position = { x: 100, y: attacker.position.y };
    const next = deriveTacticalTargets(state).find((p) => p.id === attacker.id)!;
    expect(next.idealTarget.x).toBeLessThan(calculateOffsideLine(state, 'home'));
    expect(next.position.x).toBe(100);
  });
  it('makes perception speed and positional error attribute-driven', () => {
    const base = createTacticalMatch(session('attributes'));
    base.time = 8.5;
    const id = base.players.find((p) => p.profile.primaryPosition !== 'goalkeeper')!.id;
    const evaluate = (positioning: number, awareness: number) => {
      const state = structuredClone(base),
        player = state.players.find((p) => p.id === id)!;
      player.target = { x: 5, y: 5 };
      player.profile.attributes.positioning = positioning;
      player.profile.attributes.gameReading = awareness;
      player.profile.attributes.concentration = awareness;
      return deriveTacticalTargets(state).find((p) => p.id === id)!;
    };
    const aware = evaluate(100, 100),
      late = evaluate(100, 1),
      inaccurate = evaluate(1, 100);
    expect(distance(aware.target, aware.idealTarget)).toBeLessThan(
      distance(late.target, late.idealTarget),
    );
    expect(distance(aware.target, aware.idealTarget)).toBeLessThan(
      distance(inaccurate.target, inaccurate.idealTarget),
    );
  });
  it('uses the same positional trajectory with or without a controlled footballer', () => {
    const spectator = createTacticalMatch(session('parity')),
      controlled = structuredClone(spectator);
    controlled.controlledFootballerId = controlled.players[7]!.id;
    const strip = (state: typeof spectator) => ({ ...state, controlledFootballerId: undefined });
    expect(strip(stepTacticalMatch(controlled, 0.1))).toEqual(
      strip(stepTacticalMatch(spectator, 0.1)),
    );
  });
});
