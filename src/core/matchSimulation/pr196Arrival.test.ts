import { expect, it } from 'vitest';
import { createCalibrationFixture } from './assumptionCalibration';
import { observeBoundedScene } from './boundedPerception';
import { constructBoundedCandidates, runBoundedPolicy } from './boundedDecision';
import { estimatePlayerArrivalTime, withArrivalForecastCache } from './playerArrival';
import { carryRaceArrival } from './carryOpportunity';
import { tacticalMatchStateSchema } from './matchState';

it('preserves historical defaults and saves the experimental forecast explicitly', () => {
  const f = createCalibrationFixture({ scenario: 'moving_defender' });
  const p = f.state.players.find((p) => p.id === f.defenderId)!;
  p.position = { x: 50, y: 34 };
  p.velocity = { x: -4, y: 0 };
  p.facingAngle = Math.PI;
  const target = { x: 58, y: 34 };
  const old = estimatePlayerArrivalTime(f.state, p, target, 'intercept');
  const state = { ...f.state, experimentalCanonicalArrival: true };
  tacticalMatchStateSchema.parse(state);
  const next = estimatePlayerArrivalTime(state, p, target, 'intercept');
  expect(next.estimatedTime).toBeGreaterThan(old.estimatedTime);
  expect(
    estimatePlayerArrivalTime(
      { ...f.state, experimentalCanonicalArrival: false },
      p,
      target,
      'intercept',
    ),
  ).toEqual(old);
  expect(carryRaceArrival(state, p, target)).toBe(next.estimatedTime);
  expect(
    tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state))).experimentalCanonicalArrival,
  ).toBe(true);
});

it('responds to moving body facing without changing physics, RNG or bounded knowledge', () => {
  const f = createCalibrationFixture({ scenario: 'safe_pass' });
  f.state.experimentalCanonicalArrival = true;
  const p = f.state.players.find((p) => p.id === f.defenderId)!;
  p.velocity = { x: 4, y: 0 };
  p.facingAngle = Math.PI / 2;
  const target = { x: p.position.x + 8, y: p.position.y };
  const before = structuredClone(f.state),
    forward = estimatePlayerArrivalTime(f.state, p, target, 'intercept');
  const backward = estimatePlayerArrivalTime(
    f.state,
    { ...p, facingAngle: -Math.PI / 2 },
    target,
    'intercept',
  );
  expect(backward.estimatedTime).toBeGreaterThan(forward.estimatedTime);
  expect(f.state).toEqual(before);
  const hidden = structuredClone(f.state);
  for (const foe of hidden.players.filter((p) => p.team === 'away'))
    for (const key of Object.keys(
      foe.profile.attributes,
    ) as (keyof typeof foe.profile.attributes)[])
      foe.profile.attributes[key] = 20;
  const capture = (state: typeof f.state) => {
    const scene = observeBoundedScene(state, state.players.find((p) => p.id === f.actorId)!);
    const candidates = constructBoundedCandidates(scene);
    return {
      scene,
      candidates,
      boundedDecisions: (
        ['opportunity-driven-v1', 'hierarchical-intent-v1', 'contextual-judgment-v1'] as const
      ).map((policy) => runBoundedPolicy(policy, { scene, candidates })),
    };
  };
  const a = capture(f.state),
    b = capture(hidden);
  expect(a.scene).toEqual(b.scene);
  expect(a.candidates).toEqual(b.candidates);
  expect(a.boundedDecisions).toEqual(b.boundedDecisions);
});

it('bounds arrival memoization to one immutable ranking transaction', () => {
  const f = createCalibrationFixture({ scenario: 'moving_defender' });
  f.state.experimentalCanonicalArrival = true;
  const p = f.state.players.find((p) => p.id === f.defenderId)!,
    target = { x: p.position.x + 8, y: p.position.y };
  const once = () => estimatePlayerArrivalTime(f.state, p, target, 'intercept');
  const expected = once();
  withArrivalForecastCache(() => {
    expect(once()).toEqual(expected);
    const mutable = once();
    mutable.estimatedTime = 999;
    expect(once()).toEqual(expected);
  });
  p.velocity = { x: -5, y: 0 };
  expect(withArrivalForecastCache(once)).toEqual(withArrivalForecastCache(once, false));
  expect(withArrivalForecastCache(once).estimatedTime).not.toBe(expected.estimatedTime);
});
