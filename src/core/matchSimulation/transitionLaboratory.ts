import { z } from 'zod';
import { createCognitionFixture } from './tacticalCognitionLab';
import { boundedExperimentSchema } from './boundedIntelligenceState';
import { withBoundedObserver, boundedTraceSchema } from './boundedIntelligence';
import { tacticalMatchStateSchema, matchActionSchema } from './matchState';
import type { MatchPlayerState } from './matchState';
import { playerContactGeometry, groundContactFactSchema } from './ballContactGeometry';
import { ballContactSchema } from './ballFlight';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { beginDefensiveChallenge } from './defensiveChallenges';
import { resolveMatchAction } from './matchActions';
import { commitHumanPossessionDecision } from './possessionAgency';
import { executeFootContact, footContactExecutionSchema } from './footContact';
import { observeBoundedScene } from './boundedPerception';
import { constructBoundedCandidates, boundedCandidateSchema } from './boundedDecision';
import {
  estimatePassWindow,
  estimateUsefulContact,
  contactRaceEstimateSchema,
} from './opportunityWindows';
import {
  sampleTransition,
  transitionSampleSchema,
  measureTeamOrganisation,
} from './transitionDiagnostics';
import { evaluateStrategicClearance, strategicClearanceDecisionSchema } from './strategicClearance';
import { distance } from './matchSpace';

export const transitionLabConfigSchema = z.object({
  id: z.string().min(1),
  seed: z.string().default('pr193-development-lab'),
  scenario: z.enum(['counterattack', 'contact_race', 'clearance', 'wing', 'crowded', 'deflection']),
  attacker: z.number().min(1).max(100).default(80),
  defender: z.number().min(1).max(100).default(80),
  mirror: z.boolean().default(false),
  delay: z.number().min(0).max(1).default(0),
  variant: z
    .enum([
      'autonomous',
      'control',
      'into_play',
      'touchline',
      'goal_line',
      'late',
      'organised',
      'passive',
      'none',
      'fatigued',
      'chasing',
      'protecting',
      'press_escape',
    ])
    .default('autonomous'),
  lane: z.enum(['central', 'left', 'right']).default('central'),
  transitions: z.boolean().default(true),
  clearances: z.boolean().default(true),
  seconds: z.number().positive().max(30).default(12),
});
export type TransitionLabConfig = z.infer<typeof transitionLabConfigSchema>;

