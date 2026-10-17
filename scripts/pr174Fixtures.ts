import { z } from 'zod';
import { createDynamicFixture } from '../src/core/matchSimulation/pr173Fixtures';
import { deriveOnBallPreparation } from '../src/core/matchSimulation/onBallPreparation';
import type { MatchAction } from '../src/core/matchSimulation/matchState';

export const combinationFixtureSchema = z.object({
  scenario: z.enum([
    'winger',
    'central',
    'third_man',
    'overlap',
    'underlap',
    'press',
    'pace',
    'creator',
    'recycling',
    'distance',
    'cover',
    'human',
  ]),
  variant: z
    .enum([
      'open',
      'covered',
      'weak',
      'tired',
      'recovering',
      'offside',
      'unavailable',
      'lead',
      'trailing',
      'successful',
      'timed_run',
    ])
    .default('open'),
  mirrored: z.boolean().default(false),
  seed: z.string().default('pr174-controlled-a'),
});
export type CombinationFixtureInput = z.input<typeof combinationFixtureSchema>;

/** Full canonical states. Only the opening action is prescribed; no pass/contact result is set. */
export const createCombinationFixture = (input: CombinationFixtureInput) => {
  const options = combinationFixtureSchema.parse(input);
  const f = createDynamicFixture({
    scenario: 'pr173-winger-cut-1b',
    seed: options.seed,
    cover: options.variant === 'covered' || options.scenario === 'cover',
  });
  const { state } = f;
  const a = state.players.find((p) => p.id === f.actorId)!;
  const b = state.players.find((p) => p.id === f.supportId)!;
  const c = state.players.find((p) => p.team === a.team && p.slot.position === 'left_back')!;
  const d = state.players.find((p) => p.id === f.defenderId)!;
  a.duty = 'attack';
  b.duty = 'support';
  Object.assign(b.profile.attributes, {
    passing: 86,
    technique: 86,
    firstTouch: 86,
    gameReading: 86,
    composure: 86,
  });
  c.position = { x: 63, y: 6 };
  c.target = { x: 82, y: 5 };
  c.velocity = { x: 4, y: 0 };
  c.facingAngle = Math.PI / 2;
  c.duty = 'support';
  if (['central', 'third_man', 'press', 'creator', 'recycling'].includes(options.scenario)) {
    a.position = { x: 51, y: 28 };
    a.target = { x: 64, y: 26 };
    b.position = { x: 54, y: 38 };
    b.target = { ...b.position };
    d.position = { x: 54, y: 27 };
    d.velocity = { x: -3, y: -2 };
    a.slot = { ...a.slot, position: 'central_midfielder' };
    b.slot = { ...b.slot, position: 'central_midfielder' };
    if (options.scenario === 'third_man' || options.scenario === 'press') {
      c.slot = { ...c.slot, position: 'central_midfielder' };
      c.position = { x: 59, y: 42 };
      c.target = { x: 69, y: 35 };
      c.velocity = { x: 3, y: -2 };
      a.duty = 'defend';
      const balance = state.players.find(
        (p) => p.team === a.team && p.slot.position === 'central_midfielder' && p.duty === 'attack',
      )!;
      balance.duty = 'defend';
      c.velocity = { x: 3, y: 1 };
    }
    if (options.scenario === 'press') {
      const second = state.players.find(
        (p) => p.team !== a.team && p.id !== d.id && p.slot.position.includes('midfielder'),
      )!;
      second.position = { x: 57, y: 37 };
      second.velocity = { x: -2, y: 0 };
    }
  }
  if (['overlap', 'underlap'].includes(options.scenario)) {
    a.position = { x: 69, y: options.scenario === 'underlap' ? 6 : 11 };
    a.duty = 'defend';
    c.position = { x: 67, y: options.scenario === 'underlap' ? 17 : 5 };
    c.target = { x: 82, y: options.scenario === 'underlap' ? 20 : 5 };
    d.position = { x: 73, y: options.scenario === 'underlap' ? 4 : 15 };
    b.position = { x: 62, y: 19 };
  }
  if (options.scenario === 'distance') {
    a.position = { x: 81, y: 32 };
    a.target = { ...a.position };
    a.velocity = { x: 0, y: 0 };
    b.position = { x: 74, y: 21 };
    d.position = { x: 86, y: 28 };
    d.velocity = { x: 0, y: 0 };
    Object.assign(a.profile.attributes, { finishing: 90, technique: 90, composure: 90 });
  }
  if (options.scenario === 'pace') a.profile.attributes.pace = 97;
  if (options.variant === 'recovering') {
    d.velocity = { x: 6, y: 0 };
    d.facingAngle = Math.PI / 2;
  }
  if (options.variant === 'weak') {
    const target = options.scenario === 'distance' ? a : b;
    Object.assign(target.profile.attributes, {
      passing: 35,
      technique: 35,
      firstTouch: 35,
      finishing: 35,
      composure: 35,
    });
  }
  if (options.variant === 'tired') a.fitness!.burstReadiness = 0.01;
  if (options.variant === 'offside') {
    c.position.x = 102;
    c.target.x = 104;
  }
  if (options.variant === 'unavailable')
    c.injury = {
      id: 'pr174-unavailable',
      playerId: c.id,
      at: state.time,
      status: 'unable',
      mechanism: 'contact',
      injuryType: 'impact',
      recoveryDays: 1,
      assessmentRequired: false,
    };
  // Additional timing probe; never used to replace covered fixtures or retune policy.
  if (options.variant === 'timed_run') {
    if (options.scenario === 'third_man' || options.scenario === 'press') {
      for (const p of state.players.filter(
        (p) =>
          p.team === a.team &&
          p.id !== a.id &&
          p.id !== b.id &&
          p.id !== c.id &&
          p.slot.position === 'central_midfielder',
      ))
        p.duty = 'defend';
      c.position = { x: 63, y: 44 };
      c.velocity = { x: 4, y: 1 };
      c.facingAngle = Math.PI / 2;
    } else if (options.scenario === 'overlap') {
      c.position = { x: 70, y: 5 };
      c.velocity = { x: 5, y: 0 };
    } else if (options.scenario === 'underlap') {
      c.position = { x: 70, y: 18 };
      c.velocity = { x: 5, y: 1 };
    }
  }
  if (options.variant === 'lead' || options.variant === 'trailing') {
    state.time = 81 * 60;
    state.status = 'second_half';
    state.score = {
      home: options.variant === 'lead' ? 1 : 0,
      away: options.variant === 'trailing' ? 1 : 0,
    };
  }
  if (options.scenario === 'human') {
    state.controlledFootballerId = a.id;
    state.playerAgencyEnabled = true;
  }
  state.ball = {
    x: a.position.x + 0.35,
    y: a.position.y,
    height: 0.11,
    ownerId: a.id,
    lastTouchPlayerId: a.id,
  };
  state.ballOwnershipStartedAt = state.time - 2;
  state.onBallPreparation = deriveOnBallPreparation(
    { ...state, time: state.time - 2 },
    a,
    'clean_control',
  );
  const action: MatchAction = {
    type: 'pass',
    actorId: a.id,
    receiverId: b.id,
    target: { ...b.position },
    intent: 'support',
  };
  if (options.mirrored) {
    state.endsSwitched = true;
    for (const side of ['home', 'away'] as const) state.teams[side].endsSwitched = true;
    for (const p of state.players) {
      p.endsSwitched = true;
      for (const key of ['position', 'target', 'neutralAnchor', 'idealTarget'] as const) {
        const point = p[key];
        if (point) p[key] = { x: 105 - point.x, y: 68 - point.y };
      }
      p.velocity = { x: -p.velocity.x, y: -p.velocity.y };
      p.facingAngle = p.facingAngle > 0 ? p.facingAngle - Math.PI : p.facingAngle + Math.PI;
    }
    state.ball.x = 105 - state.ball.x;
    state.ball.y = 68 - state.ball.y;
    action.target = { x: 105 - action.target.x, y: 68 - action.target.y };
    state.onBallPreparation = deriveOnBallPreparation(
      { ...state, time: state.time - 2 },
      a,
      'clean_control',
    );
  }
  return { state, action, a: a.id, b: b.id, c: c.id, options };
};

export const PR174_DEVELOPMENT: CombinationFixtureInput[] =
  combinationFixtureSchema.shape.scenario.options.flatMap((scenario) =>
    (['open', 'covered', 'weak', 'tired', 'recovering'] as const).map((variant) => ({
      scenario,
      variant,
    })),
  );
/** Declared before policy changes; never use this seed/orientation split for tuning. */
export const PR174_HELD_OUT: CombinationFixtureInput[] =
  combinationFixtureSchema.shape.scenario.options.flatMap((scenario) =>
    (['open', 'covered'] as const).map((variant) => ({
      scenario,
      variant,
      mirrored: true,
      seed: 'pr174-held-out-b-20261017',
    })),
  );

export const PR174_TARGETED: CombinationFixtureInput[] = (
  ['third_man', 'overlap', 'underlap', 'press'] as const
).flatMap((scenario) =>
  (['timed_run', 'offside', 'unavailable', 'covered'] as const).map((variant) => ({
    scenario,
    variant,
    seed: 'pr174-targeted-timing',
  })),
);
