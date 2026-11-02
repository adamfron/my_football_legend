// @vitest-environment node
import { expect, it } from 'vitest';
import { createKickFixture } from './physicalKickLaboratory';
import { resolveMatchAction } from './matchActions';
import {
  withHolisticDevelopment,
  observeHolisticActivation,
} from '../../../scripts/holisticDevelopment';
import { tacticalMatchStateSchema } from './matchState';
import { resolveIntegrationProfile } from './integrationProfile';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { stepTacticalMatch } from './matchSimulation';

it('constructs a normal schema-valid development selection without changing a historical checksum', () => {
  const f = createKickFixture({ seed: 'pr214-compatibility' });
  const old = resolveIntegrationProfile('realism-candidate-v1', 'state-value-v1').fingerprint;
  const s = withHolisticDevelopment(f.state);
  expect(s.integrationProfile).toBeUndefined();
  expect(s.decisionPolicy).toBe('state-value-v1');
  expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
  expect(resolveIntegrationProfile('realism-candidate-v1', 'state-value-v1').fingerprint).toBe(old);
  expect(
    tacticalMatchStateSchema.safeParse({
      ...s,
      integrationProfile: {
        id: 'realism-candidate-v1',
        version: 0,
        policy: 'state-value-v1',
        fingerprint: old,
      },
    }).success,
  ).toBe(false);
});
it('selects the pending pass once instead of stacking contact-v1 on the same release', () => {
  const f = createKickFixture({ seed: 'pr214-release-authority' });
  const s = withHolisticDevelopment(f.state);
  s.ball.lastTouchPlayerId = f.actor.id;
  const out = resolveMatchAction(s, f.action, 'human_selected');
  expect(out.pendingStrike).toBeDefined();
  expect(out.lastKickExecution).toBeUndefined();
  expect(out.ball).toEqual(s.ball);
});
it('does not equate configuration, eligibility or a repeated latest witness with invocation', () => {
  const s = withHolisticDevelopment(createKickFixture({ seed: 'pr214-activation' }).state);
  const observations = observeHolisticActivation(s, structuredClone(s));
  expect(observations.some((m) => m.configured)).toBe(true);
  expect(
    observations.every((m) => m.invoked === null && !m.outcomeObserved && !m.fullyEvaluated),
  ).toBe(true);
});
it('freezes the whole selected world at a real offered human decision', () => {
  const f = createKickFixture({ seed: 'pr214-human-freeze', family: 'shot', metres: 20 });
  const s = withHolisticDevelopment(f.state);
  s.playerAgencyEnabled = true;
  s.controlledFootballerId = f.actor.id;
  expect(projectPlayerDecisionOpportunity(s)).toBeDefined();
  expect(stepTacticalMatch(s, 0.025)).toEqual(s);
  expect(stepTacticalMatch(stepTacticalMatch(s, 0.025), 0.025)).toEqual(s);
});
