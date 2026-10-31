import { z } from 'zod';
import { createProspectiveFixture } from './prospectivePlayLaboratory';
import type { MatchAction } from './matchState';

export const kickLabConfigSchema = z.object({
  seed: z.string(),
  family: z.enum(['pass', 'shot']).default('pass'),
  metres: z.number().min(5).max(45).default(10),
  primary: z.number().min(1).max(100).default(70),
  technique: z.number().min(1).max(100).default(70),
  strength: z.number().min(1).max(100).default(70),
  context: z.enum(['open', 'moderate', 'immediate', 'hurried', 'first_time']).default('open'),
  delivery: z.enum(['ground', 'lofted']).default('ground'),
  intent: z.enum(['placed', 'driven']).default('placed'),
  experimental: z.boolean().default(true),
});

/** Scene setup only. Real releases and all subsequent contacts use the canonical executor. */
export const createKickFixture = (input: z.input<typeof kickLabConfigSchema>) => {
  const config = kickLabConfigSchema.parse(input);
  const {
    state,
    a: actor,
    b: receiver,
    opponent,
  } = createProspectiveFixture({ seed: config.seed });
  delete state.integrationProfile;
  delete state.prospectiveMovement;
  delete state.situationalAwareness;
  delete state.boundedReceiverRecovery;
  state.experimentalBoundedBallFlightBelief = false;
  state.experimentalReceiverAnticipation = false;
  state.decisionPolicy = 'state-value-v1';
  state.scenario = 'open_play';
  state.time = 10;
  state.actionCooldown = 0;
  delete state.restart;
  if (config.experimental) state.experimentalKickExecution = 'contact-v1';
  for (const p of state.players) {
    p.position = {
      x: p.team === actor.team ? 8 + p.slotIndex : 60 + p.slotIndex * 0.3,
      y: 3 + p.slotIndex * 5,
    };
    if (p.slot.position === 'goalkeeper')
      p.position = { x: p.team === actor.team ? 2 : 103, y: 34 };
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  }
  const from = config.family === 'shot' ? 105 - config.metres : 30;
  actor.position = { x: from - 0.6, y: 34 };
  actor.facingAngle = Math.PI / 2;
  actor.profile.attributes.passing = config.primary;
  actor.profile.attributes.finishing = config.primary;
  actor.profile.attributes.technique = config.technique;
  actor.profile.attributes.strength = config.strength;
  actor.profile.attributes.composure = 60;
  actor.profile.attributes.agility = 70;
  actor.plantBalance = { balance: 1, load: 0, support: 'both' };
  receiver.position = { x: from + config.metres, y: 34 };
  receiver.facingAngle = -Math.PI / 2;
  if (config.context === 'moderate' || config.context === 'immediate') {
    const separation = config.context === 'immediate' ? 1.1 : 6;
    opponent.position = { x: from, y: 34 + separation };
    opponent.velocity = { x: 0, y: -5 };
  }
  if (config.context === 'hurried') {
    actor.facingAngle += 1;
    actor.plantBalance.balance = 0.45;
    state.onBallPreparation = {
      actorId: actor.id,
      gainedAt: state.time - 0.04,
      readyAt: state.time,
      kind: 'settling',
      incomingSpeed: 4,
    };
  }
  for (const p of [actor, receiver, opponent]) {
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
  }
  state.ball = {
    x: from,
    y: 34,
    height: 0.11,
    ownerId: actor.id,
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
  };
  const firstTime = config.context === 'first_time';
  if (firstTime) {
    delete state.ball.ownerId;
    state.ball.travelKind = 'pass';
    state.ball.lastTouchPlayerId = receiver.id;
    state.ball.velocity = { x: 6, y: 1, z: 0 };
  }
  const action: MatchAction =
    config.family === 'shot'
      ? {
          type: 'shot',
          actorId: actor.id,
          target: { x: 105, y: 31 },
          intent: config.intent,
          contact: firstTime ? 'first_time' : 'settled',
          goalTarget: { horizontal: 0.8, vertical: 0.8 },
        }
      : {
          type: 'pass',
          actorId: actor.id,
          receiverId: receiver.id,
          target: { ...receiver.position },
          intent: 'support',
          delivery: config.delivery,
          ...(firstTime ? { firstTime: true } : {}),
        };
  return { state, actor, receiver, opponent, action, config };
};
