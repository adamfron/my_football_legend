import { describe, it, expect } from 'vitest';
import { createTransitionFixture } from './transitionLaboratory';
import { advanceActivePerception } from './activePerception';
import { observeBoundedScene, knownBoundedPlayers } from './boundedPerception';
import { constructBoundedCandidates, runBoundedPolicy } from './boundedDecision';
import {
  prepareObservedReception,
  revalidatePreparedOptions,
  preparedRecognitionLatency,
} from './preReceptionPlanning';
import { rememberedGeometry, activePerceptionRuntimeSchema } from './activePerceptionState';
import { evaluateReceivingPosition, receivingPositionTarget } from './receivingPositions';
import { observeTempoIntention } from './teamTempo';
import { tempoEffort } from './tempoEffort';
import { deriveMovementCapability } from './locomotion';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { tacticalMatchStateSchema } from './matchState';
import { withBoundedObserver } from './boundedIntelligence';
import { runPerceptionLab } from './perceptionLaboratory';

const fixture = () => {
  const f = createTransitionFixture({
    id: 'pr194-contract',
    scenario: 'counterattack',
    transitions: false,
    clearances: false,
  });
  f.state.experimentalActivePerception = true;
  f.state.activePerceptionConfig = { scanning: false, memory: true, preparation: true };
  const actor = f.state.players.find((p) => p.id === f.carrierId)!;
  const support = f.state.players.find((p) => p.id === f.supportId)!;
  actor.position = { x: 58, y: 34 };
  actor.velocity = { x: 0, y: 0 };
  actor.facingAngle = Math.PI / 2;
  support.position = { x: 48, y: 34 };
  support.velocity = { x: 0, y: 0 };
  f.state.ball = {
    ...actor.position,
    ownerId: actor.id,
    height: 0.11,
    velocity: { x: 0, y: 0, z: 0 },
  };
  return { ...f, actor, support };
};
const rememberedFixture = () => {
  const f = fixture();
  f.actor.facingAngle = -Math.PI / 2;
  let state = advanceActivePerception(f.state);
  expect(state.activePerceptionRuntime!.memory[f.actor.id]!.directIds).toContain(f.support.id);
  // Controlled turn after the permitted prior observation; attention now faces away.
  f.actor.facingAngle = Math.PI / 2;
  state = { ...state, time: state.time + 0.25 };
  state.activePerceptionRuntime!.memory[f.actor.id]!.gaze = f.actor.facingAngle;
  state = advanceActivePerception(state);
  return { ...f, state };
};
describe('PR194 bounded perception, preparation and effort contracts', () => {
  it('does not discover a never-observed teammate behind the player', () => {
    const f = fixture(),
      s = advanceActivePerception(f.state),
      scene = observeBoundedScene(s, f.actor);
    expect(knownBoundedPlayers(scene).some((p) => p.id === f.support.id)).toBe(false);
    expect(
      constructBoundedCandidates(scene).some(
        (c) => c.action.type === 'pass' && c.action.receiverId === f.support.id,
      ),
    ).toBe(false);
  });
  it('uses a real recent observation behind the body without relabelling it current', () => {
    const f = rememberedFixture(),
      scene = observeBoundedScene(f.state, f.actor);
    expect(scene.visible.some((p) => p.id === f.support.id)).toBe(false);
    expect(scene.remembered?.some((p) => p.id === f.support.id)).toBe(true);
    const candidates = constructBoundedCandidates(scene);
    expect(
      candidates.some((c) => c.action.type === 'pass' && c.action.receiverId === f.support.id),
    ).toBe(true);
    expect(() => runBoundedPolicy('contextual-judgment-v1', { scene, candidates })).not.toThrow();
    const k = scene.knowledge!.find((p) => p.id === f.support.id)!;
    expect(k.observedAt).toBeLessThan(scene.at);
    expect(k.uncertainty).toBeGreaterThan(0.15);
  });
  it('keeps a misleading remembered position when unseen truth changes', () => {
    const f = rememberedFixture(),
      before = observeBoundedScene(f.state, f.actor);
    f.support.position = { x: 25, y: 65 };
    f.support.velocity = { x: 8, y: -4 };
    f.support.target = { x: 105, y: 3 };
    f.support.profile.attributes.pace = 1;
    const after = observeBoundedScene(f.state, f.actor);
    expect(after.remembered).toEqual(before.remembered);
    expect(constructBoundedCandidates(after)).toEqual(constructBoundedCandidates(before));
  });
  it('does not retarget an actual bounded release to a hidden moved receiver', () => {
    const f = rememberedFixture();
    f.actor.facingAngle = -Math.PI / 2;
    const scene = observeBoundedScene(f.state, f.actor);
    const candidate = constructBoundedCandidates(scene).find(
      (c) => c.action.type === 'pass' && c.action.receiverId === f.support.id,
    )!;
    expect(candidate.action.type === 'pass' && candidate.action.deliveryPlan).toBeTruthy();
    const first = resolveMatchAction(structuredClone(f.state), candidate.action, 'autonomous_npc');
    const changed = structuredClone(f.state),
      receiver = changed.players.find((p) => p.id === f.support.id)!;
    receiver.position = { x: 35, y: 57 };
    receiver.velocity = { x: 5, y: -4 };
    receiver.profile.attributes.firstTouch = 1;
    receiver.profile.attributes.gameReading = 1;
    const second = resolveMatchAction(changed, candidate.action, 'autonomous_npc');
    expect(first.lastPassDiagnostic?.passId).toBeDefined();
    expect(second.ball.velocity).toEqual(first.ball.velocity);
    expect(second.ball.target).toEqual(first.ball.target);
    expect(second.ball.launchSpeed).toEqual(first.ball.launchSpeed);
  });
  it('expires memory, caps extrapolation and keeps uncertainty increasing', () => {
    const f = rememberedFixture(),
      m = f.state.activePerceptionRuntime!.memory[f.actor.id]!;
    const old = m.entities.find((p) => p.id === f.support.id)!;
    old.velocity = { x: 4, y: 0 };
    const a = rememberedGeometry(m, old.observedAt + 0.8, 100, 100).find((p) => p.id === old.id)!;
    const b = rememberedGeometry(m, old.observedAt + 1.2, 100, 100).find((p) => p.id === old.id)!;
    expect(a.position).toEqual(b.position);
    expect(b.uncertainty).toBeGreaterThan(a.uncertainty);
    expect(rememberedGeometry(m, old.observedAt + 2, 100, 100).some((p) => p.id === old.id)).toBe(
      false,
    );
  });
  it('bounds memory and validates optional state without changing historical saves', () => {
    const f = fixture(),
      s = advanceActivePerception(f.state);
    expect(activePerceptionRuntimeSchema.safeParse(s.activePerceptionRuntime).success).toBe(true);
    expect(
      Object.values(s.activePerceptionRuntime!.memory).every((m) => m.entities.length <= 12),
    ).toBe(true);
    delete f.state.experimentalActivePerception;
    delete f.state.activePerceptionConfig;
    expect(tacticalMatchStateSchema.safeParse(f.state).success).toBe(true);
    expect(advanceActivePerception(f.state)).toBe(f.state);
  });
  it('moves attention gradually and stops new scanning under observed urgent pressure', () => {
    const f = fixture();
    f.state.activePerceptionConfig!.scanning = true;
    for (const p of f.state.players.filter((p) => p.team === 'away')) p.position = { x: 20, y: 65 };
    let s = advanceActivePerception(f.state);
    for (let i = 0; i < 12; i++) {
      s = { ...s, time: s.time + 0.1 };
      s = advanceActivePerception(s);
    }
    const m = s.activePerceptionRuntime!.memory[f.actor.id]!;
    expect(m.scans).toBeGreaterThan(0);
    expect(m.entities.every((p) => p.observedAt <= s.time)).toBe(true);
    const foe = f.state.players.find((p) => p.id === f.defenderId)!;
    foe.position = { x: 59, y: 34 };
    s = { ...s, time: s.time + 0.3 };
    s = advanceActivePerception(s);
    const count = s.activePerceptionRuntime!.memory[f.actor.id]!.scans;
    for (let i = 0; i < 10; i++) {
      s = { ...s, time: s.time + 0.1 };
      s = advanceActivePerception(s);
    }
    expect(s.activePerceptionRuntime!.memory[f.actor.id]!.scans).toBe(count);
  });
  it('prepares at most three existing candidates without awarding contact or ownership', () => {
    const f = fixture();
    f.support.position = { x: 66, y: 39 };
    f.state.ball = { x: 48, y: 34, height: 0.11, velocity: { x: 12, y: 0, z: 0 } };
    const s = advanceActivePerception(f.state),
      scene = observeBoundedScene(s, f.actor),
      before = structuredClone(s);
    // Ball must be observed; turn to it for this controlled incoming condition.
    const incoming = {
      ...scene,
      ball: {
        position: { x: 48, y: 34 },
        height: 0.11,
        velocity: { x: 12, y: 0, z: 0 },
        ownerId: null,
      },
    };
    const plan = prepareObservedReception(incoming)!;
    expect(plan.options.length).toBeGreaterThan(0);
    expect(plan.options.length).toBeLessThanOrEqual(3);
    expect(plan.options.every((c) => ['carry', 'pass', 'shot'].includes(c.kind))).toBe(true);
    expect(s).toEqual(before);
    expect(s.ball.ownerId).toBeUndefined();
    const chosen = plan.options.find((c) => c.kind === 'pass');
    if (chosen) {
      const next = resolveMatchAction(
        s,
        {
          type: 'pass',
          actorId: f.actor.id,
          receiverId: chosen.receiverId!,
          target: chosen.target!,
          intent: 'support',
        },
        'autonomous_npc',
      );
      expect(next.ball.ownerId).toBeUndefined();
    }
  });
  it('invalidates expired prepared options at an actual reassessment', () => {
    const f = fixture(),
      scene = observeBoundedScene(f.state, f.actor);
    const plan = prepareObservedReception({
      ...scene,
      ball: {
        position: { x: 48, y: 34 },
        height: 0.11,
        velocity: { x: 12, y: 0, z: 0 },
        ownerId: null,
      },
    })!;
    const later = { ...scene, at: plan.expiresAt + 0.1 };
    const revised = revalidatePreparedOptions(later, plan, constructBoundedCandidates(later));
    expect(revised.status).toBe('revised');
    expect(revised.invalidated.every((p) => p.reason === 'opportunity_expired')).toBe(true);
    expect(preparedRecognitionLatency(later, revised, 0.2)).toBe(0.2);
  });
  it('uses composure for urgent decision stability rather than changing movement capability', () => {
    const f = fixture(),
      scene = observeBoundedScene(f.state, f.actor);
    const plan = prepareObservedReception({
      ...scene,
      ball: {
        position: { x: 48, y: 34 },
        height: 0.11,
        velocity: { x: 12, y: 0, z: 0 },
        ownerId: null,
      },
    })!;
    const baseline = deriveMovementCapability(f.actor);
    f.actor.profile.attributes.composure = 20;
    expect(deriveMovementCapability(f.actor)).toEqual(baseline);
    expect(preparedRecognitionLatency({ ...scene, at: scene.at + 0.4 }, plan, 0.2)).toBeLessThan(
      0.2,
    );
  });
  it('keeps defending roles in a protective receiving position', () => {
    const f = fixture();
    f.support.duty = 'defend';
    f.support.facingAngle = Math.PI / 2;
    delete f.state.experimentalActivePerception;
    const position = evaluateReceivingPosition(f.state, f.support)!;
    expect(position.reason).toBe('protect_role_and_rest_defence');
    expect(position.target).toEqual(f.support.target);
    f.state.experimentalReceivingPositions = true;
    f.state.activePerceptionRuntime = {
      lastUpdateAt: f.state.time,
      memory: {},
      plans: {},
      tempo: {},
      positions: { [f.support.id]: position },
    };
    expect(receivingPositionTarget(f.state, f.support)).toBeUndefined();
    f.support.target = { x: 40, y: 25 };
    expect(receivingPositionTarget(f.state, f.support)).toBeUndefined();
  });
  it('lets a patient coach instruction accelerate for a locally observed open channel', () => {
    const f = fixture();
    delete f.state.experimentalActivePerception;
    f.state.teams.home.style = 'possession';
    delete f.state.teams.home.tacticalPreferences;
    const foes = f.state.players.filter((p) => p.team === 'away');
    for (const p of foes) p.position = { x: 30, y: 60 };
    foes[1]!.position = { x: 65, y: 45 };
    foes[2]!.position = { x: 70, y: 45 };
    const intention = observeTempoIntention(f.state, f.actor);
    expect(intention.mode).toBe('accelerate');
    foes[0]!.position = { x: 64, y: 34 };
    expect(observeTempoIntention(f.state, f.actor).mode).toBe('patient');
  });
  it('separates urgency from physical capacity and preserves urgent motor tasks', () => {
    const f = fixture();
    delete f.state.experimentalActivePerception;
    f.state.experimentalTeamTempo = true;
    for (const p of f.state.players.filter((p) => p.team === 'away')) p.position = { x: 30, y: 60 };
    const fresh = observeTempoIntention(f.state, f.actor),
      capability = deriveMovementCapability(f.actor);
    f.actor.fitness!.longTermCapacity = 0.45;
    f.actor.fitness!.burstReadiness = 0.2;
    const tired = observeTempoIntention(f.state, f.actor);
    expect(tired.urgency).toBe(fresh.urgency);
    expect(tired.capacity).toBeLessThan(fresh.capacity);
    expect(deriveMovementCapability(f.actor).maximumSprintSpeed).toBeLessThan(
      capability.maximumSprintSpeed,
    );
    f.state.activePerceptionRuntime = {
      lastUpdateAt: f.state.time,
      memory: {},
      plans: {},
      positions: {},
      tempo: { [f.actor.id]: { ...tired, mode: 'patient' } },
    };
    expect(tempoEffort(f.state, f.actor, 'sprint', 'receive_pass')).toBe('sprint');
    expect(tempoEffort(f.state, f.actor, 'run', 'support_run')).toBe('jog');
  });
  it('keeps stepping deterministic with a mutating detached decision observer', () => {
    const f = fixture();
    f.state.experimentalReceivingPositions = true;
    f.state.experimentalTeamTempo = true;
    const run = (mutate: boolean) => {
      let s = structuredClone(f.state);
      return withBoundedObserver(
        mutate
          ? (t) => {
              if (t.scene) t.scene.visible.length = 0;
            }
          : undefined,
        () => {
          for (let i = 0; i < 40; i++) s = step(s, 0.025);
          return s;
        },
      );
    };
    expect(run(true)).toEqual(run(false));
  });
  it('records actual contact after conditional preparation and keeps replay observers detached', () => {
    const config = { id: 'actual-reception', condition: 'prior_scan' as const, seconds: 3 };
    const plain = runPerceptionLab(config);
    const observed = runPerceptionLab(config, (sample) => {
      sample.scene.visible.length = 0;
      sample.players.length = 0;
      sample.ball.x = -999;
    });
    expect(plain.deliveryAt).not.toBeNull();
    expect(plain.receiverContactAt).not.toBeNull();
    expect(plain.samples.some((s) => s.plan && s.at < plain.receiverContactAt!)).toBe(true);
    expect(plain.contacts.some((c) => c.actorId === plain.receiverId && c.executed)).toBe(true);
    expect(observed.final).toEqual(plain.final);
  });
  it('does not treat absence of opponent sightings as a verified counterattack channel', () => {
    const f = fixture();
    delete f.state.experimentalActivePerception;
    for (const p of f.state.players.filter((p) => p.team === 'away')) p.position = { x: 5, y: 65 };
    expect(observeTempoIntention(f.state, f.actor).mode).not.toBe('accelerate');
  });
  it('does not label unknown ball ownership as observed opposition possession', () => {
    const f = fixture();
    delete f.state.experimentalActivePerception;
    delete f.state.ball.ownerId;
    expect(observeTempoIntention(f.state, f.actor).mode).toBe('balanced');
  });
});
