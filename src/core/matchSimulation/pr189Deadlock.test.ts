// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  capturePathologicalState,
  restorePathologicalState,
  createPathologyDetector,
} from './pathologicalReplay';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { withBoundedObserver, advanceBoundedOwnerDecision } from './boundedIntelligence';
import { releaseContactReadiness } from './decisionReadiness';
import { observeBoundedScene } from './boundedPerception';
import {
  deriveBallContactAccess,
  playerContactGeometry,
  advanceControlledBall,
} from './ballContactGeometry';
import { derivePressingPlan } from './defensiveChallenges';
import { resolveMatchAction } from './matchActions';
import { distance, distanceToSegment } from './matchSpace';
import { prepareRestartMovement } from './restartLifecycle';
import { deriveRestartLegalReadiness, legalizeRestartPlayerTarget } from './restartLaws';
import type { TacticalMatchState } from './matchState';

const commit = 'a74be9ee846ac4958fd67e42795cf3d86946e937';
const capture = (seconds = 20) =>
  JSON.parse(
    gunzipSync(readFileSync(`docs/performance/pr189/baseline-${seconds}s.json.gz`)).toString(),
  );
const frozen = () => restorePathologicalState(capture());
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const owner = (s: TacticalMatchState) => s.players.find((p) => p.id === s.ball.ownerId)!;

