import { z } from 'zod';
import { createTransitionFixture } from './transitionLaboratory';
import { withIntegrationProfile, integrationProfileIdSchema } from './integrationProfile';
import { angleForVector } from './playerOrientation';

export const prospectiveFixtureConfigSchema = z.object({
  seed: z.string(),
  reading: z.number().min(1).max(100).default(80),
  profile: integrationProfileIdSchema.default('prospective-play-v1'),
  role: z.enum(['striker', 'left_winger', 'central_midfielder', 'center_back']).default('striker'),
});

/** Development apparatus only. All later movement/release/contact uses MatchEngine. */
export const createProspectiveFixture = (input: z.input<typeof prospectiveFixtureConfigSchema>) => {
  const config = prospectiveFixtureConfigSchema.parse(input);
  const f = createTransitionFixture({
    id: 'pr203',
    seed: config.seed,
    scenario: 'counterattack',
    transitions: false,
    clearances: false,
    attacker: 70,
    defender: 55,
  });
  const state = withIntegrationProfile(f.state, config.profile, 'opportunity-driven-v1');
  const a = state.players.find((p) => p.id === f.carrierId)!;
  const b = state.players.find((p) => p.id === f.supportId)!;
  const c = state.players.find((p) => p.id === f.runnerId)!;
  const opponent = state.players.find(
    (p) => p.team !== a.team && p.slot.position !== 'goalkeeper',
  )!;
  // Keep unused players outside the detailed scene, retaining the full roster.
  for (const p of state.players) {
    p.position = {
      x: p.team === a.team ? 8 + p.slotIndex : 92 + p.slotIndex * 0.2,
      y: 3 + p.slotIndex * 5,
    };
    p.velocity = { x: 0, y: 0 };
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
  }
  a.position = { x: 40, y: 34 };
  b.position = { x: 52, y: 30 };
  c.position = { x: 62, y: 38 };
  opponent.position = { x: 60.5, y: 38.5 };
  for (const p of [a, b, c, opponent]) {
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  }
  c.slot = { ...c.slot, position: config.role };
  c.duty = config.role === 'center_back' ? 'defend' : 'support';
  c.profile.attributes.gameReading = config.reading;
  // Reading is the only skill intervention; pace/technical attributes remain paired.
  c.facingAngle = angleForVector({
    x: a.position.x - c.position.x,
    y: a.position.y - c.position.y,
  });
  a.facingAngle = angleForVector({
    x: b.position.x - a.position.x,
    y: b.position.y - a.position.y,
  });
  b.facingAngle = angleForVector({
    x: c.position.x - b.position.x,
    y: c.position.y - b.position.y,
  });
  state.ball = {
    x: a.position.x + 0.65,
    y: a.position.y,
    height: 0.11,
    ownerId: a.id,
    velocity: { x: 0, y: 0, z: 0 },
  };
  state.possessionTeam = a.team;
  state.playerAgencyEnabled = true;
  state.controlledFootballerId = a.id;
  delete state.receptionPreparation;
  delete state.onBallPreparation;
  delete state.ballCarrierIntent;
  return { state, a, b, c, opponent };
};
