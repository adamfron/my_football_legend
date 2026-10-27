import { describe, expect, it } from 'vitest';
import { createSensor, sampleSensor } from './pr199FlightLab.mjs';
const actor = {
  id: 'lab-observer',
  position: { x: 0, y: 0 },
  facingAngle: Math.PI / 2,
  profile: { attributes: { gameReading: 60, concentration: 60 } },
};
const cue = {
  at: 1,
  position: { x: 10, y: 0 },
  facing: Math.PI / 2,
  approachVelocity: { x: 0, y: 0 },
  preparing: true,
};
describe('laboratory sensory acquisition boundary', () => {
  it('requires actual range and facing for a preparation cue', () => {
    expect(createSensor(actor, 'seed', cue).cueAcquired).toBe(true);
    const far = createSensor(actor, 'seed', { ...cue, position: { x: 50, y: 0 } });
    expect(far.cueOffered).toBe(true);
    expect(far.cueAcquired).toBe(false);
    expect(far.belief).toBeUndefined();
    expect(
      createSensor({ ...actor, facingAngle: -Math.PI / 2 }, 'seed', cue).belief,
    ).toBeUndefined();
  });
  it('does not grant an acquisition just because a short window is offered', () => {
    const sensor = createSensor(actor, 'seed');
    sampleSensor(sensor, actor, { position: { x: 10, y: 0, z: 1 } }, 1, true);
    sampleSensor(sensor, actor, { position: { x: 10.3, y: 0, z: 1 } }, 1.025, true);
    expect(sensor.offered).toBeCloseTo(0.05);
    expect(sensor.belief.observations).toBe(1);
    expect(sensor.belief.velocity).toBeNull();
  });
  it('does not refresh a hidden belief from velocity, spin or position', () => {
    const a = createSensor(actor, 'seed'),
      b = createSensor(actor, 'seed');
    sampleSensor(
      a,
      actor,
      { position: { x: 10, y: 0, z: 1 }, velocity: { x: 100, y: 0, z: 0 } },
      1,
      true,
    );
    sampleSensor(
      b,
      actor,
      { position: { x: 10, y: 0, z: 1 }, velocity: { x: -100, y: 0, z: 0 }, spin: { z: 90 } },
      1,
      true,
    );
    expect(a.belief).toEqual(b.belief);
    const old = globalThis.structuredClone(a.belief);
    sampleSensor(
      a,
      actor,
      { position: { x: 30, y: 5, z: 2 }, velocity: { x: -100, y: 0, z: 0 } },
      1.2,
      false,
    );
    expect(a.belief).toEqual(old);
  });
});
