import { z } from 'zod';
import type { MatchAction, TacticalMatchState } from './matchState';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { playerContactGeometry } from './ballContactGeometry';
import { distance } from './matchSpace';

const nullableTime = z.number().nullable();
export const outcomeContactSchema = z.object({
  actorId: z.string(),
  at: z.number(),
  source: z.enum(['ground', 'flight', 'last_touch']),
  disruption: z.boolean(),
});
export const outcomeSampleSchema = z.object({
  at: z.number(),
  passId: z.string().nullable(),
  shotId: z.string().nullable(),
  shotOutcome: z.string().nullable(),
  ownerId: z.string().nullable(),
  activeIds: z.string().array(),
  ball: z.object({ x: z.number(), y: z.number(), height: z.number() }),
  velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  restart: z.string().nullable(),
  restartReleased: z.boolean().default(false),
  restartTeam: z.string().nullable(),
  contacts: outcomeContactSchema.array(),
});
export type OutcomeSample = z.infer<typeof outcomeSampleSchema>;
export const outcomeContractSchema = z.object({
  version: z.enum(['original-delivery-v1', 'original-delivery-v2']),
  actorId: z.string(),
  receiverId: z.string().nullable(),
  teamIds: z.string().array(),
  opponentIds: z.string().array(),
  requestedAt: z.number(),
  horizonAt: z.number(),
  releasedAt: nullableTime,
  passId: z.string().nullable(),
  shotId: z.string().nullable(),
  information: z.literal('privileged_engineering_observer'),
  conditionalOnRelease: z.literal(true),
  previousShotId: z.string().nullable().default(null),
});
export type OutcomeContract = z.infer<typeof outcomeContractSchema>;
export const outcomeBodySampleSchema = z.object({
  at: z.number(),
  ball: outcomeSampleSchema.shape.ball,
  bodies: z
    .array(
      z.object({
        id: z.string(),
        team: z.enum(['home', 'away']),
        position: z.object({ x: z.number(), y: z.number() }),
        velocity: z.object({ x: z.number(), y: z.number() }),
        facing: z.number(),
        footDistance: z.number(),
        footReach: z.number(),
        footAccess: z.boolean(),
        jumpHeight: z.number(),
        supportBalance: z.number(),
        burstReadiness: z.number().nullable(),
      }),
    )
    .max(6),
});
export const canonicalOutcomeSchema = z.object({
  contract: outcomeContractSchema,
  released: z.boolean(),
  directReceiverTouch: z.boolean().nullable(),
  deflectedReceiverTouch: z.boolean().nullable(),
  receiverControl: z.boolean().nullable(),
  teamPossessionAtOneSecond: z.boolean().nullable(),
  uninterruptedRetention: z.boolean().nullable(),
  receiverTouchAt: nullableTime,
  receiverControlAt: nullableTime,
  defensiveContactAt: nullableTime,
  defensiveDisruptionAt: nullableTime,
  defensiveControlAt: nullableTime,
  outOfPlayAt: nullableTime,
  terminalAt: nullableTime,
  terminal: z.enum([
    'not_released',
    'shot_terminal',
    'control',
    'restart',
    'new_action',
    'receiver_absent',
    'horizon',
  ]),
  censored: z.boolean(),
  looseAtHorizon: z.boolean(),
  originalShotOutcome: z.string().nullable(),
});

/** Read existing canonical witnesses only. No contact is inferred from proximity or ETA.
 * Witness identity, rather than a repeated last-touch field, prevents inherited contacts. */
export const sampleCanonicalOutcome = (
  before: TacticalMatchState,
  after: TacticalMatchState,
): OutcomeSample => {
  const contacts: OutcomeSample['contacts'] = [];
  const g = after.lastGroundContact;
  if (g?.executed && JSON.stringify(g) !== JSON.stringify(before.lastGroundContact))
    contacts.push({
      actorId: g.actorId,
      at: g.at,
      source: 'ground',
      disruption:
        Math.hypot(
          g.outgoingVelocity.x - g.incomingVelocity.x,
          g.outgoingVelocity.y - g.incomingVelocity.y,
        ) > 0.5,
    });
  const f = after.lastBallContact;
  if (f?.playerId && JSON.stringify(f) !== JSON.stringify(before.lastBallContact))
    contacts.push({
      actorId: f.playerId,
      at: f.at,
      source: 'flight',
      disruption: Math.abs(f.preContactSpeed - f.postContactSpeed) > 0.5,
    });
  if (
    after.ball.lastTouchPlayerId &&
    after.ball.lastTouchPlayerId !== before.ball.lastTouchPlayerId &&
    !contacts.some((c) => c.actorId === after.ball.lastTouchPlayerId)
  )
    contacts.push({
      actorId: after.ball.lastTouchPlayerId,
      at: after.time,
      source: 'last_touch',
      disruption: false,
    });
  const shotId = after.ball.shot?.shotId ?? after.lastShot?.shotId ?? null;
  return outcomeSampleSchema.parse({
    at: after.time,
    passId: after.lastPassDiagnostic?.passId ?? null,
    shotId,
    shotOutcome: after.lastShot?.shotId === shotId ? (after.lastShot?.outcome ?? null) : null,
    ownerId: after.ball.ownerId ?? null,
    activeIds: after.players.map((p) => p.id),
    ball: { x: after.ball.x, y: after.ball.y, height: after.ball.height ?? 0.11 },
    velocity: {
      x: after.ball.velocity?.x ?? 0,
      y: after.ball.velocity?.y ?? 0,
      z: after.ball.velocity?.z ?? 0,
    },
    restart: after.restart ? after.scenario : null,
    restartReleased: after.restart?.phase === 'release',
    restartTeam: after.restart?.restartTeam ?? null,
    contacts,
  });
};