describe('PR189 real captured decision/contact deadlock', () => {
  const restartCapture = () =>
    restorePathologicalState(
      JSON.parse(
        gunzipSync(
          readFileSync(
            'docs/performance/pr189/sw-contextual-judgment-v1-cutoff-diagnosis-cutoff.json.gz',
          ),
        ).toString(),
      ),
    );

  it('routes the captured encroaching defender around opposing bodies without granting legal readiness', () => {
    const state = restartCapture(),
      before = sha(state),
      actor = state.players.find((p) => p.id === 'geometry:opponent:3')!;
    expect(distance(actor.position, state.restart!.spot!)).toBeLessThan(9.15);
    const blockers = state.players.filter(
      (p) => p.id !== actor.id && distanceToSegment(p.position, actor.position, actor.target) < 1.2,
    );
    expect(blockers.map((p) => p.id)).toContain('geometry:anchor:7');
    expect(blockers.every((p) => state.restart!.roles[p.id]?.key !== 'wall')).toBe(true);
    const planned = prepareRestartMovement(state),
      target = planned.players.find((p) => p.id === actor.id)!.target;
    expect(target).not.toEqual(actor.target);
    expect(distance(target, state.restart!.spot!)).toBeGreaterThanOrEqual(9.3);
    expect(
      blockers.every((p) => distanceToSegment(p.position, actor.position, target) >= 1.15 - 1e-8),
    ).toBe(true);
    expect(deriveRestartLegalReadiness(planned).opponentsReady).toBe(false);
    expect(planned.players.find((p) => p.id === actor.id)!.position).toEqual(actor.position);
    expect(sha(state)).toBe(before);
  });

  it('accounts for a body just beyond the restart target, including its endpoint envelope', () => {
    const state = restartCapture(),
      actor = state.players.find((p) => p.id === 'geometry:opponent:3')!,
      target = { x: actor.position.x + 8, y: actor.position.y };
    // A clear route is preserved. The obstructing neighbour is beyond the target,
    // so its body can prevent arrival even though its centre is outside the segment.
    state.players = [actor];
    expect(legalizeRestartPlayerTarget(state, actor, target)).toEqual(target);
    const other = restartCapture().players.find((p) => p.id === 'geometry:anchor:7')!;
    state.players.push({ ...other, position: { x: target.x + 0.5, y: target.y } });
    const bypass = legalizeRestartPlayerTarget(state, actor, target);
    expect(bypass).not.toEqual(target);
    expect(distance(bypass, state.players[1]!.position)).toBeGreaterThanOrEqual(1.2);
    expect(distance(bypass, state.restart!.spot!)).toBeGreaterThanOrEqual(9.3);
  });

  it('physically releases the captured free kick with deterministic replay and no clock reset', () => {
    const initial = restartCapture(),
      awardId = initial.restart!.awardId,
      requiredEndAt = initial.timekeeping!.requiredEndAt;
    const run = (observed: boolean) => {
      let state = restartCapture(),
        releasedAt: number | undefined,
        maximumStep = 0;
      const events: unknown[] = [];
      state = withBoundedObserver(
        observed
          ? (trace) => {
              events.push(trace);
            }
          : undefined,
        () => {
          for (let i = 0; i < 160; i++) {
            const before = state;
            state = step(state, 0.025);
            for (const player of state.players) {
              const previous = before.players.find((p) => p.id === player.id);
              if (previous)
                maximumStep = Math.max(maximumStep, distance(previous.position, player.position));
            }
            const interval = state.stoppageLedger?.intervals.find((p) => p.awardId === awardId);
            if (releasedAt === undefined && interval?.executedAt !== undefined) {
              releasedAt = interval.executedAt;
              const defenders = state.players.filter(
                (p) => p.team !== initial.restart!.restartTeam,
              );
              expect(
                defenders.every((p) => distance(p.position, initial.restart!.spot!) >= 9.14),
              ).toBe(true);
              expect(Math.hypot(state.ball.velocity!.x, state.ball.velocity!.y)).toBeGreaterThan(1);
            }
          }
          return state;
        },
      );
      expect(releasedAt).toBeDefined();
      expect(releasedAt! - initial.time).toBeLessThan(4);
      expect(maximumStep).toBeLessThan(0.35);
      expect(state.timekeeping!.requiredEndAt).toBeGreaterThanOrEqual(requiredEndAt);
      return { state: sha(state), events: sha(events), releasedAt };
    };
    const direct = run(true),
      repeat = run(true),
      bare = run(false);
    expect(repeat).toEqual(direct);
    expect(bare.state).toBe(direct.state);
  });
  it('detects unchanged physical positions even when nominal locomotion claims movement', () => {
    const state = frozen(),
      actor = owner(state),
      detect = createPathologyDetector(0.05);
    actor.velocity = { x: 0.45, y: 0 };
    expect(detect(state, 0.025)).toBeUndefined();
    expect(detect({ ...state, time: state.time + 0.025 }, 0.025)).toBeUndefined();
    expect(detect({ ...state, time: state.time + 0.05 }, 0.025)).toBe('stationary_possession');
  });
  it('ends blocked, unreachable control at the missed foot window without awarding another owner', () => {
    const saved = JSON.parse(
      gunzipSync(
        readFileSync(
          'docs/performance/pr189/ww-opportunity-driven-v1-owner-audit-pathology-owner-120s.json.gz',
        ),
      ).toString(),
    );
    const state = restorePathologicalState(saved),
      actor = owner(state);
    expect(releaseContactReadiness(state, actor).reason).toBe('out_of_reach');
    const pursuing = advanceControlledBall(state, actor, 0.025, undefined, {
      x: actor.position.x + 0.05,
      y: actor.position.y,
    });
    expect(pursuing.state.ball.ownerId).toBe(actor.id);
    const next = step(state, 0.025);
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.ball.looseSince).toBeDefined();
    expect(next.lastGroundContact?.executed).toBe(false);
    expect(next.lastGroundContact?.retained).toBe(false);
    expect(next.lastGroundContact?.physicalCount).toBe(
      state.controlledBallContact!.physicalContacts,
    );
    expect(Math.hypot(next.ball.velocity!.x, next.ball.velocity!.y)).toBeLessThan(0.001);
    expect(next.players.find((p) => p.id === actor.id)!.position).toEqual(actor.position);
  });
  it.each([0, 1])(
    'releases from the newly captured SS recovery conflict %s without another premature control touch',
    (index) => {
      const saved = JSON.parse(
        gunzipSync(
          readFileSync(
            `docs/performance/pr189/ss-hierarchical-intent-v1-v1-pathology-${index}.json.gz`,
          ),
        ).toString(),
      );
      let state = restorePathologicalState(saved);
      const actor = owner(state),
        last = state.lastGroundContact!;
      expect(state.controlledBallContact!.nextContact.earliestAt).toBeLessThan(
        last.at + last.surfaceContact!.recoverySeconds,
      );
      const tooEarly = { ...state, time: last.at + last.surfaceContact!.recoverySeconds - 0.025 };
      const control = advanceControlledBall(tooEarly, actor, 0.025);
      expect(control.state.lastGroundContact!.at).toBe(last.at);
      const before = state.lastPassDiagnostic?.passId;
      const started = state.time;
      for (let i = 0; i < 80 && state.lastPassDiagnostic?.passId === before; i++)
        state = step(state, 0.025);
      expect(state.lastPassDiagnostic?.passId).not.toBe(before);
      expect(state.time - started).toBeLessThan(2);
    },
  );
  it.each([0, 20, 60, 300, 1200, 1984])(
    'releases a physical pass from the actual %ss PR188 state',
    (seconds) => {
      let state = restorePathologicalState(capture(seconds));
      const before = state.lastPassDiagnostic?.passId;
      const start = state.time;
      for (let i = 0; i < 80 && state.lastPassDiagnostic?.passId === before; i++)
        state = step(state, 0.025);
      expect(state.lastPassDiagnostic?.passId).not.toBe(before);
      expect(state.ball.ownerId).not.toBe('geometry:anchor:5');
      expect(Math.hypot(state.ball.velocity!.x, state.ball.velocity!.y)).toBeGreaterThan(1);
      expect(state.ball.lastTouchPlayerId).toBe('geometry:anchor:5');
      expect(state.time - start).toBeLessThan(2);
    },
  );

  it('waits for the actual contact recovery, then consumes the prepared opportunity before another scan', () => {
    const state = frozen(),
      actor = owner(state);
    const ready = releaseContactReadiness(state, actor);
    expect(ready.reason).toBe('motor_recovery');
    expect(ready.readyAt).toBeGreaterThan(state.time + 0.19);
    const later = { ...state, time: ready.readyAt + 0.001 };
    // The preceding observation is intentionally within visual latency. Motor
    // execution must still revalidate the current candidate instead of resampling
    // the periodic blackout after another ordinary touch.
    later.boundedRuntime = { ...state.boundedRuntime!, lastDecisionAt: later.time - 0.025 };
    expect(observeBoundedScene(later, actor).contactReady).toBe(true);
    expect(advanceBoundedOwnerDecision(later, actor).action?.type).toBe('pass');
    const early = { ...later, time: ready.readyAt - 0.025 };
    expect(observeBoundedScene(early, actor).contactReady).toBe(false);
    expect(advanceBoundedOwnerDecision(early, actor).action).toBeUndefined();
  });

  it('retains every persistent field and gives identical state/event hashes with an observer on or off', () => {
    const initial = frozen();
    const saved = capturePathologicalState(initial, commit, 'regression');
    expect(sha(saved.state)).toBe(sha(initial));
    const run = (state: TacticalMatchState, observed: boolean) => {
      const events: unknown[] = [];
      state = withBoundedObserver(
        observed
          ? (t) => {
              events.push(t);
            }
          : undefined,
        () => {
          for (let i = 0; i < 160; i++) state = step(state, 0.025);
          return state;
        },
      );
      return { state: sha(state), events: sha(events) };
    };
    const direct = run(initial, true);
    const resumed = run(restorePathologicalState(saved), true);
    const bare = run(restorePathologicalState(saved), false);
    expect(resumed).toEqual(direct);
    expect(bare.state).toBe(direct.state);
    const other = restorePathologicalState(saved);
    other.controlledBallContact!.balance = 0;
    expect(saved.state.controlledBallContact!.balance).toBeGreaterThan(0.9);
    expect(() => restorePathologicalState({ ...saved, schemaVersion: 2 })).toThrow();
  });

  it('captures diagnostic signals once per possession without mutating or advancing the state', () => {
    const state = frozen(),
      hash = sha(state),
      detect = createPathologyDetector(0.05);
    expect(detect(state, 0.025)).toBeUndefined();
    expect(detect(state, 0.025)).toBe('stationary_possession');
    expect(detect(state, 0.025)).toBeUndefined();
    expect(detect(state, 0.025, 'rejected_release')).toBe('rejected_release');
    expect(detect(state, 0.025, 'rejected_release')).toBeUndefined();
    expect(sha(state)).toBe(hash);
  });

  it('keeps an unreachable or high ball unavailable even with a prepared opportunity', () => {
    const state = frozen(),
      actor = owner(state);
    state.time += 0.22;
    state.ball.x = actor.position.x + 1.8;
    expect(releaseContactReadiness(state, actor).reason).toBe('out_of_reach');
    expect(advanceBoundedOwnerDecision(state, actor).action?.type).not.toBe('pass');
    state.ball.x = actor.position.x;
    state.ball.height = 0.9;
    expect(releaseContactReadiness(state, actor).reason).toBe('height');
  });

  it('moves the body toward an inconvenient ball through canonical finite movement', () => {
    let state = frozen();
    const actor = owner(state),
      origin = { ...actor.position };
    state.ball = { ...state.ball, x: origin.x + 1.65, y: origin.y, velocity: { x: 0, y: 0, z: 0 } };
    const start = distance(origin, state.ball);
    for (let i = 0; i < 12; i++) state = step(state, 0.025);
    const moved = state.players.find((p) => p.id === actor.id)!;
    expect(distance(moved.position, state.ball)).toBeLessThan(start);
    expect(distance(moved.position, origin)).toBeGreaterThan(0.01);
    expect(distance(moved.position, origin)).toBeLessThan(1);
    expect(state.ballCarrierIntent).toBeUndefined();
  });

  it('revalidates the required foot and reports why a canonical attempt did not release', () => {
    const state = frozen(),
      actor = owner(state);
    state.time += 0.22;
    const feet = playerContactGeometry(actor);
    const dx = feet.leftFoot.x - feet.rightFoot.x,
      dy = feet.leftFoot.y - feet.rightFoot.y;
    const metres = Math.hypot(dx, dy);
    state.ball = {
      ...state.ball,
      x: feet.leftFoot.x + (dx / metres) * 0.7,
      y: feet.leftFoot.y + (dy / metres) * 0.7,
    };
    const failures: string[] = [];
    const next = withBoundedObserver(
      (t) => {
        if (t.contactFailure) failures.push(t.contactFailure);
      },
      () =>
        resolveMatchAction(state, {
          type: 'pass',
          actorId: actor.id,
          receiverId: 'geometry:anchor:8',
          target: { x: 45, y: 30 },
          intent: 'support',
          foot: 'right',
        }),
    );
    expect(next).toBe(state);
    expect(failures).toContain('wrong_foot');
  });

  it('uses body-side geometry independently for each defender rather than shielding immunity', () => {
    const state = frozen(),
      actor = owner(state);
    const defender = state.players.find((p) => p.team !== actor.team)!;
    state.ball = { ...state.ball, x: actor.position.x + 0.5, y: actor.position.y };
    defender.position = { x: actor.position.x - 0.7, y: actor.position.y };
    defender.facingAngle = Math.PI / 2;
    expect(deriveBallContactAccess(state, defender, actor).bodyOccludes).toBe(true);
    defender.position = { x: actor.position.x + 1.1, y: actor.position.y };
    defender.facingAngle = -Math.PI / 2;
    expect(deriveBallContactAccess(state, defender, actor).ballReachable).toBe(true);
  });

  it('lets covered static containment close physically while preserving the historical control', () => {
    const state = frozen(),
      actor = owner(state);
    const defender = state.players
      .filter((p) => p.team !== actor.team)
      .sort(
        (a, b) => distance(a.position, actor.position) - distance(b.position, actor.position),
      )[0]!;
    const plan = derivePressingPlan(state, defender.id, null)!;
    expect(plan.covering).toBeGreaterThan(0);
    expect(plan.intention).toBe('engage');
    expect(plan.standOff).toBeLessThan(1.5);
    const historical = derivePressingPlan(
      { ...state, decisionPolicy: 'state-value-v1' },
      defender.id,
      null,
    )!;
    expect(historical.intention).toBe('contain');
    expect(historical.standOff).toBeGreaterThan(2);
  });
});
