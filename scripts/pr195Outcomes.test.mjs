import { it, expect } from 'vitest';
import {
  createCalibrationFixture,
  runCalibrationTrial,
} from '../src/core/matchSimulation/assumptionCalibration.ts';
import { summariseTrial } from './pr195Outcomes.mjs';

it('does not turn inherited last-touch metadata into a new receiver contact', () => {
  const f = createCalibrationFixture({ scenario: 'incoming_difficult' }),
    r = runCalibrationTrial(f.state, f.action, f.receiverId, f.defenderId, 0.025);
  const observations = r.observations.map((o) => ({
    ...o,
    lastTouchPlayerId: f.receiverId,
    groundContact: null,
    flightContact: null,
  }));
  const summary = summariseTrial({ ...r, observations }, f.receiverId, f.defenderId);
  expect(summary.receiverTouchAt).toBeNull();
  observations.at(-1).lastTouchPlayerId = f.defenderId;
  const changed = summariseTrial({ ...r, observations }, f.receiverId, f.defenderId);
  expect(changed.defenderTouchAt).not.toBeNull();
});
it('censors an unresolved original delivery and does not credit a later goal to a rejected request', () => {
  const f = createCalibrationFixture({ scenario: 'safe_pass' }),
    r = runCalibrationTrial(f.state, f.action, f.receiverId, f.defenderId, 0.025);
  expect(summariseTrial(r, f.receiverId, f.defenderId).completion).toBeNull();
  const shot = {
    ...r,
    action: { type: 'shot', actorId: f.actorId, target: { x: 105, y: 34 }, intent: 'driven' },
    released: false,
  };
  shot.observations = shot.observations.map((o) => ({
    ...o,
    shotId: 'later-unrelated',
    shotOutcome: 'goal',
  }));
  const result = summariseTrial(shot, f.receiverId, f.defenderId);
  expect(result.goal).toBeNull();
  expect(result.shotId).toBeNull();
});
