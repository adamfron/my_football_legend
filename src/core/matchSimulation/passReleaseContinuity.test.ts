// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState, type MatchAction } from './matchState';
import { selectsPendingPass } from './pendingStrike';
import { interpretPassExecution, isPhysicalKickPassTechnique } from './passExecution';
import { createPr211Scene } from '../../../scripts/pr211Scenarios';
import { withHolisticDevelopment } from './holisticDevelopment';

const incident = JSON.parse(
  gunzipSync(
    readFileSync('docs/performance/pr216/next-release-handoff-blocker-five-v2.json.gz'),
  ).toString(),
);
const reload = (s: unknown) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;
const initial = () =>
  reload(incident.recent.find((s: TacticalMatchState) => s.time > 946.02 && s.time < 946.03));
const action = incident.initial.latestAction as Extract<MatchAction, { type: 'pass' }>;
const nominationScene = () => {
  const f = createPr211Scene();
  const s = withHolisticDevelopment(f.initial);
  s.ball.height = 0.252;
  return { s, request: f.action };
};

it('commits a bouncing ground-pass intention without changing the ball or releasing a pass', () => {
  const { s, request } = nominationScene(),
    a = s.players.find((p) => p.id === request.actorId)!;
  expect(s.ball.height).toBeGreaterThan(0.24);
  expect(selectsPendingPass(s, a, request)).toBe(true);
  const selected = resolveMatchAction(s, request, 'human_selected');
  expect(selected.pendingStrike).toBeDefined();
  expect(selected.ball).toEqual(s.ball);
  expect(selected.actionEvents?.some((e) => e.kind === 'pass' && e.at >= s.time)).not.toBe(true);
  expect(selected.lastKickExecution).toEqual(s.lastKickExecution);
});

it.each([0.239, 0.241, 0.65])(
  'uses pending ground-pass ownership at height %s while preserving incoming momentum',
  (height) => {
    const { s, request } = nominationScene();
    s.ball = { ...s.ball, height };
    const selected = resolveMatchAction(s, request, 'human_selected');
    expect(selected.pendingStrike).toBeDefined();
    expect(selected.ball).toEqual(s.ball);
  },
);

it('rejects an out-of-band intention without falling through to a historical release', () => {
  const { s, request } = nominationScene();
  s.ball = { ...s.ball, height: 0.650001 };
  expect(selectsPendingPass(s, s.players.find((p) => p.id === request.actorId)!, request)).toBe(
    true,
  );
  const out = resolveMatchAction(s, request, 'human_selected');
  expect(out.ball).toEqual(s.ball);
  expect(out.pendingStrike).toBeUndefined();
  expect(out.decisionIndex).toBe(s.decisionIndex);
});

it('keeps an active historical challenge from bypassing the selected pass family', () => {
  const s = initial(),
    opponent = s.players.find(
      (p) => p.team !== s.possessionTeam && p.slot.position !== 'goalkeeper',
    )!;
  s.defensiveChallenge = {
    id: 'release-challenge',
    actorId: opponent.id,
    opponentId: action.actorId,
    technique: 'committed',
    source: 'autonomous_npc',
    startedAt: s.time,
    expiresAt: s.time + 1,
    target: { x: s.ball.x, y: s.ball.y },
  };
  const out = resolveMatchAction(s, action, 'dev_ai_selected');
  expect(out.ball).toEqual(s.ball);
  expect(out.pendingStrike).toBeUndefined();
});

it('resumes the exact pre-release state through a real low-foot impulse and native saved continuation', () => {
  const s = initial();
  let a = stepTacticalMatchAfterDecisionProbe(s, 0.025),
    b = reload(a);
  expect(a.pendingStrike).toBeDefined();
  expect(a.ball.height).toBeGreaterThan(0.24);
  expect(a.ball.travelKind).toBeUndefined();
  const selected = a.pendingStrike!;
  const contacts = new Map<number, NonNullable<TacticalMatchState['lastStrikeResolution']>>();
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    if (a.lastStrikeResolution?.id === selected.id && a.lastStrikeResolution.outcome === 'contact')
      contacts.set(a.lastStrikeResolution.at, a.lastStrikeResolution);
    if (i % 40 === 0) {
      expect(reload(a)).toEqual(reload(b));
      b = reload(b);
    }
  }
  expect(contacts.size).toBe(1);
  const contact = [...contacts.values()][0]!;
  expect(contact.at).toBeGreaterThan(selected.selectedAt);
  expect(contact.at).toBeLessThan(selected.expiresAt);
  expect(contact.contact?.available).toBe(true);
  expect(contact.contact!.point.z).toBeLessThanOrEqual(0.24);
  expect(
    Math.hypot(
      contact.foot!.x - contact.contact!.point.x,
      contact.foot!.y - contact.contact!.point.y,
      contact.foot!.z - contact.contact!.point.z,
    ),
  ).toBeCloseTo(0.145, 6);
  expect(a.decisionIndex).toBeGreaterThan(s.decisionIndex);
});

it('retains the historical pair prototype height scope', () => {
  const s = initial();
  s.experimentalPlayerBodyImpulse = 'upright-pair-dev-v1';
  expect(selectsPendingPass(s, s.players.find((p) => p.id === action.actorId)!, action)).toBe(
    false,
  );
});

it('does not ground a bouncing ball through an unsupported backheel/turning-pass consumer', () => {
  const s = initial(),
    actor = s.players.find((p) => p.id === action.actorId)!,
    receiver = s.players.find((p) => p.id === action.receiverId)!;
  receiver.position = { x: actor.position.x - 5, y: actor.position.y };
  receiver.velocity = { x: 0, y: 0 };
  actor.facingAngle = Math.PI / 2;
  const requested = { ...action, target: { ...receiver.position } };
  delete requested.deliveryPlan;
  const execution = interpretPassExecution(s, actor, requested.target, requested.intent, 'ground', {
    nominalContact: true,
  });
  expect(isPhysicalKickPassTechnique(execution.type)).toBe(false);
  const out = resolveMatchAction(s, requested, 'dev_ai_selected');
  expect(out.ball).toEqual(s.ball);
  expect(out.pendingStrike).toBeUndefined();
});
