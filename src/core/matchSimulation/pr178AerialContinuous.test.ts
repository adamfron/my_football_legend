// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { activeAerialContactLocks, findAerialContactCandidates } from './aerialPlay';
import { createReformFixture } from '../../../scripts/pr177Fixtures';
import type { TacticalMatchState } from './matchState';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';

const continuousFixture = () => {
  const f = createReformFixture('corner-counter');
  f.actor.position = { x: 20, y: 34 };
  f.state.ball = { x: 20.7, y: 34, height: 1.7, velocity: { x: 4, y: 0, z: 0 } };
  f.state.aerialContactLocks = [{ playerId: f.actor.id, point: { x: 17.5, y: 34 }, at: 29 }];
  return f;
};

describe('PR178 relative aerial contact continuity', () => {
  it('does not re-arm a moving continuous contact after 2.4 world metres', () => {
    const { state, actor } = continuousFixture();
    expect(activeAerialContactLocks(state).map((lock) => lock.playerId)).toContain(actor.id);
    expect(findAerialContactCandidates(state).map((entry) => entry.player.id)).not.toContain(
      actor.id,
    );
  });
  it('preserves a nearby different player and ignores turning as a re-arm event', () => {
    const { state, actor, runner } = continuousFixture();
    runner.position = { x: 20.7, y: 34.3 };
    runner.velocity = { x: 0, y: 0 };
    actor.facingAngle += Math.PI;
    expect(activeAerialContactLocks(state).map((lock) => lock.playerId)).toContain(actor.id);
    expect(findAerialContactCandidates(state).map((entry) => entry.player.id)).toContain(runner.id);
  });
  it('allows the same player again after actual horizontal separation', () => {
    const { state, actor } = continuousFixture();
    state.ball.x = 23;
    state.aerialContactLocks = activeAerialContactLocks(state);
    expect(state.aerialContactLocks).toEqual([]);
    state.ball.x = 20.7;
    expect(findAerialContactCandidates(state).map((entry) => entry.player.id)).toContain(actor.id);
  });
  it('allows a genuine later return after vertical separation', () => {
    const { state, actor } = continuousFixture();
    state.ball.height = 4;
    state.aerialContactLocks = activeAerialContactLocks(state);
    state.ball.height = 1.7;
    expect(findAerialContactCandidates(state).map((entry) => entry.player.id)).toContain(actor.id);
  });
  it('does not independently head the same continuous corner-counter ball twice', () => {
    // Freeze the actual historical pre-header geometry. PR180 intentionally changes
    // earlier ground contacts, so recreating a whole corner no longer reaches this duel.
    let state: TacticalMatchState = JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr180-evidence/pr178-corner-pre-header.json.gz'),
      ).toString(),
    ).state;
    let first = false,
      separated = false;
    while (state.time < 52) {
      const before = state;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      const actor = state.players.find((p) => p.id === 'geometry:anchor:7')!;
      const contact = state.lastAerialContact;
      const newHeader =
        contact?.id !== before.lastAerialContact?.id && contact?.winnerId === actor.id;
      if (first && !separated && newHeader)
        throw new Error('Second independent header before relative separation');
      if (newHeader) first = true;
      if (
        first &&
        (Math.hypot(actor.position.x - state.ball.x, actor.position.y - state.ball.y) >= 1.6 ||
          (state.ball.height ?? 0) <= 0.45 ||
          (state.ball.height ?? 0) >= actor.profile.heightCm / 100 + 0.55)
      )
        separated = true;
    }
    expect(first).toBe(true);
    expect(separated).toBe(true);
  });
});