export const createTransitionFixture = (raw: z.input<typeof transitionLabConfigSchema>) => {
  const c = transitionLabConfigSchema.parse(raw);
  const f = createCognitionFixture('counter_support', c.seed);
  const s = f.state;
  s.experimentalBallRecovery = true;
  s.experimentalRestartPreparation = true;
  if (c.transitions) s.experimentalTransitionIntelligence = true;
  if (c.clearances) s.experimentalStrategicClearances = true;
  s.decisionPolicy = 'opportunity-driven-v1';
  s.boundedExperiment = boundedExperimentSchema.parse({
    knowledge: { system: 0.75, role: 0.75, partner: 0.65 },
  });
  s.playerAgencyEnabled = false;
  const home = s.players.filter((p) => p.team === 'home'),
    away = s.players.filter((p) => p.team === 'away');
  const carrier = home.find((p) => p.id === f.sourceId)!;
  const runner = home.find((p) => p.id === f.runnerIds[0])!;
  const support = home.find(
    (p) => p.slot.position === 'central_midfielder' && p.id !== carrier.id,
  )!;
  const wide = home.find((p) => p.slot.position === 'left_winger')!;
  const defender = away.find((p) => p.id === f.opponentId)!;
  const cover = away.find((p) => p.slot.position === 'center_back' && p.id !== defender.id)!;
  const high = away.find(
    (p) => /back/.test(p.slot.position) && ![cover.id, defender.id].includes(p.id),
  )!;
  for (const [i, p] of s.players.entries()) {
    const rating = p.team === 'home' ? c.attacker : c.defender;
    for (const key of Object.keys(p.profile.attributes) as (keyof typeof p.profile.attributes)[])
      p.profile.attributes[key] = rating;
    p.position = { x: p.team === 'home' ? 24 + (i % 3) : 40 + (i % 3), y: 7 + (i % 5) * 12 };
    p.velocity = { x: 0, y: 0 };
    p.facingAngle = p.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
  }
  const place = (p: MatchPlayerState, x: number, y: number, vx = 0, vy = 0) => {
    p.position = { x, y };
    p.velocity = { x: vx, y: vy };
  };
  place(carrier, 58, 34, 1);
  place(support, 52, 31, 1);
  place(wide, 61, 10, 2);
  place(runner, 72, 31, 4);
  const third = home.find((p) => p.id === f.runnerIds[1])!;
  place(third, 57, 22, 1);
  third.facingAngle = 0;
  runner.duty = 'attack';
  support.duty = 'support';
  carrier.duty = 'support';
  place(defender, 60, 35, -1);
  place(cover, 77, 43, -2);
  place(high, 55, 8, 2);
  if (c.variant === 'press_escape') {
    place(defender, 60, 34, -0.5);
    place(cover, 67, 32, -1);
    const midfielder = away.find((p) => p.slot.position === 'central_midfielder')!;
    place(midfielder, 59.5, 36, -1);
  }
  place(away.find((p) => p.slot.position === 'goalkeeper')!, 99, 34, -1);
  for (const [i, p] of home.filter((p) => f.coverIds.includes(p.id)).entries())
    place(p, 47, 27 + i * 12);
  if (['clearance', 'wing', 'crowded'].includes(c.scenario)) {
    const y = c.lane === 'central' ? 34 : c.lane === 'left' ? 1.2 : 66.8;
    place(carrier, 91, y, 1);
    carrier.facingAngle = Math.PI / 2;
    place(defender, 91.55, y + (y > 34 ? -0.2 : 0.2), -0.5);
    defender.facingAngle = -Math.PI / 2;
    place(runner, 95, 31, 3);
    place(wide, 89, y < 34 ? 8 : 60, 2);
    place(cover, c.variant === 'organised' ? 95 : 79, 37, -1);
    if (c.scenario === 'crowded') {
      place(cover, 92, y + (y > 34 ? -2 : 2), -1);
      place(high, 90, y + (y > 34 ? -2 : 2), 1);
    }
  }
  if (c.scenario === 'contact_race') {
    place(runner, 72.5, 33.7, 5);
    place(defender, 78, 35, -4);
    defender.facingAngle = -Math.PI / 2;
    place(carrier, 66, 34);
    place(cover, 89, 43);
    if (c.variant === 'organised') place(cover, 81, 33, -2);
  }
  if (c.scenario === 'deflection') {
    s.experimentalIncidentalGoals = true;
    place(carrier, 87, 7);
    carrier.facingAngle = angleForVector({ x: 5, y: 9 });
    place(defender, 91, 14);
    defender.facingAngle = -Math.PI / 2;
    place(runner, 93, 17, 1);
    place(cover, 98, 38);
  }
  if (c.variant === 'none')
    for (const p of away.filter((p) => p.slot.position !== 'goalkeeper')) place(p, 15, 60);
  if (c.variant === 'passive') for (const p of away) p.velocity = { x: 0, y: 0 };
  if (c.variant === 'organised' && c.scenario === 'counterattack') {
    place(defender, 64, 34);
    place(cover, 75, 32);
    place(high, 66, 12);
  }
  if (c.variant === 'fatigued')
    for (const p of s.players)
      if (p.fitness) {
        p.fitness.longTermCapacity = 0.55;
        p.fitness.burstReadiness = 0.35;
      }
  if (c.variant === 'chasing' || c.variant === 'protecting') {
    s.time = 4800;
    s.status = 'second_half';
    delete s.timekeeping;
    s.score = { home: c.variant === 'protecting' ? 1 : 0, away: c.variant === 'chasing' ? 1 : 0 };
  }
  for (const p of s.players) {
    if (c.mirror) {
      p.position.y = 68 - p.position.y;
      p.velocity.y *= -1;
      p.facingAngle = normalizeAngle(Math.PI - p.facingAngle);
      p.profile.dominantFoot = 'left';
    }
    p.target = { ...p.position };
    p.anchor = { ...p.position };
    p.neutralAnchor = { ...p.position };
  }
  const feet = playerContactGeometry(carrier);
  s.ball = {
    ...feet[carrier.profile.dominantFoot === 'left' ? 'leftFoot' : 'rightFoot'],
    ownerId: carrier.id,
    lastTouchPlayerId: carrier.id,
    height: 0.11,
    velocity: { ...carrier.velocity, z: 0 },
  };
  s.ballOwnershipStartedAt = s.time - 1;
  s.onBallPreparation = {
    actorId: carrier.id,
    gainedAt: s.time - 1,
    readyAt: s.time - 0.5,
    kind: 'immediate_control',
    incomingSpeed: 0,
  };
  if (c.scenario === 'contact_race' || (c.scenario === 'counterattack' && c.delay > 0)) {
    s.playerAgencyEnabled = true;
    s.controlledFootballerId = carrier.id;
    const held = commitHumanPossessionDecision(s, { type: 'hold', actorId: carrier.id });
    if (held.humanPossessionEpisode) s.humanPossessionEpisode = held.humanPossessionEpisode;
  }
  tacticalMatchStateSchema.parse(s);
  return {
    state: s,
    config: c,
    carrierId: carrier.id,
    supportId: support.id,
    wideId: wide.id,
    runnerId: runner.id,
    defenderId: defender.id,
  };
};

