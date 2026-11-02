import {
  BALL_RADIUS,
  PASSIVE_OUTFIELD_BODY,
  findFirstBallContact,
  resolveBallRebound,
  type ContactCandidate,
} from '../src/core/matchSimulation/ballFlight';
import { integrateBallFlight, type PhysicalBall } from '../src/core/matchSimulation/ballPhysics';
import {
  ballBodyClearance,
  supportContinuousBodyContacts,
  retainContinuousBodyContacts,
} from '../src/core/matchSimulation/ballContactResolution';
import { PLAYER_BODY_CONTACT } from '../src/core/matchSimulation/playerBodyContact';

/** Geometry apparatus over the existing spherical passive representation. This
 * is an upper-body support experiment, never a low leg/ankle entrapment claim. */
export const runPr215Clinch = () => {
  const { radius, centreHeight } = PASSIVE_OUTFIELD_BODY;
  const expanded = radius + BALL_RADIUS;
  const halfSeparation = 0.5;
  const height = centreHeight + Math.sqrt(expanded ** 2 - halfSeparation ** 2);
  const bodies: ContactCandidate[] = [-1, 1].map((side, i) => ({
    kind: 'defender',
    playerId: `support-${i}`,
    radius,
    centre: { x: 30 + side * halfSeparation, y: 34, z: centreHeight },
  }));
  let ball: PhysicalBall = {
    position: { x: 30, y: 34, z: height },
    velocity: { x: 0, y: 0, z: 0 },
    airborne: true,
    bounceCount: 0,
  };
  const initial = structuredClone(ball);
  const frames = [structuredClone(ball)];
  for (let i = 0; i < 8; i++) {
    const free = integrateBallFlight(ball, 0.025, {
      rollingResistanceMultiplier: 1,
      groundContact: 'event-v1',
    });
    const supported = supportContinuousBodyContacts(free.position, free.velocity, bodies, 0.025);
    ball = { ...free, ...supported };
    frames.push(structuredClone(ball));
  }
  // The third upright player approaches with a real, non-overlapping body path.
  const third: ContactCandidate = {
    kind: 'defender',
    playerId: 'intervening-body',
    radius,
    previousCentre: { x: 30, y: 33.44, z: centreHeight },
    centre: { x: 30, y: 33.52, z: centreHeight },
  };
  const contact = findFirstBallContact({
    previous: ball.position,
    next: ball.position,
    attackingTeam: { team: 'home' },
    candidates: [third],
  });
  if (!contact?.surfaceNormal) throw new Error('No admissible third-body contact');
  const surfaceVelocity = { x: 0, y: (third.centre.y - third.previousCentre!.y) / 0.025, z: 0 };
  const rebound = resolveBallRebound(contact.kind, ball.velocity, { team: 'home' }, ball.spin, {
    point: contact.point,
    surfaceNormal: contact.surfaceNormal,
    surfaceVelocity,
  });
  const atImpulse = structuredClone(ball);
  ball = { ...ball, velocity: rebound.velocity, ...(rebound.spin ? { spin: rebound.spin } : {}) };
  const escaped = [];
  for (let i = 0; i < 8; i++) {
    ball = integrateBallFlight(ball, 0.025, {
      rollingResistanceMultiplier: 1,
      groundContact: 'event-v1',
    });
    escaped.push(structuredClone(ball));
  }
  return {
    representation: 'existing-upper-passive-spheres' as const,
    torsoDiameter: PLAYER_BODY_CONTACT.diameter,
    ballRadius: BALL_RADIUS,
    bodies,
    third,
    minimumThirdTorsoSeparation: Math.hypot(halfSeparation, 34 - third.centre.y),
    groundTwoSurfaceMaximumSeparation:
      2 * Math.sqrt(expanded ** 2 - (centreHeight - BALL_RADIUS) ** 2),
    initial,
    frames,
    atImpulse,
    contact,
    surfaceVelocity,
    outgoing: rebound.velocity,
    escaped,
    terminal: ball,
    supportClearances: bodies.map((b) => ballBodyClearance(frames.at(-1)!.position, b)),
    retained: retainContinuousBodyContacts(
      frames.at(-1)!.position,
      bodies,
      bodies.map((b) => b.playerId),
    ),
    afterEscape: retainContinuousBodyContacts(
      ball.position,
      [...bodies, third],
      [...bodies, third].map((b) => b.playerId),
    ),
    ownershipAwarded: false,
    refereeInterruption: false,
  };
};
