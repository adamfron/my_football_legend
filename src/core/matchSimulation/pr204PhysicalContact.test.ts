import { describe, expect, it } from 'vitest';
import { createProspectiveFixture } from './prospectivePlayLaboratory';
import { applyCanonicalBallControl } from './matchSimulation';

// These are deliberately controlled finite contacts. The integration path still
// owns whether a player reaches the ball in a real episode.
const contact = (role: 'team' | 'opponent' | 'keeper', kind: 'pass' | 'cross' | 'loose', speed = 6) => {
  const f = createProspectiveFixture({ seed: 'pr204-contact-equivalence' });
  const state = structuredClone(f.state);
  state.prospectiveMovement = 'two-pass-continuity-dev-v1';
  state.experimentalDefensiveReception = true;
  delete state.integrationProfile;
  delete state.receptionPreparation;
  delete state.offsideSnapshot;
  delete state.pendingReceptionIntent;
  delete state.playerMovementIntent;
  delete state.ballCarrierIntent;
  delete state.restart;
  delete state.postGoal;
  const actor = role === 'team'
    ? state.players.find((player) => player.id === f.c.id)!
    : role === 'opponent'
      ? state.players.find((player) => player.id === f.opponent.id)!
      : state.players.find((player) => player.team === f.c.team && player.slot.position === 'goalkeeper')!;
  actor.profile.attributes.firstTouch = 20;
  state.ball = {
    x: actor.position.x, y: actor.position.y, height: 0.11,
    velocity: { x: speed, y: 1, z: 0 }, spin: { x: 0, y: 0, z: 0 },
    lastTouchPlayerId: f.a.id, looseSince: state.time - 0.1,
    ...(kind === 'loose' ? {} : { travelKind: kind }),
  };
  return { state, actor };
};

const physical = (state: ReturnType<typeof contact>['state']) => ({
  ball: state.ball,
  outcome: state.lastReceptionOutcome,
  contact: state.lastGroundContact,
});

describe('PR204 physical control independent of delivery label', () => {
  it.each([6, 18, 30])('uses the same finite foot contact for pass, cross and loose at %s m/s', (speed) => {
    const results = (['pass', 'cross', 'loose'] as const).map((kind) => {
      const f = contact('team', kind, speed);
      return applyCanonicalBallControl(f.state, f.actor.id);
    });
    expect(results[0]!.lastGroundContact?.executed).toBe(true);
    expect(physical(results[1]!)).toEqual(physical(results[0]!));
    expect(physical(results[2]!)).toEqual(physical(results[0]!));
    if (speed >= 18) expect(results[0]!.ball.ownerId).toBeUndefined();
  });

  it('does not manufacture a contact above playable foot height or outside reach', () => {
    const high = contact('team', 'loose');
    high.state.ball.height = 1.15;
    expect(applyCanonicalBallControl(high.state, high.actor.id)).toEqual(high.state);
    const distant = contact('team', 'loose');
    distant.state.ball.x += 5;
    expect(applyCanonicalBallControl(distant.state, distant.actor.id)).toEqual(distant.state);
  });

  it.each(['opponent', 'keeper'] as const)('preserves historical %s physical control', (role) => {
    for (const kind of ['pass', 'cross', 'loose'] as const) {
      for (const speed of [6, 18, 30]) {
        const f = contact(role, kind, speed);
        const historical = structuredClone(f.state);
        historical.prospectiveMovement = 'two-pass-v1';
        expect(physical(applyCanonicalBallControl(f.state, f.actor.id))).toEqual(
          physical(applyCanonicalBallControl(historical, f.actor.id)),
        );
      }
    }
  });
});
