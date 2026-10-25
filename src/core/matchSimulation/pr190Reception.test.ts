import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  applyCanonicalBallControl,
  stepTacticalMatchAfterDecisionProbe as step,
} from './matchSimulation';
import { restorePathologicalState } from './pathologicalReplay';
import { resolveReceptionOutcome } from './passReception';
import { PassLifecycleDiagnostics } from './passLifecycleDiagnostics';
import { withBoundedObserver } from './boundedIntelligence';
import { measureEffectivePlayingTime } from './effectivePlayingTime';
import { beginStoppage, endStoppage } from './stoppageLedger';

const fixture = () =>
  restorePathologicalState(
    JSON.parse(gunzipSync(readFileSync('docs/performance/pr189/baseline-20s.json.gz')).toString()),
  );
const contact = (skill: number, speed = 4) => {
  const s = fixture(),
    p = s.players.find((p) => p.id === s.ball.ownerId)!;
  for (const other of s.players) if (other.team !== p.team) other.position = { x: 100, y: 65 };
  for (const key of Object.keys(p.profile.attributes) as (keyof typeof p.profile.attributes)[])
    p.profile.attributes[key] = skill;
  p.profile.weakFootProficiency = skill;
  p.velocity = { x: 0, y: 0 };
  p.facingAngle = Math.PI;
  delete s.lastGroundContact;
  delete s.onBallPreparation;
  delete s.ballAcquisition;
  s.currentPressure = 0;
  s.ball = {
    x: p.position.x,
    y: p.position.y + 0.3,
    height: 0.11,
    velocity: { x: 0, y: speed, z: 0 },
    travelKind: 'pass',
  };
  s.receptionPreparation = {
    actorId: p.id,
    sourceActorId: 'passer',
    releasedAt: s.time - 1,
    awarenessAt: s.time - 1,
    expectedContactPoint: { ...p.position },
    expectedArrivalTime: s.time,
    movement: 'wait',
    ballEpisode: 'pr190',
    readiness: {
      contactPoint: { ...p.position },
      awareAt: 0,
      readyAt: 0,
      earliestUsefulContactTime: 0,
      preferredArrivalSpeed: 4,
      maximumComfortableArrivalSpeed: 8,
      preparationMargin: 1,
      movementTime: 0,
      orientationTime: 0,
    },
  };
  return { s, p };
};
describe('PR190 physical reception and passive measurement', () => {
  it.each([40, 80])(
    'allows skill %s to cushion a reachable ordinary pass with the actual impulse',
    (skill) => {
      const { s, p } = contact(skill),
        before = JSON.stringify(s),
        outcome = resolveReceptionOutcome(s, p, s.ball);
      expect(outcome.kind).toBe('clean_control');
      expect(outcome.surfaceContact?.available).toBe(true);
      expect(outcome.surfaceContact?.retained).toBe(true);
      expect(JSON.stringify(s)).toBe(before);
      const next = applyCanonicalBallControl(s, p.id);
      expect(next.ball.ownerId).toBe(p.id);
      expect(next.ball.x).toBe(s.ball.x);
      expect(next.ball.y).toBe(s.ball.y);
      expect(next.ball.velocity).toEqual(outcome.surfaceContact!.outgoingVelocity);
      expect(next.lastGroundContact?.surfaceContact).toEqual(outcome.surfaceContact);
      if (skill === 40) expect(outcome.quality!.score).toBeLessThan(0.55);
    },
  );
  it('leaves an excessive incoming impulse loose, without a possession award or a position jump', () => {
    const { s, p } = contact(40, 30);
    s.ball.spin = { x: 7, y: -11, z: 4 };
    const outcome = resolveReceptionOutcome(s, p, s.ball),
      next = applyCanonicalBallControl(s, p.id);
    expect(outcome.kind).toBe('failed_control');
    expect(outcome.surfaceContact?.retained).toBe(false);
    expect(next.ball.ownerId).toBeUndefined();
    expect(next.ball.x).toBe(s.ball.x);
    expect(next.ball.y).toBe(s.ball.y);
    expect(next.ball.velocity?.y).toBeCloseTo(outcome.surfaceContact!.outgoingVelocity.y);
    expect(next.ball.spin).toEqual(outcome.surfaceContact!.outgoingSpin);
    expect(next.ball.height).toBe(s.ball.height);
    expect(next.ball.velocity!.y).toBeGreaterThan(4.8);
  });
  it('does not manufacture control beyond real foot reach or above the foot envelope', () => {
    const { s, p } = contact(80);
    s.ball.x += 5;
    expect(applyCanonicalBallControl(s, p.id)).toBe(s);
    s.ball.x -= 5;
    s.ball.height = 1.2;
    expect(applyCanonicalBallControl(s, p.id)).toBe(s);
  });
  it('replays identical full states with decision and pass observers enabled or disabled', () => {
    const run = (observed: boolean) => {
      let s = fixture();
      const d = new PassLifecycleDiagnostics();
      return withBoundedObserver(observed ? (t) => d.trace(t) : undefined, () => {
        for (let i = 0; i < 320; i++) {
          const previous = s;
          s = step(s, 0.025);
          if (observed) d.observe(previous, s);
        }
        return { s, records: observed ? d.snapshot() : [] };
      });
    };
    const a = run(true),
      b = run(true),
      bare = run(false);
    expect(a).toEqual(b);
    expect(a.s).toEqual(bare.s);
    expect(a.records.length).toBeGreaterThan(0);
  });
  it('counts the entire restart and partitions overlapping reasons without adding human pauses', () => {
    let s = fixture();
    s.time = 0;
    delete s.stoppageLedger;
    delete s.timekeeping;
    s = beginStoppage(s, 'throw', 'throw_in');
    s.time = 10;
    s = beginStoppage(s, 'injury', 'injury');
    s.time = 15;
    s = endStoppage(s);
    s.time = 60;
    const report = measureEffectivePlayingTime(s, 123);
    expect(report.deadBallSeconds).toBe(15);
    expect(report.ballInPlaySeconds).toBe(45);
    expect(report.deadBallByReason).toEqual({ throw_in: 10, injury: 5 });
    expect(report.humanDecisionPauseSeconds).toBe(123);
    expect(report.addedSecondsActuallyPlayed).toBe(0);
  });
  it('reports archived ledger duration even when the bounded interval list has evicted old entries', () => {
    const s = fixture();
    s.time = 600;
    s.stoppageLedger = { intervals: [], completedSeconds: 150, completedCount: 600 };
    delete s.timekeeping;
    expect(measureEffectivePlayingTime(s).unclassifiedDeadBallSeconds).toBe(150);
    expect(measureEffectivePlayingTime(s).ballInPlaySeconds).toBe(450);
  });
});