/** Direct delivery ends at ANY intervening non-receiver contact. A deflected continuation
 * remains separately observable until control/restart/new release; later actions never count.
 * Ownership is a control witness, not a substitute for an unrecorded receiver touch. */
export const interpretCanonicalOutcome = (raw: OutcomeContract, samples: OutcomeSample[]) => {
  const c = outcomeContractSchema.parse(raw);
  let direct = true,
    receiverTouchAt: number | null = null,
    receiverControlAt: number | null = null;
  let directTouch = false,
    deflectedTouch = false;
  let defensiveContactAt: number | null = null,
    defensiveDisruptionAt: number | null = null;
  let defensiveControlAt: number | null = null,
    outOfPlayAt: number | null = null;
  let terminal: z.infer<typeof canonicalOutcomeSchema>['terminal'] =
    c.releasedAt === null ? 'not_released' : 'horizon';
  let terminalAt: number | null = c.releasedAt === null ? c.requestedAt : null;
  const episode = samples.filter(
    (s) => c.releasedAt !== null && s.at >= c.releasedAt && s.at <= c.horizonAt + 1e-8,
  );
  for (const s of episode) {
    if (terminal !== 'horizon') break;
    // A new release can occur between observations. Do not credit its contact to the old ball action.
    if (
      (c.passId && s.passId !== c.passId) ||
      (s.shotId && s.shotId !== c.shotId && s.shotId !== c.previousShotId)
    ) {
      terminal = 'new_action';
      terminalAt = s.at;
      break;
    }
    if (c.receiverId && !s.activeIds.includes(c.receiverId)) {
      terminal = 'receiver_absent';
      terminalAt = s.at;
      break;
    }
    for (const contact of s.contacts.filter((x) => x.at > c.releasedAt! + 1e-8)) {
      if (contact.actorId === c.receiverId) {
        receiverTouchAt ??= contact.at;
        if (direct) directTouch = true;
        else deflectedTouch = true;
      } else {
        direct = false;
        if (c.opponentIds.includes(contact.actorId)) {
          defensiveContactAt ??= contact.at;
          if (contact.disruption) defensiveDisruptionAt ??= contact.at;
        }
      }
    }
    if (c.shotId && s.shotId === c.shotId && s.shotOutcome) {
      terminal = 'shot_terminal';
      terminalAt = s.at;
    } else if (s.ownerId) {
      if (s.ownerId === c.receiverId) receiverControlAt = s.at;
      if (c.opponentIds.includes(s.ownerId)) defensiveControlAt = s.at;
      terminal = 'control';
      terminalAt = s.at;
    } else if (s.restart && !(c.version === 'original-delivery-v2' && s.restartReleased)) {
      terminal = 'restart';
      terminalAt = s.at;
      if (['throw_in', 'corner', 'goal_kick'].includes(s.restart)) outOfPlayAt = s.at;
    }
  }
  const released = c.releasedAt !== null;
  const resolved = terminal !== 'horizon' && terminal !== 'receiver_absent';
  const retention =
    receiverControlAt === null ? null : samples.find((s) => s.at >= receiverControlAt! + 1 - 1e-8);
  const retained =
    !released || !c.receiverId
      ? null
      : receiverControlAt === null
        ? resolved
          ? false
          : null
        : retention
          ? c.teamIds.includes(retention.ownerId ?? '') &&
            (!retention.restart ||
              (c.version === 'original-delivery-v2' && retention.restartReleased))
          : null;
  const lost =
    receiverControlAt !== null &&
    samples.some(
      (s) =>
        s.at >= receiverControlAt! &&
        s.at <= receiverControlAt! + 1 &&
        ((s.ownerId && c.opponentIds.includes(s.ownerId)) ||
          (s.restart && !(c.version === 'original-delivery-v2' && s.restartReleased))),
    );
  return canonicalOutcomeSchema.parse({
    contract: c,
    released,
    directReceiverTouch:
      !released || !c.receiverId ? null : directTouch ? true : !direct || resolved ? false : null,
    deflectedReceiverTouch:
      !released || !c.receiverId ? null : deflectedTouch ? true : resolved ? false : null,
    receiverControl:
      !released || !c.receiverId
        ? null
        : receiverControlAt !== null
          ? true
          : resolved
            ? false
            : null,
    teamPossessionAtOneSecond: retained,
    uninterruptedRetention: retained === null ? null : retained && !lost,
    receiverTouchAt,
    receiverControlAt,
    defensiveContactAt,
    defensiveDisruptionAt,
    defensiveControlAt,
    outOfPlayAt,
    terminalAt,
    terminal,
    censored: released && (!resolved || (receiverControlAt !== null && !retention)),
    looseAtHorizon:
      !samples.at(-1)?.ownerId &&
      (!samples.at(-1)?.restart ||
        (c.version === 'original-delivery-v2' && samples.at(-1)?.restartReleased)),
    originalShotOutcome: c.shotId
      ? (samples.find((s) => s.shotId === c.shotId && s.shotOutcome)?.shotOutcome ?? null)
      : null,
  });
};

