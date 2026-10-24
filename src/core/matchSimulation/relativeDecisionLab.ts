import { z } from 'zod';
import { createCognitionFixture } from './tacticalCognitionLab';
import { playerContactGeometry } from './ballContactGeometry';
import { boundedExperimentSchema, boundedPolicySchema } from './boundedIntelligenceState';
import { resolveMatchAction } from './matchActions';

export const relativeTrialSchema = z.object({
  seed: z.string(),
  skill: z.number().min(1).max(100),
  opposition: z.number().min(1).max(100),
  policy: boundedPolicySchema,
  situation: z.enum([
    'safe',
    'approaching',
    'arrived',
    'outlet',
    'blocked',
    'exposed',
    'passive',
    'delay',
  ]),
  reversed: z.boolean().default(false),
});
/** Reconstructed apparatus, NOT a replay of the unavailable human session exports.
 * Placement is an initial condition. Subsequent movement/contact uses the match engine.
 */
export const createRelativeTrial = (raw: z.input<typeof relativeTrialSchema>) => {
  const c = relativeTrialSchema.parse(raw);
  const f = createCognitionFixture('press_triangle', c.seed);
  const s = f.state;
  s.decisionPolicy = c.policy;
  s.boundedExperiment = boundedExperimentSchema.parse({
    knowledge: { system: 0.65, role: 0.6, partner: 0.55 },
  });
  const actor = s.players.find((p) => p.id === f.sourceId)!;
  const foes = s.players.filter((p) => p.team !== actor.team && p.slot.position !== 'goalkeeper');
  for (const p of s.players) {
    p.profile = structuredClone(p.profile);
    for (const k of Object.keys(p.profile.attributes) as (keyof typeof p.profile.attributes)[])
      p.profile.attributes[k] = p.team === actor.team ? c.skill : c.opposition;
    p.velocity = { x: 0, y: 0 };
  }
  actor.position = { x: 58, y: 34 };
  actor.facingAngle = Math.PI / 2;
  s.players.find((p) => p.id === f.runnerIds[0])!.position = { x: 57, y: 42 };
  s.players.find((p) => p.id === f.runnerIds[1])!.position = { x: 67, y: 30 };
  foes[0]!.position = { x: 56.6, y: 34 };
  foes[1]!.position =
    c.situation === 'safe'
      ? { x: 75, y: 45 }
      : {
          x:
            c.situation === 'arrived' || c.situation === 'exposed' || c.situation === 'passive'
              ? 59.4
              : 63,
          y: 34.5,
        };
  foes[1]!.velocity =
    c.situation === 'approaching' || c.situation === 'outlet' ? { x: -2.5, y: 0 } : { x: 0, y: 0 };
  foes[2]!.position = { x: 68, y: 33 };
  if (c.situation === 'blocked') foes[2]!.position = { x: 57.5, y: 38 };
  if (c.situation === 'delay') {
    actor.position = { x: 72, y: 12 };
    actor.velocity = { x: 3, y: 0 };
    foes[0]!.position = { x: 75, y: 12 };
    foes[1]!.position = { x: 90, y: 45 };
    foes[2]!.position = { x: 89, y: 45 };
  }
  for (const p of s.players)
    p.target = p.anchor = p.neutralAnchor = p.idealTarget = { ...p.position };
  s.ball = {
    ...playerContactGeometry(actor).rightFoot,
    ownerId: actor.id,
    height: 0.11,
    lastTouchPlayerId: actor.id,
  };
  if (c.situation === 'exposed') s.ball.x += 1.1;
  s.onBallPreparation = {
    actorId: actor.id,
    gainedAt: 8,
    readyAt: 9,
    kind: 'immediate_control',
    incomingSpeed: 0,
  };
  if (c.reversed) {
    for (const p of s.players) {
      p.position = { x: 105 - p.position.x, y: 68 - p.position.y };
      p.target = p.anchor = p.neutralAnchor = p.idealTarget = { ...p.position };
      p.velocity = { x: -p.velocity.x, y: -p.velocity.y };
      p.facingAngle += Math.PI;
    }
    s.endsSwitched = true;
    s.ball.x = 105 - s.ball.x;
    s.ball.y = 68 - s.ball.y;
  }
  let trialState = s;
  if (c.situation === 'passive') {
    // Human retain owns this possession, independently of an action cooldown.
    // Opponents and all movement/contact resolution remain autonomous.
    s.playerAgencyEnabled = true;
    s.controlledFootballerId = actor.id;
    trialState = resolveMatchAction(
      s,
      { type: 'carry', actorId: actor.id, target: { ...actor.position }, movementMode: 'retain' },
      'human_selected',
    );
  }
  return {
    state: trialState,
    actorId: actor.id,
    defenderIds: foes.slice(0, 3).map((p) => p.id),
    config: c,
  };
};
