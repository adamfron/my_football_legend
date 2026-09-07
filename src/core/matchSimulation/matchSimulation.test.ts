import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { FORMATIONS } from '../footballerWorld';
import { createSingleMatchSession } from '../singleMatch';
import {
  chooseNpcAction,
  createTacticalMatch,
  enumerateAvailableActions,
  formationSlotToPitch,
  PITCH_LENGTH,
  PITCH_WIDTH,
  resolveMatchAction,
  stepTacticalMatch,
  tacticalMatchStateSchema,
} from '.';

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
});
describe('autonomous tactical simulation', () => {
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
});