export const runCanonicalOutcomeTrial = (
  initial: TacticalMatchState,
  action: MatchAction,
  seconds = 8,
  observer?: (sample: OutcomeSample) => void,
) => {
  if (!(seconds > 0 && seconds <= 12)) throw Error('Invalid outcome horizon');
  const actor = initial.players.find((p) => p.id === action.actorId);
  if (!actor) throw Error('Missing original actor');
  let s = resolveMatchAction(structuredClone(initial), structuredClone(action), 'autonomous_npc');
  const pass =
    action.type === 'pass' &&
    s.lastPassDiagnostic?.passerId === action.actorId &&
    s.lastPassDiagnostic.passId !== initial.lastPassDiagnostic?.passId
      ? s.lastPassDiagnostic
      : null;
  const shotId =
    ['shot', 'header'].includes(action.type) && s.ball.shot?.shotId !== initial.ball.shot?.shotId
      ? (s.ball.shot?.shotId ?? null)
      : null;
  const contract = outcomeContractSchema.parse({
    version: 'original-delivery-v2',
    actorId: actor.id,
    receiverId: action.type === 'pass' ? action.receiverId : null,
    teamIds: initial.players.filter((p) => p.team === actor.team).map((p) => p.id),
    opponentIds: initial.players.filter((p) => p.team !== actor.team).map((p) => p.id),
    requestedAt: initial.time,
    horizonAt: initial.time + seconds,
    releasedAt: pass || shotId ? initial.time : null,
    passId: pass?.passId ?? null,
    shotId,
    previousShotId: initial.ball.shot?.shotId ?? initial.lastShot?.shotId ?? null,
    information: 'privileged_engineering_observer',
    conditionalOnRelease: true,
  });
  const samples = [sampleCanonicalOutcome(initial, s)];
  const bodies: z.infer<typeof outcomeBodySampleSchema>[] = [];
  for (let tick = 0; tick < Math.round(seconds / 0.025); tick++) {
    const before = s;
    s = step(s, 0.025);
    const sample = sampleCanonicalOutcome(before, s);
    samples.push(sample);
    if (tick % 10 === 0 || sample.contacts.length) {
      const selected = s.players
        .filter((p) => p.id === contract.receiverId || distance(p.position, s.ball) < 8)
        .sort(
          (a, b) =>
            Number(b.id === contract.receiverId) - Number(a.id === contract.receiverId) ||
            distance(a.position, s.ball) - distance(b.position, s.ball),
        )
        .slice(0, 6);
      bodies.push(
        outcomeBodySampleSchema.parse({
          at: s.time,
          ball: sample.ball,
          bodies: selected.map((p) => {
            const geometry = playerContactGeometry(p);
            const footDistance = Math.min(
              distance(geometry.leftFoot, s.ball),
              distance(geometry.rightFoot, s.ball),
            );
            return {
              id: p.id,
              team: p.team,
              position: p.position,
              velocity: p.velocity,
              facing: p.facingAngle,
              footDistance,
              footReach: geometry.footReach,
              footAccess: sample.ball.height <= 0.5 && footDistance <= geometry.footReach,
              jumpHeight: p.verticalJump?.height ?? 0,
              supportBalance: p.plantBalance?.balance ?? 1,
              burstReadiness: p.fitness?.burstReadiness ?? null,
            };
          }),
        }),
      );
    }
    observer?.(structuredClone(sample));
    if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status ?? '')) break;
  }
  return {
    contract,
    outcome: interpretCanonicalOutcome(contract, samples),
    samples,
    bodies,
    final: s,
  };
};