export const transitionLabResultSchema = z.object({
  config: transitionLabConfigSchema,
  initial: tacticalMatchStateSchema,
  final: tacticalMatchStateSchema,
  samples: z.array(transitionSampleSchema).max(302),
  traces: z.array(boundedTraceSchema).max(192),
  candidates: z.array(boundedCandidateSchema).max(48),
  clearanceDecision: strategicClearanceDecisionSchema.nullable(),
  forecasts: z
    .array(
      z.object({
        delay: z.number(),
        receiver: contactRaceEstimateSchema,
        defender: contactRaceEstimateSchema,
      }),
    )
    .max(3),
  contacts: z.array(footContactExecutionSchema).max(64),
  intentContacts: z
    .array(
      z.object({
        actorId: z.string(),
        objective: z.enum(['pass', 'clearance']),
        contact: footContactExecutionSchema,
      }),
    )
    .max(64),
  contactFacts: z.array(groundContactFactSchema).max(64),
  collisions: z.array(ballContactSchema).max(64),
  races: z
    .array(
      z.object({
        playerId: z.string(),
        approachAt: z.number().nullable(),
        playableTouchAt: z.number().nullable(),
        actionAt: z.number().nullable(),
      }),
    )
    .max(2),
  actions: z.array(matchActionSchema).max(128),
  classification: z.string(),
  limitation: z.string(),
});
export type TransitionLabResult = z.infer<typeof transitionLabResultSchema>;

/** Canonical stepping, physical contacts and ordinary autonomous decisions. Only
 * explicitly labelled intervention cases prescribe an objective for causal pairing. */
