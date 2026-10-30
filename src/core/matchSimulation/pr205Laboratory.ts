import { createProspectiveFixture } from './prospectivePlayLaboratory';
import { acquireFlightSighting } from './ballFlightBelief';
import type { TacticalMatchState } from './matchState';

/** Deterministic development apparatus; no application imports this module. */
export const createPr205Fixture = (role: 'team' | 'opponent' | 'keeper' = 'team', speed = 6) => {
  const f = createProspectiveFixture({ seed: 'pr205-contact-parity' });
  const s = structuredClone(f.state);
  s.prospectiveMovement = 'two-pass-continuity-dev-v1';
  s.experimentalDefensiveReception = true;
  delete s.experimentalBodyContacts;
  delete s.integrationProfile;
  for (const key of [
    'receptionPreparation',
    'offsideSnapshot',
    'pendingReceptionIntent',
    'playerMovementIntent',
    'ballCarrierIntent',
    'defensiveChallenge',
    'combinationIntent',
    'onBallPreparation',
    'restart',
    'postGoal',
  ] as const)
    delete s[key];
  s.experimentalTransitionIntelligence = false;
  delete s.nearestChallengerId;
  s.playerAgencyEnabled = false;
  const actor = s.players.find((p) =>
    role === 'team'
      ? p.id === f.c.id
      : role === 'opponent'
        ? p.id === f.opponent.id
        : p.team === f.c.team && p.slot.position === 'goalkeeper',
  )!;
  for (const p of s.players) {
    p.position = { x: p.team === actor.team ? 5 : 100, y: 2 + p.slotIndex * 5 };
    p.velocity = { x: 0, y: 0 };
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
    delete p.spatialMovement;
    delete p.transitionMark;
    delete p.ballMotorObservation;
  }
  actor.position = { x: 50, y: 34 };
  actor.target = { ...actor.position };
  actor.anchor = { ...actor.position };
  actor.neutralAnchor = { ...actor.position };
  actor.facingAngle = -Math.PI / 2;
  actor.profile.attributes.firstTouch = 20;
  s.ball = {
    x: 50,
    y: 34,
    height: 0.11,
    velocity: { x: speed, y: 1, z: 0 },
    spin: { x: 0, y: 0, z: 2 },
    lastTouchPlayerId: f.a.id,
    looseSince: s.time - 0.1,
    from: { x: 40, y: 34 },
    target: { x: 70, y: 34 },
    travelKind: 'pass',
  };
  return { state: s, actor, passerId: f.a.id };
};

/** Realistic observation format, deliberately assigned laboratory evidence. */
export const sightPr205Ball = (
  state: TacticalMatchState,
  actorId: string,
  point = { x: 54, y: 34, z: 0.11 },
  velocity = { x: 1, y: 0, z: 0 },
) => {
  const observation = {
    at: state.time,
    position: point,
    positionError: 0.02,
    motion: {
      since: state.time - 0.1,
      from: {
        x: point.x - velocity.x * 0.1,
        y: point.y - velocity.y * 0.1,
        z: point.z - velocity.z * 0.1,
      },
    },
  };
  state.liveBallFlightRuntime = {
    at: state.time,
    sensors: {
      [actorId]: {
        sampledAt: state.time,
        nextAcquisitionAt: state.time + 0.2,
        optical: observation,
        belief: acquireFlightSighting(undefined, observation, 80),
      },
    },
  };
};
