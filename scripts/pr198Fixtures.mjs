import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
export const families = [
  'short_ground',
  'medium_ground',
  'progressive_ground',
  'through_ball',
  'long_ground',
  'long_lofted',
  'moving_lead',
  'cross_field',
  'first_time',
  'remote_contact',
  'high_contact',
];
/** Exact PR197 family inputs; no outcomes consulted when selecting cases. */
export const familyFixture = (family, skill, sample) => {
  const mirror = sample % 2 === 1;
  const seed = `pr197-${sample < 2 ? 'development' : 'evaluation'}-${Math.floor(sample / 2)}`;
  const f = createCalibrationFixture({
    scenario: family.includes('long')
      ? 'long_pass'
      : family === 'through_ball'
        ? 'through_ball'
        : 'safe_pass',
    attacker: skill,
    defender: 60,
    mirror,
    seed,
  });
  const actor = f.state.players.find((p) => p.id === f.actorId),
    r = f.state.players.find((p) => p.id === f.receiverId);
  const span = {
    short_ground: 7,
    medium_ground: 19,
    progressive_ground: 25,
    moving_lead: 25,
    cross_field: 40,
  }[family];
  if (span !== undefined) {
    r.position = {
      x: actor.position.x + span,
      y: family === 'cross_field' ? (mirror ? 58 : 10) : actor.position.y,
    };
    r.target = { ...r.position };
    r.anchor = { ...r.position };
    r.neutralAnchor = { ...r.position };
    f.action.target = { ...r.position };
  }
  f.action.delivery = family === 'long_lofted' || family === 'cross_field' ? 'lofted' : 'ground';
  f.action.intent =
    family === 'moving_lead'
      ? 'lead'
      : family === 'progressive_ground'
        ? 'progressive'
        : f.action.intent;
  if (family === 'moving_lead') r.velocity = { x: 4, y: mirror ? 2 : -2 };
  if (['first_time', 'remote_contact', 'high_contact'].includes(family)) {
    delete f.state.ball.ownerId;
    f.state.ball.velocity = { x: 4, y: mirror ? -1 : 1, z: 0 };
    f.state.ball.travelKind = 'pass';
    f.state.ball.lastTouchPlayerId = r.id;
    f.action.firstTime = true;
    if (family === 'remote_contact') f.state.ball.x = actor.position.x + 4;
    if (family === 'high_contact') f.state.ball.height = 3.5;
  }
  return f;
};
