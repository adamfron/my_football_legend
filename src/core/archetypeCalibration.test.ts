import { describe, expect, it } from 'vitest';
import { FOOTBALL_ARCHETYPES, getEligibleFootballArchetypes } from './footballArchetypes';

const byId = (id: string) => FOOTBALL_ARCHETYPES.find((item) => item.id === id)!;

describe('canonical archetype calibration', () => {
  it('removes semantic duplicate and tactical player archetypes', () => {
    expect(byId('regista')).toBeDefined();
    expect(FOOTBALL_ARCHETYPES.some((a) => a.id === 'deep_playmaker')).toBe(false);
    expect(getEligibleFootballArchetypes('striker').some((a) => a.id === 'withdrawn_forward')).toBe(
      false,
    );
    expect(
      getEligibleFootballArchetypes('attacking_midfielder').some((a) => a.id === 'false_nine'),
    ).toBe(false);
    expect(FOOTBALL_ARCHETYPES.some((a) => a.label === 'Odwrócony boczny obrońca')).toBe(false);
  });

  it('keeps deliberately opposing and distinct generation definitions', () => {
    expect(byId('regista').generationBias.tackling).toBeLessThan(0);
    expect(byId('ball_winner').generationBias.tackling).toBeGreaterThan(0);
    expect(byId('regista').generationBias.technique).toBeGreaterThan(0);
    expect(byId('ball_winner').generationBias.technique).toBeLessThan(0);
    expect(byId('mezzala').generationBias).not.toEqual(byId('dribbling_creator').generationBias);
    expect(byId('fullback_defensive').generationBias).not.toEqual(
      byId('fullback_offensive').generationBias,
    );
    const cb = getEligibleFootballArchetypes('center_back').map((a) =>
      JSON.stringify(a.generationBias),
    );
    expect(new Set(cb).size).toBe(6);
  });

  it('models complete players with broad moderate shaping', () => {
    for (const id of ['complete_forward', 'complete_midfielder', 'center_back_complete']) {
      const values = Object.values(byId(id).generationBias);
      expect(values.length).toBeGreaterThanOrEqual(7);
      expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(4);
    }
  });
});
