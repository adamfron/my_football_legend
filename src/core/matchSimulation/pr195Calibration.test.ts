import { describe, it, expect } from 'vitest';
import {
  createCalibrationFixture,
  runCalibrationTrial,
  captureCalibrationSnapshot,
} from './assumptionCalibration';
import { scoreCalibration } from './calibrationMetrics';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';

describe('PR195 calibration measurement contract', () => {
  it('matches a bare canonical continuation and isolates mutating observers', () => {
    const f = createCalibrationFixture({ scenario: 'safe_pass', seed: 'pr195-test-neutral' }),
      before = structuredClone(f.state);
    const result = runCalibrationTrial(f.state, f.action, f.receiverId, f.defenderId, 1, (o) => {
      o.ownerId = 'fake';
      o.ball.x = -900;
    });
    let bare = resolveMatchAction(structuredClone(f.state), f.action, 'autonomous_npc');
    for (let i = 0; i < 40; i++) bare = step(bare, 0.025);
    expect(result.final).toEqual(bare);
    expect(f.state).toEqual(before);
    expect(result.released).toBe(true);
    expect(result.selection).toBe('forced_experiment');
    expect(result.observations.every((o) => o.ball.x !== -900)).toBe(true);
  });
  it('keeps hidden opposing attributes out of bounded evidence and decisions', () => {
    const f = createCalibrationFixture({ scenario: 'moving_defender' }),
      other = structuredClone(f.state);
    for (const p of other.players.filter((p) => p.team === 'away'))
      for (const k of Object.keys(p.profile.attributes) as (keyof typeof p.profile.attributes)[])
        p.profile.attributes[k] = 20;
    const a = captureCalibrationSnapshot(f.state, f.actorId),
      b = captureCalibrationSnapshot(other, f.actorId);
    expect(a.scene).toEqual(b.scene);
    expect(a.candidates).toEqual(b.candidates);
    expect(a.boundedDecisions).toEqual(b.boundedDecisions);
  });
  it('rejects a remote high ball without inventing a substitute successful contact', () => {
    const f = createCalibrationFixture({ scenario: 'infeasible_contact' }),
      result = runCalibrationTrial(f.state, f.action, f.receiverId, f.defenderId, 0.1);
    expect(result.contactPossibleAtRequest).toBe(false);
    expect(result.snapshot.canonicalShots).toEqual([]);
    expect(result.released).toBe(false);
    expect(result.observations[1]!.ball).toEqual(result.observations[0]!.ball);
  });
  it('repeats difficult incoming trials deterministically, including failed requests', () => {
    const f = createCalibrationFixture({
      scenario: 'incoming_difficult',
      seed: 'pr195-test-incoming',
    });
    const a = runCalibrationTrial(f.state, f.action, f.receiverId, f.defenderId, 0.5),
      b = runCalibrationTrial(f.state, f.action, f.receiverId, f.defenderId, 0.5);
    expect(a).toEqual(b);
  });
  it('scores probability errors and empty samples with explicit conventions', () => {
    const r = scoreCalibration([
      { probability: 0.75, outcome: true },
      { probability: 0.25, outcome: false },
    ]);
    expect(r.brier).toBe(0.0625);
    expect(r.bias).toBe(0);
    expect(r.clippedLogLoss).toBeCloseTo(-Math.log(0.75));
    expect(r.bins.reduce((n, b) => n + b.count, 0)).toBe(2);
    expect(scoreCalibration([]).wilson95).toBeNull();
    expect(scoreCalibration([{ probability: 1, outcome: false }]).clippedLogLoss).toBeCloseTo(
      -Math.log(1e-12),
    );
    expect(() => scoreCalibration([{ probability: 1.1, outcome: true }])).toThrow();
  });
});