export const runTransitionLab = (
  raw: z.input<typeof transitionLabConfigSchema>,
  observer?: (sample: z.infer<typeof transitionSampleSchema>) => void,
): TransitionLabResult => {
  const f = createTransitionFixture(raw),
    c = f.config;
  let s = f.state;
  const start = s.time,
    initial = structuredClone(s),
    samples: TransitionLabResult['samples'] = [],
    traces: TransitionLabResult['traces'] = [],
    contacts: TransitionLabResult['contacts'] = [],
    intentContacts: TransitionLabResult['intentContacts'] = [],
    contactFacts: TransitionLabResult['contactFacts'] = [],
    collisions: TransitionLabResult['collisions'] = [],
    actions: TransitionLabResult['actions'] = [];
  const races: TransitionLabResult['races'] = [f.runnerId, f.defenderId].map((playerId) => ({
    playerId,
    approachAt: null,
    playableTouchAt: null,
    actionAt: null,
  }));
  const actor = s.players.find((p) => p.id === f.carrierId)!,
    defender = s.players.find((p) => p.id === f.defenderId)!,
    runner = s.players.find((p) => p.id === f.runnerId)!;
  const scene = observeBoundedScene(s, actor),
    candidates = constructBoundedCandidates(scene);
  const clearanceDecision = evaluateStrategicClearance(observeBoundedScene(s, defender)) ?? null;
  const target = { x: 82, y: 34 };
  const forecasts = [0.2, 0.5, 1].map((delay) => ({
    delay,
    receiver: estimateUsefulContact(
      {
        position: {
          x: runner.position.x + runner.velocity.x * delay,
          y: runner.position.y + runner.velocity.y * delay,
        },
        velocity: runner.velocity,
        facing: runner.facingAngle,
      },
      target,
    ),
    defender: estimateUsefulContact(
      {
        position: {
          x: defender.position.x + defender.velocity.x * delay,
          y: defender.position.y + defender.velocity.y * delay,
        },
        velocity: defender.velocity,
        facing: defender.facingAngle,
      },
      target,
    ),
  }));
  let challengeStarted = false,
    delayedAutonomyReleased = false,
    raceReleased = false,
    outsideReleased = false,
    clearanceAttempted = false;
  const record = () => {
    const sample = sampleTransition(s);
    samples.push(sample);
    observer?.(structuredClone(sample));
  };
  record();
  withBoundedObserver(
    (t) => {
      if (traces.length < 192) traces.push(structuredClone(t));
    },
    () => {
      for (let tick = 0; tick < Math.ceil(c.seconds / 0.025); tick++) {
        if (
          c.scenario === 'counterattack' &&
          c.delay > 0 &&
          !delayedAutonomyReleased &&
          s.time - start >= c.delay - 1e-8
        ) {
          s = { ...s, playerAgencyEnabled: false, actionCooldown: 0 };
          delayedAutonomyReleased = true;
        }
        if (c.scenario === 'contact_race' && !raceReleased && s.time - start >= c.delay - 1e-8) {
          const action = {
            type: 'pass' as const,
            actorId: f.carrierId,
            receiverId: f.runnerId,
            target: { x: 82, y: 34 },
            requestedSpace: { x: 82, y: 34 },
            intent: 'through' as const,
            delivery: 'ground' as const,
          };
          const released = resolveMatchAction(s, action, 'human_selected');
          if (released.decisionIndex > s.decisionIndex) actions.push(action);
          s = { ...released, playerAgencyEnabled: false };
          raceReleased = true;
        }
        if (
          c.scenario === 'clearance' &&
          !challengeStarted &&
          s.time - start >= c.delay + (c.variant === 'late' ? 0.6 : 0)
        ) {
          const selected =
            c.variant === 'autonomous' ? clearanceDecision?.selected.kind : c.variant;
          const kind =
            selected === 'goal_line'
              ? 'goal_line'
              : selected === 'touchline'
                ? 'touchline'
                : 'into_play';
          const choice = clearanceDecision?.alternatives.find((a) => a.kind === kind);
          if (selected !== 'delay')
            s = beginDefensiveChallenge(
              s,
              {
                type: 'challenge',
                actorId: f.defenderId,
                opponentId: f.carrierId,
                technique: 'standing',
                ...(selected === 'control'
                  ? { clearance: { kind: 'control', target: { x: s.ball.x, y: s.ball.y } } }
                  : choice
                    ? { clearance: { kind, target: choice.target } }
                    : {}),
              },
              'dev_ai_selected',
            );
          challengeStarted = true;
        }
        if (c.scenario === 'deflection') {
          const id = outsideReleased ? f.defenderId : f.carrierId;
          const p = s.players.find((p) => p.id === id)!;
          if (!outsideReleased || (!clearanceAttempted && distance(p.position, s.ball) < 1)) {
            const receipt = executeFootContact(s, p, {
              intended: outsideReleased ? 'inside' : 'outside',
              desiredVelocity: outsideReleased
                ? { x: 7, y: c.mirror ? 8 : -8, z: 0 }
                : { x: 8, y: c.mirror ? -11 : 11, z: 0 },
              preparationSeconds: 0.3,
              balance: 1,
              contactSeconds: 0.06,
              pressure: 0.2,
            });
            if (contacts.length < 64) contacts.push(receipt);
            if (intentContacts.length < 64)
              intentContacts.push({
                actorId: id,
                objective: outsideReleased ? 'clearance' : 'pass',
                contact: receipt,
              });
            if (receipt.available) {
              s = {
                ...s,
                ball: {
                  x: s.ball.x,
                  y: s.ball.y,
                  height: s.ball.height ?? 0.11,
                  velocity: receipt.outgoingVelocity,
                  spin: receipt.outgoingSpin,
                  looseSince: s.time,
                  lastTouchPlayerId: id,
                  airborne: false,
                },
              };
              if (outsideReleased) clearanceAttempted = true;
              outsideReleased = true;
            }
          }
        }
        const before = s;
        if (c.scenario === 'clearance' || c.scenario === 'contact_race' || s.time - start < c.delay)
          s = { ...s, actionCooldown: Math.max(s.actionCooldown, 0.5) };
        s = step(s, 0.025);
        for (const race of races) {
          const p = s.players.find((p) => p.id === race.playerId);
          if (!p) continue;
          if (race.approachAt === null && distance(p.position, s.ball) <= 0.9)
            race.approachAt = s.time;
          if (
            race.playableTouchAt === null &&
            ((s.lastGroundContact?.actorId === p.id &&
              s.lastGroundContact.executed &&
              s.lastGroundContact.at >= start) ||
              s.ball.ownerId === p.id)
          )
            race.playableTouchAt = s.time;
          if (
            race.actionAt === null &&
            s.decisionIndex > before.decisionIndex &&
            s.latestAction?.actorId === p.id
          )
            race.actionAt = s.time;
        }
        if (
          s.lastGroundContact &&
          s.lastGroundContact.at !== before.lastGroundContact?.at &&
          contactFacts.length < 64
        )
          contactFacts.push(structuredClone(s.lastGroundContact));
        if (
          s.lastBallContact &&
          s.lastBallContact.at !== before.lastBallContact?.at &&
          collisions.length < 64
        )
          collisions.push(structuredClone(s.lastBallContact));
        if (
          s.lastGroundContact?.surfaceContact &&
          s.lastGroundContact.at !== before.lastGroundContact?.at &&
          contacts.length < 64
        )
          contacts.push(structuredClone(s.lastGroundContact.surfaceContact));
        if (s.decisionIndex !== before.decisionIndex && s.latestAction && actions.length < 128)
          actions.push(structuredClone(s.latestAction));
        if (tick % 4 === 3) record();
        if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status ?? '')) break;
      }
    },
  );
  if (samples.at(-1)?.at !== s.time) record();
  return transitionLabResultSchema.parse({
    config: c,
    initial,
    final: s,
    samples,
    traces,
    candidates,
    clearanceDecision,
    forecasts,
    contacts,
    intentContacts,
    contactFacts,
    collisions,
    races,
    actions,
    classification:
      c.scenario === 'clearance'
        ? 'paired prescribed objective; canonical contact and continuation'
        : c.scenario === 'deflection'
          ? 'prescribed surface objectives; real reach/impulses; canonical continuation'
          : 'autonomous canonical continuation from prescribed initial geometry',
    limitation:
      c.scenario === 'crowded'
        ? 'Nutmeg blocked: legacy solid low body volume has no validated articulated leg opening; no success probability or surprise bonus.'
        : 'Predicted contact/windows are approximate. Physical contacts, laws and results are authoritative. No guaranteed return, win, shot or goal.',
  });
};

// Public inspection helpers keep the same apparatus available to the Match Lab.
export { estimatePassWindow, measureTeamOrganisation };
