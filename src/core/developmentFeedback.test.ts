import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  formatAttributeDelta,
  getSeasonAttributeDelta,
  getSeasonOverallDelta,
} from './developmentFeedback';

const career = () => {
  const seed = 'season-feedback';
  return createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Rozwój',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'left_winger',
        heightCm: 175,
        weightKg: 68,
        seed,
      },
      seed,
      0,
    ),
    seed,
  );
};

describe('current-season development feedback', () => {
  it('formats positive, zero and negative deltas without relying on colour', () => {
    expect(formatAttributeDelta(2)).toBe('(+2) ↑');
    expect(formatAttributeDelta(0)).toBe('');
    expect(formatAttributeDelta(-1)).toBe('(−1) ↓');
  });

  it('calculates attribute and position-weighted OVR changes from the same baseline', () => {
    const initial = career();
    const baseline = { ...initial.player.attributes };
    const improved = {
      ...initial,
      seasonStartingAttributes: baseline,
      player: {
        ...initial.player,
        attributes: { ...baseline, pace: baseline.pace + 10, technique: baseline.technique + 4 },
      },
    };
    expect(getSeasonAttributeDelta(improved.player.attributes, baseline, 'pace')).toBe(10);
    expect(getSeasonOverallDelta(improved)).toBeGreaterThan(0);
  });

  it('degrades gracefully for legacy saves without a season baseline', () => {
    const legacy = { ...career(), seasonStartingAttributes: undefined };
    expect(getSeasonAttributeDelta(legacy.player.attributes, undefined, 'passing')).toBeUndefined();
    expect(getSeasonOverallDelta(legacy)).toBeUndefined();
  });
});
