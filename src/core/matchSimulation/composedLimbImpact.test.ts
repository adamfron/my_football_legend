// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { createPr224LimbScene, selectPr224Body } from '../../../scripts/pr224Scenarios';
import { measureBallContactWork, resolveComposedLimbImpact } from './ballContactResolution';
import { ZERO_BALL_SPIN, ballSpinSchema } from './ballPhysics';
import { withIntegrationProfile } from './integrationProfile';
import { effectiveHolisticRecipe, withHolisticDevelopment } from './holisticDevelopment';
import { captureReceptionStep } from './receptionTrace';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';

const surface = { normal: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };

it('leaves axial spin intact during a central impact and ignores a departing contact', () => {
  const incoming = { velocity: { x: -4, y: 0, z: 0 }, spin: { x: 40, y: 0, z: 0 } };
  const hit = resolveComposedLimbImpact(incoming, surface);
  expect(hit.velocity.x).toBeCloseTo(1.52, 12);
  expect(hit.spin).toEqual(incoming.spin);
  const departing = { ...incoming, velocity: { x: 1, y: 1, z: 0 } };
  expect(resolveComposedLimbImpact(departing, surface)).toMatchObject(departing);
});

it('accounts for moving-surface work and slip with one coupled impulse at the spin bound', () => {
  const moving = { ...surface, velocity: { x: 5, y: 1, z: 0 } };
  const incoming = { velocity: ZERO_BALL_SPIN, spin: ZERO_BALL_SPIN };
  const hit = resolveComposedLimbImpact(incoming, moving);
  const account = measureBallContactWork(incoming, hit, [{ ...moving, impulse: hit.impulse }]);
  expect(account.delta).toBeGreaterThan(0);
  expect(account.surfaceWork).toBeGreaterThan(account.delta);
  expect(account.contactFrameWork).toBeLessThan(0);
  expect(account.residual).toBeCloseTo(0, 12);
  expect(account.surfaces[0]?.outgoingTangent.y).toBeCloseTo(0, 12);

  const nearlyAtCap = { velocity: { x: -10, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 159 } };
  const capped = resolveComposedLimbImpact(nearlyAtCap, {
    ...surface,
    velocity: { x: 0, y: -40, z: 0 },
  });
  const verification = measureBallContactWork(nearlyAtCap, capped, [
    { ...surface, velocity: { x: 0, y: -40, z: 0 }, impulse: capped.impulse },
  ]);
  expect(ballSpinSchema.parse(capped.spin).z).toBeCloseTo(160, 12);
  expect(verification.residual).toBeCloseTo(0, 12);
});

it('uses the coupled impulse in the existing chronological race and leaves the ball loose', () => {
  const legacy = selectPr224Body(createPr224LimbScene('right', 'recovering'));
  legacy.ball.spin = { x: 8, y: -15, z: 40 };
  const candidate = {
    ...legacy,
    experimentalComposedLegContact: 'composed-leg-impulse-dev-v2',
  } satisfies TacticalMatchState;
  const run = (input: TacticalMatchState) =>
    captureReceptionStep(() => stepTacticalMatch(input, 0.025), { contactWork: true });
  const historical = run(legacy);
  const next = run(candidate);
  const measured = (result: ReturnType<typeof run>) =>
    result.events.find(({ source }) => source.endsWith('composedLimbWork'))?.detail;
  expect(measured(historical)).toMatchObject({ solver: 'legacy_rebound' });
  expect(measured(next)).toMatchObject({
    solver: 'coupled_impulse',
    correction: 0,
    account: { residual: expect.closeTo(0, 10) },
  });
  expect(next.state.lastLimbContacts?.[0]?.at).toBe(historical.state.lastLimbContacts?.[0]?.at);
  expect(next.state.safetyHalt).toBeUndefined();
  expect(next.state.ball.ownerId).toBeUndefined();
  expect(next.state.lastGroundContact?.executed).not.toBe(true);
  expect(next.state.lastPassDiagnostic?.releasedAt).toBeUndefined();
  expect(next.state).toEqual(stepTacticalMatch(candidate, 0.025));
  expect(tacticalMatchStateSchema.parse(next.state).experimentalComposedLegContact).toBe(
    'composed-leg-impulse-dev-v2',
  );
  expect(
    withIntegrationProfile(candidate, 'realism-candidate-v1').experimentalComposedLegContact,
  ).toBeUndefined();
});

it('selects the candidate explicitly and keeps the PR225 lab recipe at edition E', () => {
  const input = createPr224LimbScene('right');
  const prior = withHolisticDevelopment(input, 'state-value-v1', 'holistic-full-body-dev-v1');
  const selected = withHolisticDevelopment(input, 'state-value-v1', 'holistic-limb-impulse-dev-v1');
  expect(effectiveHolisticRecipe(prior)).toMatchObject({
    id: 'holistic-full-body-dev-v1',
    composedLegContact: 'composed-leg-contact-dev-v1',
  });
  expect(effectiveHolisticRecipe(selected)).toMatchObject({
    id: 'holistic-limb-impulse-dev-v1',
    composedLegContact: 'composed-leg-impulse-dev-v2',
  });
});

it('resolves the native opposing knee and thigh within the original event budget', () => {
  const snapshot = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr226-knee-thigh-checkpoint.json.gz')).toString(),
  ) as TacticalMatchState;
  const before = tacticalMatchStateSchema.parse(snapshot) as unknown as TacticalMatchState;
  const { state, events } = captureReceptionStep(() => stepTacticalMatch(before, 0.025), {
    mechanics: true,
  });
  const race = events.filter(({ source }) => source.endsWith('intervalRace'));
  expect(state.safetyHalt).toBeUndefined();
  expect(state.time).toBe(before.time + 0.025);
  expect(state.ball.ownerId).toBeUndefined();
  expect(race).toHaveLength(17);
  expect(race.at(-1)?.detail).toMatchObject({ event: undefined });
  expect(events.filter(({ source }) => source.endsWith('opposingLegContacts'))).toMatchObject([
    {
      actorId: 'footballer_pro_1_23',
      detail: { primary: { leg: { region: 'knee' } }, other: { leg: { region: 'thigh' } } },
    },
  ]);
});

it('reports a near-ground search exhaustion without inventing an impact or release', () => {
  const before = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr226-ground-graze-checkpoint.json.gz')).toString(),
  ) as TacticalMatchState;
  const { state, events } = captureReceptionStep(() => stepTacticalMatch(before, 0.025), {
    mechanics: true,
  });
  expect(state.safetyHalt).toMatchObject({ reason: 'pendingStrikeInterval.event_budget' });
  const race = events.filter(({ source }) => source.endsWith('intervalRace'));
  expect(race.slice(-5).every(({ detail }) =>
    (detail as { event?: { kind: string } }).event?.kind === 'search_frontier',
  )).toBe(true);
  expect(state.lastPassDiagnostic?.releasedAt).toBe(before.lastPassDiagnostic?.releasedAt);
});
