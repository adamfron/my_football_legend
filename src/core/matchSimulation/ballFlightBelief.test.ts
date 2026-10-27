import { describe, expect, it } from 'vitest';
import {
  acquireFlightSighting,
  beliefFromKicker,
  predictFlightBelief,
  occludesFlight,
  flightBeliefSchema,
} from './ballFlightBelief';

const first = { at: 1, position: { x: 10, y: 10, z: 1 }, positionError: 0.03 };
describe('isolated ball-flight evidence and memory contracts', () => {
  it('does not invent velocity from an instantaneous first sighting', () => {
    const b = acquireFlightSighting(undefined, first, 100);
    expect(b.velocity).toBeNull();
    expect(predictFlightBelief(b, 1.2)?.hasVelocityEstimate).toBe(false);
  });
  it('can infer motion from a short continuous interval in a single acquisition', () => {
    const b = acquireFlightSighting(
      undefined,
      { ...first, motion: { since: 0.95, from: { x: 9, y: 10, z: 0.9 } } },
      60,
    );
    expect(b.observations).toBe(1);
    expect(b.velocitySource).toBe('optical_interval');
    expect(b.velocity?.x).toBeCloseTo(20);
    expect(flightBeliefSchema.safeParse(b).success).toBe(true);
  });
  it('also infers velocity across separated actual sightings', () => {
    const a = acquireFlightSighting(undefined, first, 60);
    const b = acquireFlightSighting(
      a,
      { ...first, at: 1.2, position: { x: 14, y: 10, z: 1.2 } },
      60,
    );
    expect(b.velocitySource).toBe('sighting_displacement');
    expect(b.observations).toBe(2);
  });
  it('does not count a cached sighting as new evidence', () => {
    const b = acquireFlightSighting(undefined, first, 60);
    expect(acquireFlightSighting(b, first, 60)).toBe(b);
  });
  it('retains actual timestamps and grows uncertainty during occlusion', () => {
    const b = acquireFlightSighting(
      undefined,
      { ...first, motion: { since: 0.95, from: { x: 9.5, y: 10, z: 1 } } },
      60,
    );
    const frozen = structuredClone(b);
    const early = predictFlightBelief(b, 1.2)!,
      late = predictFlightBelief(b, 1.8)!;
    expect(late.uncertainty).toBeGreaterThan(early.uncertainty);
    expect(late.confidence).toBeLessThan(early.confidence);
    expect(late.observationAge).toBeCloseTo(0.8);
    expect(b).toEqual(frozen);
  });
  it('cannot learn an unseen deflection, and revises only after a contradictory sighting', () => {
    const b = acquireFlightSighting(
      undefined,
      { ...first, motion: { since: 0.95, from: { x: 9.5, y: 10, z: 1 } } },
      60,
    );
    const prediction = predictFlightBelief(b, 1.2)!;
    expect(prediction.position.x).toBeGreaterThan(10);
    const revised = acquireFlightSighting(
      b,
      { ...first, at: 1.2, position: { x: 7, y: 15, z: 0.5 } },
      60,
    );
    expect(revised.contradicted).toBe(true);
    expect(revised.velocity?.x).toBeLessThan(0);
    expect(predictFlightBelief(b, 1.2)).toEqual(prediction);
  });
  it('keeps a preparation prior distinct from actual flight observations', () => {
    const b = beliefFromKicker({
      at: 1,
      position: { x: 10, y: 10 },
      facing: Math.PI / 2,
      approachVelocity: { x: 0, y: 0 },
      preparing: true,
    });
    expect(b.observations).toBe(0);
    expect(b.lastObservation).toBeNull();
    expect(b.velocitySource).toBe('preparation_prior');
    expect(b.velocityError).toBe(10);
  });
  it('has no usable forecast when neither cue nor post-release evidence exists', () => {
    expect(predictFlightBelief(undefined, 2)).toBeUndefined();
  });
  it('uses a finite horizon and rejects backwards inference times', () => {
    const b = acquireFlightSighting(undefined, first, 60);
    expect(predictFlightBelief(b, 0.9)).toBeUndefined();
    expect(predictFlightBelief(b, 5.1)).toBeUndefined();
  });
  it('uses actual 3D line of sight, including a high ball above a wall', () => {
    const eye = { x: 0, y: 0, z: 1.65 };
    const wall = { centre: { x: 5, y: 0 }, radius: 0.3, bottom: 0, top: 1.8 };
    expect(occludesFlight(eye, { x: 10, y: 0, z: 1 }, wall)).toBe(true);
    expect(occludesFlight(eye, { x: 10, y: 0, z: 5 }, wall)).toBe(false);
    expect(occludesFlight(eye, { x: 10, y: 5, z: 1 }, wall)).toBe(false);
  });
  it('does not let an occluder beyond the ball hide it', () => {
    expect(
      occludesFlight(
        { x: 0, y: 0, z: 1.65 },
        { x: 2, y: 0, z: 1 },
        { centre: { x: 5, y: 0 }, radius: 0.3, bottom: 0, top: 1.8 },
      ),
    ).toBe(false);
  });
  it('does not refresh old motion confidence from a position-only reacquisition', () => {
    const b = acquireFlightSighting(
      undefined,
      { ...first, motion: { since: 0.95, from: { x: 9.5, y: 10, z: 1 } } },
      60,
    );
    const prior = predictFlightBelief(b, 2)!;
    const reacquired = acquireFlightSighting(
      b,
      { at: 2, position: prior.position, positionError: 0.03 },
      60,
    );
    expect(reacquired.motionEvidenceAt).toBe(1);
    expect(reacquired.velocitySource).toBe('remembered_velocity');
    expect(reacquired.velocityError).toBeGreaterThan(b.velocityError);
    expect(predictFlightBelief(reacquired, 2)?.velocityObservationAge).toBe(1);
  });
  it('drops a contradicted old velocity until new legitimate motion evidence arrives', () => {
    const b = acquireFlightSighting(
      undefined,
      { ...first, motion: { since: 0.95, from: { x: 9.5, y: 10, z: 1 } } },
      60,
    );
    const reacquired = acquireFlightSighting(
      b,
      { at: 2, position: { x: 100, y: 50, z: 1 }, positionError: 0.03 },
      60,
    );
    expect(reacquired.contradicted).toBe(true);
    expect(reacquired.velocity).toBeNull();
    const revised = acquireFlightSighting(
      reacquired,
      {
        at: 2.025,
        position: { x: 99.5, y: 50, z: 1 },
        positionError: 0.03,
        motion: { since: 2, from: { x: 100, y: 50, z: 1 } },
      },
      60,
    );
    expect(revised.velocity?.x).toBeLessThan(0);
    expect(revised.motionEvidenceAt).toBe(2.025);
  });
});
