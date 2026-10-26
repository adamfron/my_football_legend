import { z } from 'zod';
import { createTransitionFixture } from './transitionLaboratory';
import { advanceActivePerception } from './activePerception';
import { observeBoundedScene, boundedSceneSchema } from './boundedPerception';
import {
  preReceptionPlanSchema,
  tempoIntentionSchema,
  receivingPositionSchema,
} from './activePerceptionState';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import { commitHumanPossessionDecision } from './possessionAgency';
import { withBoundedObserver, boundedTraceSchema } from './boundedIntelligence';
import { tacticalMatchStateSchema, matchActionSchema, type MatchPlayerState } from './matchState';
import { playerContactGeometry, groundContactFactSchema } from './ballContactGeometry';
import { angleForVector } from './playerOrientation';
import { sampleTransition, transitionSampleSchema } from './transitionDiagnostics';
import { createMatchFitness } from './matchFitness';
import { runFitnessDrill } from './fitnessMicroLab';

export const perceptionLabConfigSchema = z.object({
  id: z.string(),
  seed: z.string().default('pr194-development-lab'),
  condition: z
    .enum([
      'prior_scan',
      'no_scan',
      'active_scan',
      'stale',
      'moved',
      'lane_closed',
      'urgent',
      'wrong_body',
      'moving',
      'fast',
      'far_side',
      'wide',
      'patient',
      'counter',
      'organised',
      'repeated_effort',
      'fatigued',
      'protecting',
      'chasing',
    ])
    .default('prior_scan'),
  attribute: z
    .enum([
      'gameReading',
      'concentration',
      'composure',
      'technique',
      'firstTouch',
      'agility',
      'leadership',
    ])
    .default('gameReading'),
  level: z.number().min(1).max(100).default(60),
  mirror: z.boolean().default(false),
  seconds: z.number().positive().max(30).default(8),
  perception: z.boolean().default(true),
  positions: z.boolean().default(true),
  tempo: z.boolean().default(true),
});
export type PerceptionLabConfig = z.infer<typeof perceptionLabConfigSchema>;
export const createPerceptionFixture = (raw: z.input<typeof perceptionLabConfigSchema>) => {
  const c = perceptionLabConfigSchema.parse(raw),
    f = createTransitionFixture({
      id: c.id,
      seed: c.seed,
      scenario: 'counterattack',
      transitions: true,
      clearances: true,
    });
  let s = f.state;
  s.experimentalActivePerception = c.perception;
  s.experimentalReceivingPositions = c.positions;
  s.experimentalTeamTempo = c.tempo;
  s.activePerceptionConfig = {
    scanning: c.condition === 'active_scan',
    memory: true,
    preparation: true,
  };
  const source = s.players.find((p) => p.id === f.carrierId)!,
    receiver = s.players.find((p) => p.id === f.supportId)!,
    support = s.players.find((p) => p.id === f.runnerId)!;
  const place = (p: MatchPlayerState, x: number, y: number, vx = 0, vy = 0) => {
    p.position = { x, y: c.mirror ? 68 - y : y };
    p.velocity = { x: vx, y: c.mirror ? -vy : vy };
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
  };
  for (const [i, p] of s.players.entries())
    place(p, p.team === 'home' ? 30 + (i % 3) : 80 + (i % 3), 5 + (i % 5) * 12);
  const y = c.condition === 'wide' ? 10 : 34;
  place(source, 42, y);
  place(receiver, 58, y);
  place(support, 67, y + 6, c.condition === 'moving' ? 2 : 0);
  place(s.players.find((p) => p.id === f.defenderId)!, 62, y - 4, -1);
  const foe = s.players.find((p) => p.team === 'away' && p.slot.position === 'central_midfielder')!;
  place(foe, 62, y + 6, -1);
  if (c.condition === 'urgent') place(foe, 59.5, y + 1, -3);
  if (c.condition === 'organised') place(foe, 64, y, -1);
  receiver.profile.attributes[c.attribute] = c.level;
  receiver.facingAngle = c.condition === 'wrong_body' ? Math.PI / 2 : -Math.PI / 2;
  source.facingAngle = Math.PI / 2;
  receiver.duty = 'support';
  support.duty = 'attack';
  s.teams.home.style = ['patient', 'counter', 'organised', 'fatigued', 'protecting'].includes(
    c.condition,
  )
    ? 'possession'
    : 'balanced';
  delete s.teams.home.tacticalPreferences;
  if (c.condition === 'fatigued')
    for (const p of s.players.filter((p) => p.team === 'home')) p.fitness = createMatchFitness(45);
  if (c.condition === 'repeated_effort')
    for (const p of s.players.filter((p) => p.team === 'home'))
      p.fitness = runFitnessDrill(p, 'repeated_sprints', 180).fitness!;
  if (c.condition === 'counter')
    for (const p of s.players.filter((p) => p.team === 'away' && /back/.test(p.slot.position)))
      place(p, p.slot.position === 'center_back' ? 63 : 40, p.position.y, -2);
  const historical = [
    'prior_scan',
    'stale',
    'moved',
    'lane_closed',
    'urgent',
    'wrong_body',
    'moving',
    'fast',
    'far_side',
    'wide',
  ].includes(c.condition);
  // A frozen initial history is acquired through the same permitted observer, with
  // its actual earlier view retained. Subsequent hidden movement never refreshes it.
  let history: ReturnType<typeof observeBoundedScene> | null = null;
  const start = s.time;
  if (historical && c.perception) {
    const facing = receiver.facingAngle;
    receiver.facingAngle = angleForVector({
      x: support.position.x - receiver.position.x,
      y: support.position.y - receiver.position.y,
    });
    s = {
      ...s,
      time: start - (['stale', 'moved', 'lane_closed'].includes(c.condition) ? 1.2 : 0.3),
    };
    s = advanceActivePerception(s);
    history = observeBoundedScene(s, receiver);
    receiver.facingAngle = facing;
    s.activePerceptionRuntime!.memory[receiver.id]!.gaze = facing;
    s = { ...s, time: start };
  }
  if (c.condition === 'moved') place(support, 70, y + 17, 0, 2);
  if (c.condition === 'lane_closed') place(foe, 63, y + 3, -2);
  if (c.condition === 'far_side') place(foe, 61, y - 1, -2);
  if (c.condition === 'chasing' || c.condition === 'protecting') {
    s = {
      ...s,
      time: 4800,
      status: 'second_half',
      score: {
        home: c.condition === 'protecting' ? 1 : 0,
        away: c.condition === 'chasing' ? 1 : 0,
      },
    };
    delete s.timekeeping;
    delete s.activePerceptionRuntime;
  }
  const feet = playerContactGeometry(source);
  s.ball = {
    ...feet.rightFoot,
    ownerId: source.id,
    lastTouchPlayerId: source.id,
    height: 0.11,
    velocity: { x: 0, y: 0, z: 0 },
  };
  s.ballOwnershipStartedAt = s.time - 1;
  s.onBallPreparation = {
    actorId: source.id,
    gainedAt: s.time - 1,
    readyAt: s.time - 0.5,
    kind: 'immediate_control',
    incomingSpeed: 0,
  };
  s.playerAgencyEnabled = true;
  s.controlledFootballerId = source.id;
  s = commitHumanPossessionDecision(s, { type: 'hold', actorId: source.id });
  tacticalMatchStateSchema.parse(s);
  return {
    state: s,
    config: c,
    sourceId: source.id,
    receiverId: receiver.id,
    supportId: support.id,
    history,
  };
};
export const perceptionSampleSchema = transitionSampleSchema.extend({
  scene: boundedSceneSchema,
  plan: preReceptionPlanSchema.nullable(),
  position: receivingPositionSchema.nullable(),
  tempo: tempoIntentionSchema.nullable(),
  fitness: z.object({ capacity: z.number(), burst: z.number(), exertion: z.number() }).nullable(),
});
export const perceptionLabResultSchema = z.object({
  config: perceptionLabConfigSchema,
  initial: tacticalMatchStateSchema,
  final: tacticalMatchStateSchema,
  receiverId: z.string(),
  supportId: z.string(),
  history: boundedSceneSchema.nullable(),
  samples: perceptionSampleSchema.array().max(302),
  traces: boundedTraceSchema.array().max(128),
  contacts: groundContactFactSchema.array().max(96),
  actions: matchActionSchema.array().max(128),
  deliveryAt: z.number().nullable(),
  receiverContactAt: z.number().nullable(),
  receiverActionAt: z.number().nullable(),
});
export type PerceptionLabResult = z.infer<typeof perceptionLabResultSchema>;
export const runPerceptionLab = (
  raw: z.input<typeof perceptionLabConfigSchema>,
  observer?: (sample: z.infer<typeof perceptionSampleSchema>) => void,
): PerceptionLabResult => {
  const f = createPerceptionFixture(raw),
    c = f.config,
    initial = structuredClone(f.state),
    start = initial.time;
  let s = f.state,
    deliveryAt: number | null = null,
    receiverContactAt: number | null = null,
    receiverActionAt: number | null = null;
  const samples: z.infer<typeof perceptionSampleSchema>[] = [],
    traces: z.infer<typeof boundedTraceSchema>[] = [],
    contacts: z.infer<typeof groundContactFactSchema>[] = [],
    actions: z.infer<typeof matchActionSchema>[] = [];
  const record = () => {
    const p = s.players.find((p) => p.id === f.receiverId)!;
    const sample = {
      ...sampleTransition(s),
      scene: observeBoundedScene(s, p),
      plan: structuredClone(s.activePerceptionRuntime?.plans[p.id] ?? null),
      position: structuredClone(s.activePerceptionRuntime?.positions[p.id] ?? null),
      tempo: structuredClone(s.activePerceptionRuntime?.tempo[p.id] ?? null),
      fitness: p.fitness
        ? {
            capacity: p.fitness.longTermCapacity,
            burst: p.fitness.burstReadiness,
            exertion: p.fitness.exertionSpent,
          }
        : null,
    };
    samples.push(sample);
    observer?.(structuredClone(sample));
  };
  record();
  withBoundedObserver(
    (t) => {
      if (traces.length < 128) traces.push(structuredClone(t));
    },
    () => {
      let attempted = false;
      for (let tick = 0; tick < Math.round(c.seconds / 0.025); tick++) {
        if (!attempted && s.time - start >= (c.condition === 'active_scan' ? 0.9 : 0.15) - 1e-8) {
          const receiver = s.players.find((p) => p.id === f.receiverId)!;
          const next = resolveMatchAction(
            s,
            {
              type: 'pass',
              actorId: f.sourceId,
              receiverId: receiver.id,
              target: { ...receiver.position },
              intent: c.condition === 'fast' ? 'direct' : 'support',
              delivery: 'ground',
            },
            'human_selected',
          );
          if (next.lastPassDiagnostic?.passId !== s.lastPassDiagnostic?.passId)
            deliveryAt = next.time;
          s = { ...next, playerAgencyEnabled: false };
          attempted = true;
        }
        const before = s;
        s = step(s, 0.025);
        if (
          s.lastGroundContact &&
          s.lastGroundContact.at !== before.lastGroundContact?.at &&
          contacts.length < 96
        ) {
          contacts.push(structuredClone(s.lastGroundContact));
          if (
            s.lastGroundContact.actorId === f.receiverId &&
            s.lastGroundContact.executed &&
            receiverContactAt === null
          )
            receiverContactAt = s.lastGroundContact.at;
        }
        if (s.decisionIndex !== before.decisionIndex && s.latestAction && actions.length < 128) {
          actions.push(structuredClone(s.latestAction));
          if (s.latestAction.actorId === f.receiverId && receiverActionAt === null)
            receiverActionAt = s.time;
        }
        if (tick % 4 === 3) record();
        if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status ?? '')) break;
      }
    },
  );
  return perceptionLabResultSchema.parse({
    config: c,
    initial,
    final: s,
    receiverId: f.receiverId,
    supportId: f.supportId,
    history: f.history,
    samples,
    traces,
    contacts,
    actions,
    deliveryAt,
    receiverContactAt,
    receiverActionAt,
  });
};
