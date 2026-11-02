import { createPr214Scene } from './pr214Scenarios';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory';
import { withHolisticDevelopment } from '../src/core/matchSimulation/holisticDevelopment';
import { playerFootGeometry } from '../src/core/matchSimulation/footContact';

export const createPr215LooseScene = () => {
  const s = withHolisticDevelopment(createPr214Scene('line-three').initial);
  delete s.pendingStrike;
  delete s.defensiveChallenge;
  s.ball = {
    x: 30.74,
    y: 32.8,
    height: 0.11,
    velocity: { x: 0.5, y: 0, z: 0 },
    looseSince: s.time,
  };
  s.actionCooldown = 1;
  s.playerAgencyEnabled = false;
  return s;
};

/** Incoming rolling ball begins outside the real foot sphere; no initial penetration. */
export const createPr215ReceptionBlocker = () => {
  const f = createKickFixture({ seed: 'pr215-control' });
  const s = withHolisticDevelopment(f.state);
  delete s.controlledBallContact;
  s.playerAgencyEnabled = false;
  s.actionCooldown = 1;
  const a = s.players.find((p) => p.id === f.actor.id)!;
  const foot = playerFootGeometry(a).rightFoot;
  s.ball = {
    x: foot.x + 0.15,
    y: foot.y,
    height: 0.11,
    velocity: { x: -1, y: 0, z: 0 },
    looseSince: s.time,
  };
  return s;
};

/** Stationary-body apparatus using the same shared live interval and real ball. */
export const createPr215PassiveSupportScene = () => {
  const s = createPr215LooseScene();
  const actor = s.players.find((p) => p.team === 'home' && p.slot.position !== 'goalkeeper')!;
  actor.position = { x: 30, y: 40 };
  actor.velocity = { x: 0, y: 0 };
  s.ball = { x: 29.73, y: 40, height: 0.11, velocity: { x: 1, y: 0, z: 0 }, looseSince: s.time };
  return { initial: s, actorId: actor.id };
};
