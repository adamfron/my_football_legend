import { PASSIVE_OUTFIELD_BODY, UPRIGHT_OUTFIELD_BALL_BODY } from './ballFlight';
import { interpolateLowerBodyPose } from './lowerBodyGeometry';
import { compareSharedContactEvents, type sharedContactEventSchema } from './sharedContactTimeline';
import { recordExecution } from './executionWitness';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
import {
  MULTI_BODY,
  multiBodyParticipants,
  findPlayerMovementEdge,
  multiBodyMovementBounds,
  resolveMultiBodyContact,
} from './multiBodyContact';
import type { z } from 'zod';
import {
  integrateCanonicalBodyRemainder,
  accountCanonicalContactMovement,
} from './canonicalMovement';
import {
  findPlayerBodyContact,
  retainPlayerBodyContacts,
  playerPairKey,
  resolvePlayerBodyImpulse,
  supportedUprightPair,
} from './playerBodyContact';
import { resolveDefensiveChallenge, type ChallengeDiagnostic } from './defensiveChallenges';
import { executeFootContact } from './footContact';
import {
  retainContinuousBodyContacts,
  supportContinuousBodyContacts,
} from './ballContactResolution';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  findPitchBoundaryCrossing,
  isBallWithinPlayingBoundary,
  type PitchBoundaryCrossing,
} from './pitchBoundary';
import { findFirstBallContact, resolveBallRebound, type ContactCandidate } from './ballFlight';
import { integrateBallFlight } from './ballPhysics';
import { canParticipatePhysically } from './matchInjuries';
import { motorContactReadyAt, advanceControlledBall } from './ballContactGeometry';
import { canContactAfterThrowIn } from './throwIn';
import { captureOffsideSnapshot } from './offside';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { GOALKEEPER_PHYSICS } from './goalkeeperIntervention';
import { isRestartSetup } from './restartPhase';
import { haltEvidence } from './matchSafety';
import {
  canonicalStrikeFoot,
  executePendingContact,
  findStrikeIntervalContact,
  finishPendingStrike,
  beginFootRecovery,
  physicalStrikeBall,
  withPhysicalStrikeBall,
} from './pendingStrike';

type Handlers = {
  /** Chosen before the motor step; moved endpoints cannot switch ball ownership. */
  ordinary?: boolean;
  /** Unsupported ball techniques retain their named consumer; torso motion does not. */
  bodyOnly?: boolean;
  boundary: (
    state: TacticalMatchState,
    crossing: PitchBoundaryCrossing,
    previous: { x: number; y: number; z: number },
    seconds: number,
  ) => TacticalMatchState;
  challenge?: (state: TacticalMatchState, diagnostic: ChallengeDiagnostic) => TacticalMatchState;
  control: (state: TacticalMatchState, actorId: string) => TacticalMatchState;
  body: (state: TacticalMatchState, actorId: string) => TacticalMatchState;
};

const bodyAt = (a: MatchPlayerState, b: MatchPlayerState, fraction: number): MatchPlayerState => ({
  ...b,
  ...(a.lowerBodyPose || b.lowerBodyPose
    ? { lowerBodyPose: interpolateLowerBodyPose(a.lowerBodyPose, b.lowerBodyPose, fraction) }
    : {}),
  position: {
    x: a.position.x + (b.position.x - a.position.x) * fraction,
    y: a.position.y + (b.position.y - a.position.y) * fraction,
  },
  velocity: {
    x: a.velocity.x + (b.velocity.x - a.velocity.x) * fraction,
    y: a.velocity.y + (b.velocity.y - a.velocity.y) * fraction,
  },
  facingAngle:
    a.facingAngle +
    Math.atan2(Math.sin(b.facingAngle - a.facingAngle), Math.cos(b.facingAngle - a.facingAngle)) *
      fraction,
});

/** Canonical contact interval. The selected upright pair can replace its transport
 * segments after impact; the tick's finite actuator update is never spent twice. */
export const advancePendingStrikeInterval = (
  input: TacticalMatchState,
  moved: TacticalMatchState,
  dt: number,
  handlers: Handlers,
): TacticalMatchState => {
  const pending = moved.pendingStrike;
  const ordinary =
    handlers.ordinary ??
    (!moved.pendingStrike &&
      !moved.defensiveChallenge?.physicalAttempt &&
      (ownsOrdinaryLowBallInterval(input, dt) || ownsOrdinaryLowBallInterval(moved, dt)));
  const shared = moved.experimentalContactTimeline === 'standing-contact-dev-v1';
  const start = moved.time - dt,
    end = moved.time;
  const before = new Map(input.players.map((p) => [p.id, p]));
  const multi = moved.experimentalPlayerBodyImpulse === 'upright-cluster-dev-v1';
  const clusterIds = multiBodyParticipants(input, dt);
  // Direct interval callers supply the same authoritative pre/moved snapshots.
  for (const id of multiBodyParticipants(moved, dt)) clusterIds.add(id);
  let finalPlayers = multi
    ? [...moved.players].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    : moved.players;
  const nominalPlayers = moved.players;
  const pairIntent =
    moved.experimentalPlayerBodyImpulse &&
    moved.defensiveChallenge?.physicalAttempt &&
    moved.defensiveChallenge.technique === 'standing'
      ? moved.defensiveChallenge
      : undefined;
  const pairIds = pairIntent?.physicalAttempt ? [pairIntent.actorId, pairIntent.opponentId] : [];
  const pairServiced = new Set<string>();
  const origins = new Map<string, { player: MatchPlayerState; at: number }>();
  const travelled = new Map<string, number>();
  let transportEnd = dt;
  const playerAt = (p: MatchPlayerState, at: number) => {
    const origin = origins.get(p.id);
    const a = origin?.player ?? before.get(p.id) ?? p;
    const began = origin?.at ?? 0;
    const value = bodyAt(a, p, (at - began) / Math.max(1e-12, dt - began));
    return moved.experimentalPlayerBodyImpulse &&
      (pairIds.includes(p.id) || origin || clusterIds.has(p.id))
      ? {
          ...value,
          velocity: p.velocity,
          ...(p.plantBalance ? { plantBalance: p.plantBalance } : {}),
        }
      : value;
  };
  const changedVelocities = new Map<string, MatchPlayerState['velocity']>();
  const interruptedByLaw = (s: TacticalMatchState) =>
    Boolean(
      (s.restart &&
        (!input.restart ||
          s.restart.awardId !== input.restart.awardId ||
          (input.restart.phase === 'release' && s.restart.phase !== 'release'))) ||
        (s.postGoal && !input.postGoal) ||
        (s.scenario !== input.scenario &&
          !(input.restart?.phase === 'release' && s.scenario === 'open_play' && !s.restart)),
    );
  const restoreClock = (s: TacticalMatchState) => {
    if (multi && interruptedByLaw(s)) {
      // A lawful interruption precedes every later physical opportunity. Never
      // restore a future drift endpoint through an edge or a third body.
      transportEnd = elapsed;
      finalPlayers = finalPlayers.map((p) =>
        clusterIds.has(p.id) || origins.has(p.id)
          ? { ...p, position: playerAt(p, elapsed).position }
          : p,
      );
    }
    return {
      ...s,
      time: end,
      ...(moved.experimentalPlayerBodyImpulse
        ? {
            playerBodyContacts: (s.playerBodyContacts ?? []).map((c) => ({
              ...c,
              actualRemainderSeconds: Math.max(0, transportEnd - (c.at - start)),
              remainderPositions: c.participants.map(
                (id) => finalPlayers.find((p) => p.id === id)?.position ?? { x: 0, y: 0 },
              ) as [MatchPlayerState['position'], MatchPlayerState['position']],
            })),
          }
        : {}),
      players: finalPlayers
        .filter((p) => !moved.experimentalPlayerBodyImpulse || s.players.some((a) => a.id === p.id))
        .map((p) => {
          const changed = s.players.find((a) => a.id === p.id);
          const physical = changed
            ? {
                ...changed,
                position: p.position,
                facingAngle: p.facingAngle,
                velocity: changedVelocities.get(p.id) ?? p.velocity,
                ...(p.lowerBodyPose
                  ? {
                      lowerBodyPose:
                        transportEnd < dt
                          ? playerAt(p, transportEnd).lowerBodyPose
                          : p.lowerBodyPose,
                    }
                  : {}),
              }
            : p;
          const origin = origins.get(p.id);
          const prior = before.get(p.id),
            nominal = nominalPlayers.find((a) => a.id === p.id);
          return origin && prior && nominal && prior.samples < p.samples
            ? accountCanonicalContactMovement(
                prior,
                nominal,
                physical,
                (travelled.get(p.id) ?? 0) +
                  Math.hypot(p.velocity.x, p.velocity.y) * Math.max(0, transportEnd - origin.at),
                dt,
                end,
              )
            : physical;
        }),
    };
  };
  let state = recordExecution(
      { ...moved, time: start },
      'contact-interval',
      'pendingStrikeInterval.advance',
    ),
    elapsed = 0,
    evaluations = 0;
  if (ordinary)
    state = recordExecution(state, 'ordinary-loose-ball', 'pendingStrikeInterval.advance:ordinary');
  const excluded = new Set<string>(pending ? [pending.actorId] : []);
  const uncertainActors = new Set<string>();
  const advanceBallState = (
    s: TacticalMatchState,
    flight: ReturnType<typeof integrateBallFlight>,
    seconds: number,
  ) => {
    const next = withPhysicalStrikeBall(s, flight);
    if (s.ball.travelKind)
      next.ball = {
        ...next.ball,
        flightTime: (s.ball.flightTime ?? 0) + seconds,
        distanceTravelled:
          (s.ball.distanceTravelled ?? 0) +
          Math.hypot(flight.position.x - s.ball.x, flight.position.y - s.ball.y),
      };
    return next;
  };
  const releaseSeparatedControl = () => {
    const owner = state.players.find((p) => p.id === state.ball.ownerId);
    if (!owner || state.pendingStrike) return;
    const prepared = advanceControlledBall(state, owner, 0, undefined, undefined, 'prepare');
    state = prepared.state;
    if (prepared.looseVelocity) {
      state = { ...state, ball: { ...state.ball, looseSince: state.time } };
      delete state.ball.ownerId;
    }
  };
  const passiveFoot = (
    actor: MatchPlayerState,
    key: string,
    hit: NonNullable<ReturnType<typeof findStrikeIntervalContact>>,
  ) => {
    const foot: 'left' | 'right' = key.endsWith(':left') ? 'left' : 'right';
    const ball = physicalStrikeBall(state);
    const rebound = resolveBallRebound(
      'defender',
      ball.velocity,
      { team: state.possessionTeam, endsSwitched: state.endsSwitched },
      ball.spin,
      { surfaceNormal: hit.normal!, point: ball.position, surfaceVelocity: hit.foot!.velocity },
    );
    state = {
      ...state,
      ball: {
        ...state.ball,
        velocity: rebound.velocity,
        ...(rebound.spin ? { spin: rebound.spin } : {}),
        lastTouchPlayerId: actor.id,
      },
      continuousFootContacts: [
        ...(state.continuousFootContacts ?? []),
        { actorId: actor.id, foot },
      ].slice(-44),
    };
    if (state.ball.ownerId && state.ball.ownerId !== actor.id) {
      state = { ...state, ball: { ...state.ball, looseSince: state.time } };
      delete state.ball.ownerId;
    }
    state = recordExecution(state, 'ball-body-contact', 'pendingStrikeInterval.passiveFoot', 1);
  };
  if (multi && !handlers.bodyOnly) releaseSeparatedControl();
  const rebasePlayer = (p: MatchPlayerState) => {
    const old = finalPlayers.find((q) => q.id === p.id)!;
    const began = origins.get(p.id)?.at ?? 0;
    travelled.set(
      p.id,
      (travelled.get(p.id) ?? 0) + Math.hypot(old.velocity.x, old.velocity.y) * (elapsed - began),
    );
    origins.set(p.id, { player: p, at: elapsed });
    changedVelocities.set(p.id, p.velocity);
    finalPlayers = finalPlayers.map((q) =>
      q.id === p.id
        ? {
            ...q,
            velocity: p.velocity,
            ...(p.plantBalance ? { plantBalance: p.plantBalance } : {}),
            position: integrateCanonicalBodyRemainder(p, dt - elapsed),
          }
        : q,
    );
  };
  const resolveChallenge = (
    kind: 'ball' | 'body' | 'miss' | 'interrupted' | 'unresolved',
    reason: string,
    contact?: ReturnType<typeof executeFootContact>,
  ) => {
    const challengeBefore = state.defensiveChallenge;
    const resolution = resolveDefensiveChallenge(state, {
      kind,
      reason,
      ...(contact ? { contact } : {}),
    });
    state = resolution.state;
    if (challengeBefore?.physicalAttempt)
      state = beginFootRecovery(state, challengeBefore.actorId, challengeBefore.physicalAttempt);
    if (resolution.diagnostic) state = handlers.challenge?.(state, resolution.diagnostic) ?? state;
  };
  const intervalFoot = (p: MatchPlayerState, foot: 'left' | 'right', t: number) => {
    const origin = origins.get(p.id),
      a = origin?.player ?? before.get(p.id) ?? p,
      began = origin?.at ?? 0;
    const own =
      state.pendingStrike?.actorId === p.id && state.pendingStrike.plan.foot === foot
        ? state.pendingStrike
        : undefined;
    const defending =
      state.defensiveChallenge?.actorId === p.id &&
      state.defensiveChallenge.physicalAttempt?.plan.foot === foot
        ? state.defensiveChallenge.physicalAttempt
        : undefined;
    const latched = state.continuousFootContacts?.find(
      (c) => c.actorId === p.id && c.foot === foot,
    )?.prepared;
    const trajectory =
      own ??
      defending ??
      (latched
        ? {
            path: latched.path,
            selectedAt: latched.selectedAt,
            plan: { facingAngle: latched.facingAngle },
          }
        : undefined);
    return canonicalStrikeFoot(
      trajectory,
      a,
      p,
      foot,
      start + began,
      dt - began,
      elapsed + t - began,
      state.recoveringFeet?.find((f) => f.actorId === p.id && f.foot === foot),
    );
  };
  for (
    let eventCount = 0;
    eventCount < (multi ? MULTI_BODY.events : 4) && elapsed < dt - 1e-12;
    eventCount++
  ) {
    const seconds = dt - elapsed;
    if (multi)
      state = {
        ...state,
        continuousPlayerContacts: retainPlayerBodyContacts({
          ...state,
          players: finalPlayers.map((p) => playerAt(p, elapsed)),
        }),
      };
    const ball = physicalStrikeBall(state);
    if (multi)
      state = {
        ...state,
        continuousFootContacts: (state.continuousFootContacts ?? []).filter((c) => {
          const p = finalPlayers.find((p) => p.id === c.actorId);
          if (!p) return false;
          const foot = intervalFoot(p, c.foot, 0).position;
          return (
            Math.hypot(
              foot.x - ball.position.x,
              foot.y - ball.position.y,
              foot.z - ball.position.z,
            ) <= 0.155
          );
        }),
      };
    state = recordExecution(state, 'ground-contact', 'pendingStrikeInterval.integrateBallFlight');
    let integrated = integrateBallFlight(ball, seconds, state.ballEnvironment);
    const candidates: ContactCandidate[] = finalPlayers
      .filter(
        (p) =>
          (!excluded.has(p.id) || (shared && state.ball.continuousBodyContacts?.includes(p.id))) &&
          canParticipatePhysically(p) &&
          !state.discipline?.[p.id]?.sentOff &&
          canContactAfterThrowIn(state, p.id),
      )
      .map((p) => {
        const a = playerAt(p, elapsed);
        return {
          kind: isMatchGoalkeeper(p) ? ('goalkeeper' as const) : ('defender' as const),
          playerId: p.id,
          centre: {
            ...p.position,
            z: isMatchGoalkeeper(p)
              ? GOALKEEPER_PHYSICS.contactCentreHeight
              : multi
                ? (p.profile.heightCm / 100) * UPRIGHT_OUTFIELD_BALL_BODY.centreHeightRatio
                : PASSIVE_OUTFIELD_BODY.centreHeight,
          },
          previousCentre: {
            ...a.position,
            z: isMatchGoalkeeper(p)
              ? GOALKEEPER_PHYSICS.contactCentreHeight
              : multi
                ? (p.profile.heightCm / 100) * UPRIGHT_OUTFIELD_BALL_BODY.centreHeightRatio
                : PASSIVE_OUTFIELD_BODY.centreHeight,
          },
          radius: isMatchGoalkeeper(p)
            ? GOALKEEPER_PHYSICS.passiveBodyRadiusMetres
            : multi
              ? UPRIGHT_OUTFIELD_BALL_BODY.radius
              : PASSIVE_OUTFIELD_BODY.radius,
          ...(multi && !isMatchGoalkeeper(p)
            ? {
                halfHeight: (p.profile.heightCm / 100) * UPRIGHT_OUTFIELD_BALL_BODY.halfHeightRatio,
              }
            : {}),
        };
      });
    if (shared) {
      const active = retainContinuousBodyContacts(
        ball.position,
        candidates,
        state.ball.continuousBodyContacts,
      );
      state = { ...state, ball: { ...state.ball, continuousBodyContacts: active } };
    }
    const supports =
      shared && !handlers.bodyOnly
        ? candidates.filter((c) => state.ball.continuousBodyContacts?.includes(c.playerId!))
        : [];
    const footSupports =
      multi && !handlers.bodyOnly
        ? (state.continuousFootContacts ?? [])
            .map((c) => ({ contact: c, player: finalPlayers.find((p) => p.id === c.actorId)! }))
            .filter((c) => c.player)
        : [];
    const hasSupport = !!(supports.length || footSupports.length);
    const supportSpeedBound = Math.max(
      0,
      ...supports.map(
        (c) =>
          Math.hypot(c.centre.x - c.previousCentre!.x, c.centre.y - c.previousCentre!.y) / seconds,
      ),
      ...footSupports.map((c) => intervalFoot(c.player, c.contact.foot, 0).speedBound),
    );
    const advanceBall = (t: number) => {
      const flight = integrateBallFlight(ball, t, state.ballEnvironment);
      if (!hasSupport || t === 0) return flight;
      const supported = supportContinuousBodyContacts(
        flight.position,
        flight.velocity,
        [
          ...supports.map((c) => ({
            ...c,
            centre: {
              x: c.previousCentre!.x + ((c.centre.x - c.previousCentre!.x) * t) / seconds,
              y: c.previousCentre!.y + ((c.centre.y - c.previousCentre!.y) * t) / seconds,
              z: c.centre.z,
            },
          })),
          ...footSupports.map((c) => ({
            kind: 'defender' as const,
            playerId: c.player.id,
            radius: 0.035,
            centre: intervalFoot(c.player, c.contact.foot, t).position,
            previousCentre: intervalFoot(c.player, c.contact.foot, 0).position,
          })),
        ],
        t,
      );
      return { ...flight, ...supported };
    };
    if (hasSupport) integrated = advanceBall(seconds);
    let crossing = findPitchBoundaryCrossing(ball.position, integrated.position);
    if (crossing) {
      let low = 0,
        high = seconds;
      for (let i = 0; i < 32; i++) {
        const middle = (low + high) / 2;
        if (isBallWithinPlayingBoundary(advanceBall(middle).position)) low = middle;
        else high = middle;
      }
      crossing = {
        ...(findPitchBoundaryCrossing(ball.position, advanceBall(high).position) ?? crossing),
        segmentFraction: high / seconds,
      };
    }
    let body = findFirstBallContact({
      previous: ball.position,
      next: integrated.position,
      attackingTeam: { team: state.possessionTeam, endsSwitched: state.endsSwitched },
      candidates: shared
        ? candidates.filter((c) => !state.ball.continuousBodyContacts?.includes(c.playerId))
        : candidates,
    });
    if (
      body &&
      !body.playerId &&
      body.segmentFraction < 1e-7 &&
      state.lastBallContact?.kind === body.kind &&
      state.time - state.lastBallContact.at < 0.15
    )
      body = undefined;
    type Event = z.infer<typeof sharedContactEventSchema> & {
      hit?: ReturnType<typeof findStrikeIntervalContact>;
      bodyUnresolved?: string;
      participants?: string[];
    };
    const events: Event[] = [];
    if (multi) {
      const bodies = finalPlayers
        .filter((p) => clusterIds.has(p.id))
        .map((p) => playerAt(p, elapsed));
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i]!;
        const edge = supportedUprightPair(a, a, true)
          ? findPlayerMovementEdge(a, seconds, multiBodyMovementBounds(state, a))
          : undefined;
        if (edge)
          events.push({
            at: edge.at,
            rank: 1,
            key: `${a.id}:edge:${edge.axis}`,
            kind: 'player_edge',
            participants: [a.id],
          });
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j]!;
          const active =
            state.continuousPlayerContacts?.some(
              (c) => playerPairKey(...c.participants) === playerPairKey(a.id, b.id),
            ) ?? false;
          const hit = findPlayerBodyContact(a, b, seconds, active);
          if (hit)
            events.push({
              at: hit.at,
              rank: 1,
              key: playerPairKey(a.id, b.id),
              kind: 'player_cluster',
              participants: [a.id, b.id],
              ...(hit.unresolved ? { bodyUnresolved: hit.unresolved } : {}),
            });
        }
      }
    }
    if (!multi && moved.experimentalPlayerBodyImpulse && origins.size) {
      // A third solid body is outside the isolated pair approximation. Stop at its
      // witnessed encounter, rather than drifting a corrected player through it.
      for (const p of finalPlayers.filter((p) => origins.has(p.id))) {
        const current = playerAt(p, elapsed);
        for (const [axis, maximum] of [
          ['x', 104.6],
          ['y', 67.6],
        ] as const) {
          const edge =
            p.position[axis] < 0.4 ? 0.4 : p.position[axis] > maximum ? maximum : undefined;
          if (edge !== undefined && Math.abs(p.velocity[axis]) > 1e-12) {
            const at = (edge - current.position[axis]) / p.velocity[axis];
            if (at >= 0 && at <= seconds)
              events.push({
                at,
                rank: 1,
                key: `${p.id}:pitch-edge`,
                kind: 'player_constraint',
                playerId: p.id,
                bodyUnresolved: 'player_pitch_edge',
              });
          }
        }
        for (const q of finalPlayers.filter(
          (q) => q.id !== p.id && !pairIds.includes(q.id) && canParticipatePhysically(q),
        )) {
          const a = playerAt(p, elapsed),
            b = playerAt(q, elapsed);
          b.velocity = {
            x: (q.position.x - b.position.x) / seconds,
            y: (q.position.y - b.position.y) / seconds,
          };
          const hit = findPlayerBodyContact(a, b, seconds, false);
          if (hit)
            events.push({
              at: hit.at,
              rank: 1,
              key: `${p.id}:${q.id}`,
              kind: 'player_constraint',
              playerId: p.id,
            });
        }
      }
    }
    const challenge = shared ? state.defensiveChallenge : undefined;
    const attempt = challenge?.physicalAttempt;
    if (attempt && attempt.expiresAt <= end)
      events.push({
        at: Math.max(0, attempt.expiresAt - state.time),
        rank: 4,
        key: challenge!.id,
        kind: 'challenge_expiry',
      });
    const physicalPair = moved.experimentalPlayerBodyImpulse ? pairIntent : undefined;
    if (!multi && physicalPair && !pairServiced.has(physicalPair.id)) {
      const p = finalPlayers.find((p) => p.id === physicalPair.actorId);
      const q = finalPlayers.find((p) => p.id === physicalPair.opponentId);
      if (p && q && supportedUprightPair(p, q)) {
        const a = playerAt(p, elapsed),
          b = playerAt(q, elapsed);
        const active =
          state.continuousPlayerContacts?.some(
            (c) => playerPairKey(...c.participants) === playerPairKey(p.id, q.id),
          ) ?? false;
        const hit = findPlayerBodyContact(a, b, seconds, active);
        if (hit)
          events.push({
            at: hit.at,
            rank: 1,
            key: physicalPair.id,
            kind: 'challenge_body',
            playerId: p.id,
            ...(hit.unresolved ? { bodyUnresolved: hit.unresolved } : {}),
          });
      }
    } else if (!moved.experimentalPlayerBodyImpulse && attempt && challenge) {
      // A bounded swept torso contact witness, independent of ball reach. Initial
      // overlap is uncertainty, not a newly observed opponent impact.
      const p = finalPlayers.find((p) => p.id === challenge.actorId);
      const q = finalPlayers.find((p) => p.id === challenge.opponentId);
      if (p && q) {
        const a = bodyAt(before.get(p.id) ?? p, p, elapsed / dt);
        const b = bodyAt(before.get(q.id) ?? q, q, elapsed / dt);
        const x = a.position.x - b.position.x,
          y = a.position.y - b.position.y;
        const vx = (p.position.x - a.position.x - (q.position.x - b.position.x)) / seconds;
        const vy = (p.position.y - a.position.y - (q.position.y - b.position.y)) / seconds;
        const c = x * x + y * y - 0.68 ** 2,
          v = vx * vx + vy * vy,
          dot = x * vx + y * vy;
        const discriminant = dot * dot - v * c;
        if (c >= 0 && v > 1e-12 && dot < 0 && discriminant >= 0) {
          const at = (-dot - Math.sqrt(discriminant)) / v;
          if (at >= 0 && at <= seconds && state.time + at <= attempt.expiresAt)
            events.push({ at, rank: 1, key: challenge.id, kind: 'challenge_body', playerId: p.id });
        }
      }
    }
    if (state.pendingStrike && state.pendingStrike.expiresAt <= end)
      events.push({
        at: Math.max(0, state.pendingStrike.expiresAt - state.time),
        rank: 4,
        key: 'swing_expired',
        kind: 'expiry',
      });
    if (crossing && !handlers.bodyOnly)
      events.push({
        at: seconds * crossing.segmentFraction,
        rank: 0,
        key: crossing.boundary,
        kind: 'boundary',
      });
    if (
      !handlers.bodyOnly &&
      body &&
      (body.playerId || ['left_post', 'right_post', 'crossbar'].includes(body.kind))
    )
      events.push({
        at: seconds * body.segmentFraction,
        rank: 1,
        key: body.playerId ?? body.kind,
        kind: 'body',
        ...(body.playerId ? { playerId: body.playerId } : {}),
      });
    for (const p of finalPlayers) {
      if (handlers.bodyOnly) continue;
      if (uncertainActors.has(p.id)) continue;
      if (
        excluded.has(p.id) &&
        p.id !== state.pendingStrike?.actorId &&
        !state.recoveringFeet?.some((f) => f.actorId === p.id)
      )
        continue;
      if (
        !canParticipatePhysically(p) ||
        state.discipline?.[p.id]?.sentOff ||
        !canContactAfterThrowIn(state, p.id)
      )
        continue;
      const origin = origins.get(p.id);
      const a = origin?.player ?? before.get(p.id) ?? p;
      const own = p.id === state.pendingStrike?.actorId ? state.pendingStrike : undefined;
      const defending = p.id === challenge?.actorId ? attempt : undefined;
      const travel = Math.hypot(p.position.x - a.position.x, p.position.y - a.position.y);
      // Broad phase only; the inherited reach is never a collision envelope.
      if (
        Math.hypot(p.position.x - state.ball.x, p.position.y - state.ball.y) >
        1.5 + travel + Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z) * seconds
      )
        continue;
      const prepared = own ?? defending;
      const carrying = multi && state.ball.ownerId === p.id && !own;
      const readyAt = carrying
        ? Math.max(
            motorContactReadyAt(state, p.id),
            state.controlledBallContact?.nextContact.earliestAt ?? state.time,
          )
        : motorContactReadyAt(state, p.id);
      for (const foot of prepared && !multi ? [prepared.plan.foot] : (['left', 'right'] as const)) {
        const selected = prepared?.plan.foot === foot;
        const recovery = state.recoveringFeet?.find((f) => f.actorId === p.id && f.foot === foot);
        const footAt = (t: number) => intervalFoot(p, foot, t);
        if (
          shared &&
          state.continuousFootContacts?.some((c) => c.actorId === p.id && c.foot === foot)
        ) {
          const f = footAt(0).position;
          if (
            Math.hypot(f.x - ball.position.x, f.y - ball.position.y, f.z - ball.position.z) <= 0.155
          )
            continue;
          state = {
            ...state,
            continuousFootContacts: state.continuousFootContacts.filter(
              (c) => c.actorId !== p.id || c.foot !== foot,
            ),
          };
        }
        const hit = findStrikeIntervalContact(
          state,
          selected ? Math.min(seconds, Math.max(0, prepared.expiresAt - state.time)) : seconds,
          footAt,
          undefined,
          multi ? MULTI_BODY.footEvaluations : undefined,
          hasSupport ? advanceBall : undefined,
          2 * supportSpeedBound,
        );
        evaluations += hit.evaluations;
        if (hit.outcome === 'clear') continue;
        // Uncertain competing geometry blocks the planned impulse conservatively.
        events.push({
          at: hit.local,
          rank: hit.outcome === 'unresolved' ? 1 : own && selected ? 3 : 2,
          key: `${p.id}:${foot}`,
          kind:
            hit.outcome === 'unresolved'
              ? multi && hit.reason === 'bounded_search_exhausted' && hit.local > 1e-10
                ? 'search_frontier'
                : multi && hit.reason === 'grazing_or_separating' && !selected && hit.foot
                  ? 'separating_foot'
                  : 'uncertain'
              : own && selected
                ? 'strike'
                : defending && selected
                  ? 'challenge'
                  : prepared || recovery || state.time + hit.local < readyAt - 1e-9
                    ? 'passive_foot'
                    : 'foot',
          playerId: p.id,
          hit,
        });
      }
    }
    // Exact numeric time first; only events in the same 1ns bucket use legal/body/foot/strike and stable identity.
    events.sort(compareSharedContactEvents);
    const event = events[0];
    if (!event) {
      if (!handlers.bodyOnly) state = advanceBallState(state, integrated, seconds);
      elapsed = dt;
      break;
    }
    const incoming = event.at > 0 ? advanceBall(event.at) : ball;
    elapsed += event.at;
    const unchangedBall = state.ball;
    state = advanceBallState(
      {
        ...state,
        time: start + elapsed,
        players: finalPlayers.map((p) => playerAt(p, elapsed)),
      },
      incoming,
      event.at,
    );
    if (handlers.bodyOnly) state = { ...state, ball: unchangedBall };
    // Conservative advancement has certified this entire prefix as clear.
    // Consume only that prefix, then search the remainder in the same timeline.
    // This is neither an impulse nor a miss. The existing 16-event frame bound
    // still owns exhaustion, which remains an explicit unresolved halt.
    if (event.kind === 'search_frontier') continue;
    if (event.kind === 'separating_foot') {
      // A passive surface that is already separating has zero normal impulse.
      // Retain its unilateral support until real clearance, without counting a
      // strike/control/touch or interrupting the still-live selected action.
      state = {
        ...state,
        continuousFootContacts: [
          ...(state.continuousFootContacts ?? []),
          { actorId: event.playerId!, foot: event.key.endsWith(':left') ? 'left' : 'right' },
        ].slice(-44),
      };
      continue;
    }
    if (event.kind === 'player_cluster' || event.kind === 'player_edge') {
      const result = resolveMultiBodyContact(state, event.participants!, state.time);
      state = recordExecution(
        state,
        'body-cluster',
        'pendingStrikeInterval.resolveMultiBodyContact',
        result.contacts.filter((c) => c.kind === 'impact').length,
      );
      // The one nominal actuator update belongs to the tick, not each impact.
      // Repeated actor/tick records are the same work witness and must be deduplicated.
      result.evidence.motorWorkAt = start;
      result.evidence.motorWork = result.players.map((p) => {
        const prior = before.get(p.id) ?? p;
        const motor = nominalPlayers.find((q) => q.id === p.id) ?? p;
        return {
          actorId: p.id,
          mass: p.profile.weightKg,
          beforeVelocity: prior.velocity,
          actuatorVelocity: motor.velocity,
          kineticWork:
            0.5 *
            p.profile.weightKg *
            (motor.velocity.x ** 2 +
              motor.velocity.y ** 2 -
              prior.velocity.x ** 2 -
              prior.velocity.y ** 2),
        };
      });
      if (event.bodyUnresolved === 'near_tangent_body') {
        result.evidence.reason = 'near_tangent_body';
        result.evidence.unresolved = true;
      }
      for (const c of result.contacts) {
        c.remainderSeconds = dt - elapsed;
        c.locomotionWorkAfter = 0;
      }
      state = {
        ...state,
        multiBodyResolutions: [...(state.multiBodyResolutions ?? []), result.evidence],
        playerBodyContacts: [
          ...(state.playerBodyContacts ?? []),
          ...result.contacts.filter(
            (c, i, all) =>
              all.findIndex(
                (q) => playerPairKey(...q.participants) === playerPairKey(...c.participants),
              ) === i,
          ),
        ].slice(-8),
        continuousPlayerContacts: result.continuous,
      };
      // Reuse the existing selected challenge referee for its actual fresh body
      // event, without finishing/counting the still-live standing foot twice.
      const selectedImpact =
        pairIntent &&
        result.contacts.find(
          (c) =>
            c.kind === 'impact' &&
            playerPairKey(...c.participants) ===
              playerPairKey(pairIntent.actorId, pairIntent.opponentId),
        );
      if (selectedImpact && pairIntent) {
        const law = resolveDefensiveChallenge(
          { ...state, defensiveChallenge: pairIntent },
          { kind: 'body', reason: 'swept_torso_contact' },
        );
        selectedImpact.refereeOutcome = law.diagnostic?.outcome ?? 'unresolved';
        if (law.diagnostic) state = handlers.challenge?.(state, law.diagnostic) ?? state;
      }
      for (const p of result.players) rebasePlayer(p);
      state = {
        ...state,
        players: state.players.map((p) => result.players.find((q) => q.id === p.id) ?? p),
      };
      if (result.evidence.unresolved) {
        state = recordExecution(state, 'unresolved', result.evidence.reason, 1);
        transportEnd = elapsed;
        for (const p of state.players.filter((p) => clusterIds.has(p.id) || origins.has(p.id)))
          finalPlayers = finalPlayers.map((q) =>
            q.id === p.id ? { ...q, position: p.position } : q,
          );
        state = finishPendingStrike(state, 'unresolved', result.evidence.reason, state.time, {
          evaluations,
        });
        if (pending && state.lastStrikeResolution?.id === pending.id)
          state = {
            ...state,
            lastStrikeResolution: {
              ...state.lastStrikeResolution,
              continuationUnresolvedReason: result.evidence.reason,
            },
          };
        state = {
          ...state,
          playerBodyContacts: (state.playerBodyContacts ?? []).map((c) => ({
            ...c,
            continuationUnresolvedReason: result.evidence.reason,
          })),
        };
        if (state.defensiveChallenge?.physicalAttempt)
          resolveChallenge('unresolved', result.evidence.reason);
        return restoreClock(state);
      }
      if (interruptedByLaw(state)) {
        state = finishPendingStrike(state, 'interrupted', 'law_interruption');
        return restoreClock(state);
      }
      continue;
    }
    if (event.kind === 'challenge_expiry') {
      resolveChallenge('miss', 'swing_completed_without_contact');
      continue;
    }
    if (event.kind === 'player_constraint') {
      transportEnd = elapsed;
      const reason = event.bodyUnresolved ?? 'third_body_remainder';
      for (const p of state.players.filter((p) => origins.has(p.id)))
        finalPlayers = finalPlayers.map((q) =>
          q.id === p.id ? { ...q, position: p.position } : q,
        );
      state = finishPendingStrike(state, 'unresolved', reason, state.time, {
        evaluations,
      });
      state = {
        ...state,
        playerBodyContacts: (state.playerBodyContacts ?? []).map((c) => ({
          ...c,
          continuationUnresolvedReason: reason,
        })),
      };
      if (pending && state.lastStrikeResolution?.id === pending.id)
        state = {
          ...state,
          lastStrikeResolution: {
            ...state.lastStrikeResolution,
            continuationUnresolvedReason: reason,
          },
        };
      if (state.defensiveChallenge?.physicalAttempt) resolveChallenge('unresolved', reason);
      return restoreClock(state);
    }
    if (event.kind === 'challenge_body') {
      if (moved.experimentalPlayerBodyImpulse && pairIntent) {
        pairServiced.add(pairIntent.id);
        const a = state.players.find((p) => p.id === pairIntent.actorId)!;
        const b = state.players.find((p) => p.id === pairIntent.opponentId)!;
        const active =
          state.continuousPlayerContacts?.some(
            (c) => playerPairKey(...c.participants) === playerPairKey(a.id, b.id),
          ) ?? false;
        const unresolved = event.bodyUnresolved;
        const result = resolvePlayerBodyImpulse(a, b, state.time, active, undefined, unresolved);
        result.evidence.remainderSeconds = dt - elapsed;
        result.evidence.positionsAtContact = [a.position, b.position];
        result.evidence.remainderPositions = result.players.map((p) =>
          integrateCanonicalBodyRemainder(p, dt - elapsed),
        ) as [MatchPlayerState['position'], MatchPlayerState['position']];
        result.evidence.locomotionWorkBefore = [a, b].reduce((sum, p) => {
          const previous = before.get(p.id) ?? p;
          return (
            sum +
            0.5 *
              p.profile.weightKg *
              (p.velocity.x ** 2 +
                p.velocity.y ** 2 -
                previous.velocity.x ** 2 -
                previous.velocity.y ** 2)
          );
        }, 0);
        result.evidence.locomotionWorkAfter = 0;
        state = {
          ...state,
          playerBodyContacts: [...(state.playerBodyContacts ?? []), result.evidence].slice(-8),
        };
        if (result.evidence.kind === 'unresolved') continue;
        if (!active && result.evidence.kind === 'impact') {
          state = {
            ...state,
            continuousPlayerContacts: [
              ...(state.continuousPlayerContacts ?? []),
              { participants: [a.id, b.id] as [string, string], beganAt: state.time },
            ].slice(-22),
          };
          // Assess the separate body event with the existing referee consumer. Do not
          // finish the still-live foot attempt or count it twice as a discrete duel.
          const law = resolveDefensiveChallenge(
            { ...state, defensiveChallenge: pairIntent },
            { kind: 'body', reason: 'swept_torso_contact' },
          );
          result.evidence.refereeOutcome = law.diagnostic?.outcome ?? 'unresolved';
          if (law.diagnostic) state = handlers.challenge?.(state, law.diagnostic) ?? state;
        }
        for (const p of result.players) {
          rebasePlayer(p);
        }
        state = {
          ...state,
          players: state.players.map((p) => result.players.find((q) => q.id === p.id) ?? p),
        };
        if (interruptedByLaw(state)) {
          state = finishPendingStrike(state, 'interrupted', 'law_interruption');
          return restoreClock(state);
        }
        continue;
      }
      state = finishPendingStrike(state, 'interrupted', 'active_body_contact', state.time, {
        evaluations,
        firstEvent: event.key,
      });
      resolveChallenge('body', 'swept_torso_contact');
      if (interruptedByLaw(state)) return restoreClock(state);
      // The standing-body impulse model is not established. Keep a conservative
      // diagnostic continuation rather than inventing a knockdown or displacement.
      if (state.lastStrikeResolution)
        state = {
          ...state,
          lastStrikeResolution: {
            ...state.lastStrikeResolution,
            continuationUnresolvedReason: 'body_impulse_not_supported',
          },
        };
      return restoreClock(state);
    }
    if (event.kind === 'expiry') {
      state = finishPendingStrike(state, 'miss', 'swing_completed_without_contact', state.time, {
        evaluations,
      });
      continue;
    }
    if (event.kind === 'boundary') {
      if (attempt) resolveChallenge('interrupted', 'boundary');
      state = finishPendingStrike(state, 'interrupted', 'boundary', state.time, {
        evaluations,
        firstEvent: crossing!.boundary,
      });
      if (shared)
        return restoreClock(
          handlers.boundary(state, { ...crossing!, segmentFraction: 1 }, ball.position, event.at),
        );
      // Preserve the raw unstruck endpoint for existing incidental-goal/boundary laws.
      const atEnd = withPhysicalStrikeBall({ ...state, time: end }, integrated);
      return restoreClock(handlers.boundary(atEnd, crossing!, ball.position, seconds));
    }
    if (event.kind === 'uncertain') {
      if (multi) {
        const hit = event.hit!;
        const foot = 'foot' in hit ? hit.foot : undefined;
        const normal = 'normal' in hit ? hit.normal : undefined;
        const reason = hit.reason ?? 'uncertain_contact';
        state = recordExecution(state, 'unresolved', reason, 1);
        state = {
          ...state,
          safetyHalt: {
            ...haltEvidence(state, 'physical_contact', reason, start),
            actorIds: [event.playerId!],
            ...(state.pendingStrike ? { actionId: state.pendingStrike.id } : {}),
            ...(foot
              ? {
                  foot: foot.position,
                  footVelocity: foot.velocity,
                  footRadius: 0.035,
                  ballRadius: 0.11,
                  gap:
                    Math.hypot(
                      foot.position.x - incoming.position.x,
                      foot.position.y - incoming.position.y,
                      foot.position.z - incoming.position.z,
                    ) - 0.145,
                  ...(normal
                    ? {
                        relativeClosingSpeed:
                          (foot.velocity.x - incoming.velocity.x) * normal.x +
                          (foot.velocity.y - incoming.velocity.y) * normal.y +
                          (foot.velocity.z - incoming.velocity.z) * normal.z,
                      }
                    : {}),
                }
              : {}),
          },
        };
        return restoreClock(state);
      }
      uncertainActors.add(event.playerId!);
      state = recordExecution(state, 'unresolved', event.hit?.reason ?? 'uncertain_contact', 1);
      state = finishPendingStrike(
        state,
        'unresolved',
        event.hit?.reason ?? 'uncertain_contact',
        state.time,
        { evaluations, firstEvent: event.key },
      );
      // No speculative impulse. Re-run this same interval with the uncertain actor excluded;
      // real other bodies and boundaries still have authority over unstruck continuation.
      if (attempt && event.playerId === challenge?.actorId)
        resolveChallenge('unresolved', event.hit?.reason ?? 'uncertain_contact');
      excluded.add(event.playerId!);
      continue;
    }
    if (event.kind === 'body' && !event.playerId) {
      state = finishPendingStrike(state, 'interrupted', 'goal_frame', state.time, {
        evaluations,
        firstEvent: body!.kind,
      });
      const rebound = resolveBallRebound(
        body!.kind,
        incoming.velocity,
        { team: state.possessionTeam, endsSwitched: state.endsSwitched },
        incoming.spin,
      );
      state = {
        ...state,
        ballEpisode: (state.ballEpisode ?? 0) + 1,
        ball: {
          ...state.ball,
          velocity: rebound.velocity,
          ...(rebound.spin ? { spin: rebound.spin } : {}),
        },
        lastBallContact: {
          ...body!,
          at: state.time,
          preContactSpeed: Math.hypot(
            incoming.velocity.x,
            incoming.velocity.y,
            incoming.velocity.z,
          ),
          postContactSpeed: Math.hypot(rebound.velocity.x, rebound.velocity.y, rebound.velocity.z),
        },
      };
      continue;
    }
    const actor = state.players.find((p) => p.id === event.playerId)!;
    if (
      event.hit?.foot &&
      actor.lowerBodyPose?.reachOffset &&
      Math.hypot(actor.lowerBodyPose.reachOffset.x, actor.lowerBodyPose.reachOffset.y) > 1e-9
    ) {
      // The motor has reached an actual surface. Stop its remaining ankle command;
      // do not restore the planned penetrating endpoint after control or rebound.
      finalPlayers = finalPlayers.map((p) =>
        p.id === actor.id ? { ...p, lowerBodyPose: actor.lowerBodyPose } : p,
      );
      rebasePlayer(actor);
    }
    if (event.kind === 'passive_foot') {
      state = handlers.body(state, actor.id);
      if (interruptedByLaw(state))
        return restoreClock(finishPendingStrike(state, 'interrupted', 'law_interruption'));
      passiveFoot(actor, event.key, event.hit!);
      continue;
    }
    if (event.kind === 'challenge') {
      const hit = event.hit!;
      const contact =
        hit.foot && hit.normal
          ? executePendingContact(state, actor, hit.foot, hit.normal, attempt!)
          : undefined;
      state = recordExecution(
        state,
        'standing-challenge',
        'pendingStrikeInterval.executePendingContact',
        contact?.available ? 1 : 0,
      );
      if (!contact?.available) {
        resolveChallenge('unresolved', contact?.unavailableReason ?? 'current_capability');
        excluded.add(actor.id);
        continue;
      }
      // The same actual-contact law/lineage observer as passive deflection.
      // It can end play; it never awards this foot secure possession.
      state = handlers.body(state, actor.id);
      if (interruptedByLaw(state)) {
        resolveChallenge('interrupted', 'law_interruption');
        return restoreClock(state);
      }
      state = finishPendingStrike(state, 'interrupted', 'active_challenge', state.time, {
        evaluations,
        firstEvent: event.key,
        contact,
      });
      state = {
        ...state,
        ballEpisode: (state.ballEpisode ?? 0) + 1,
        ball: {
          x: state.ball.x,
          y: state.ball.y,
          ...(moved.experimentalPlayerBodyImpulse && state.ball.continuousBodyContacts
            ? { continuousBodyContacts: state.ball.continuousBodyContacts }
            : {}),
          height: state.ball.height ?? 0.11,
          velocity: contact.outgoingVelocity,
          spin: contact.outgoingSpin,
          airborne: state.ball.airborne ?? false,
          bounceCount: state.ball.bounceCount ?? 0,
          looseSince: state.time,
          lastTouchPlayerId: actor.id,
        },
        continuousFootContacts: [
          ...(state.continuousFootContacts ?? []),
          {
            actorId: actor.id,
            foot: contact.foot,
            ...(moved.experimentalPlayerBodyImpulse
              ? {
                  prepared: {
                    path: attempt!.path,
                    facingAngle: attempt!.plan.facingAngle,
                    selectedAt: attempt!.selectedAt,
                  },
                }
              : {}),
          },
        ].slice(-44),
        lastGroundContact: {
          actorId: actor.id,
          at: state.time,
          region: contact.foot === 'left' ? 'left_foot' : 'right_foot',
          point: { x: state.ball.x, y: state.ball.y },
          incomingVelocity: contact.incomingVelocity,
          outgoingVelocity: contact.outgoingVelocity,
          quality: contact.quality,
          retained: false,
          executed: true,
          physicalCount: 1,
          surfaceContact: contact,
        },
      };
      delete state.ballAcquisition;
      resolveChallenge('ball', 'foot_ball_intersection', contact);
      excluded.add(actor.id);
      continue;
    }
    if (event.kind === 'strike') {
      const hit = event.hit!;
      const contact =
        'foot' in hit && hit.foot && 'normal' in hit && hit.normal
          ? executePendingContact(state, actor, hit.foot, hit.normal)
          : undefined;
      if (!contact?.available) {
        state = finishPendingStrike(
          state,
          'cancelled',
          contact?.unavailableReason ?? 'current_capability',
          state.time,
          { evaluations },
        );
        continue;
      }
      const p = state.pendingStrike!;
      const offsideSnapshot = captureOffsideSnapshot(state, p.action);
      state = finishPendingStrike(state, 'contact', 'foot_ball_intersection', state.time, {
        evaluations,
        contact,
        foot: hit.foot!.position,
        footVelocity: hit.foot!.velocity,
        firstEvent: 'intentional_foot',
      });
      const velocity = contact.outgoingVelocity;
      state = {
        ...state,
        ballEpisode: (state.ballEpisode ?? 0) + 1,
        ...(offsideSnapshot ? { offsideSnapshot } : {}),
        ...(moved.experimentalPlayerBodyImpulse
          ? {
              continuousFootContacts: [
                ...(state.continuousFootContacts ?? []),
                {
                  actorId: actor.id,
                  foot: p.plan.foot,
                  prepared: {
                    path: p.path,
                    facingAngle: p.plan.facingAngle,
                    selectedAt: p.selectedAt,
                  },
                },
              ].slice(-44),
            }
          : {}),
        ball: {
          x: state.ball.x,
          y: state.ball.y,
          ...(moved.experimentalPlayerBodyImpulse && state.ball.continuousBodyContacts
            ? { continuousBodyContacts: state.ball.continuousBodyContacts }
            : {}),
          height: state.ball.height ?? 0.11,
          from: { x: state.ball.x, y: state.ball.y },
          target: p.passDiagnostic.intendedTarget ?? p.passDiagnostic.predictedReceptionPoint,
          intendedReceiverId: p.passDiagnostic.intendedReceiverId,
          travelKind: p.passDiagnostic.intent === 'through' ? 'through_ball' : 'pass',
          sourceAction: 'pass',
          ...(p.passDiagnostic.executionType
            ? { executionType: p.passDiagnostic.executionType }
            : {}),
          flightTime: 0,
          distanceTravelled: 0,
          velocity,
          launchVelocity: velocity,
          launchSpeed: Math.hypot(velocity.x, velocity.y, velocity.z),
          launchElevation: Math.atan2(velocity.z, Math.hypot(velocity.x, velocity.y)),
          spin: contact.outgoingSpin,
          airborne: velocity.z > 0 || incoming.position.z > 0.11,
          bounceCount: incoming.bounceCount,
          lastTouchPlayerId: actor.id,
        },
        lastPassDiagnostic: {
          ...p.passDiagnostic,
          releasedAt: state.time,
          passId: p.id,
          receiverPositionAtRelease: {
            ...state.players.find((a) => a.id === p.passDiagnostic.intendedReceiverId)!.position,
          },
        } as NonNullable<TacticalMatchState['lastPassDiagnostic']>,
        lastGroundContact: {
          actorId: actor.id,
          at: state.time,
          region: p.plan.foot === 'left' ? 'left_foot' : 'right_foot',
          point: { x: state.ball.x, y: state.ball.y },
          incomingVelocity: contact.incomingVelocity,
          outgoingVelocity: velocity,
          quality: contact.quality,
          retained: false,
          executed: true,
          physicalCount: 1,
          surfaceContact: contact,
        },
      };
    } else {
      state = finishPendingStrike(
        state,
        'interrupted',
        event.kind === 'foot' ? 'competing_foot' : 'passive_body',
        state.time,
        { evaluations, firstEvent: event.key },
      );
      if (event.kind === 'foot') {
        if (multi && state.ball.ownerId === actor.id) {
          const carried = advanceControlledBall(
            state,
            actor,
            0,
            event.key.endsWith(':left') ? 'left' : 'right',
            undefined,
            'contact',
          );
          state = carried.state;
          if (carried.looseVelocity) {
            state = { ...state, ball: { ...state.ball, looseSince: state.time } };
            delete state.ball.ownerId;
          }
        } else {
          // Another real foot can end protected control. The reception consumer
          // must see the actual free ball, not the previous owner's claim.
          if (multi && state.ball.ownerId) {
            state = { ...state, ball: { ...state.ball, looseSince: state.time } };
            delete state.ball.ownerId;
          }
          state = handlers.control(state, actor.id);
        }
        if (!(state.lastGroundContact?.at === state.time && state.lastGroundContact.executed))
          passiveFoot(actor, event.key, event.hit!);
        if (
          shared &&
          state.lastGroundContact?.at === state.time &&
          state.lastGroundContact.surfaceContact?.available
        )
          state = {
            ...state,
            continuousFootContacts: [
              ...(state.continuousFootContacts ?? []),
              { actorId: actor.id, foot: state.lastGroundContact.surfaceContact.foot },
            ].slice(-44),
          };
        const changedActor = state.players.find((p) => p.id === actor.id);
        if (
          changedActor &&
          (changedActor.velocity.x !== actor.velocity.x ||
            changedActor.velocity.y !== actor.velocity.y)
        )
          if (moved.experimentalPlayerBodyImpulse) rebasePlayer(changedActor);
          else changedVelocities.set(actor.id, changedActor.velocity);
        const contact =
          state.lastGroundContact?.actorId === actor.id && state.lastGroundContact.at === state.time
            ? state.lastGroundContact.surfaceContact
            : undefined;
        if (pending && state.lastStrikeResolution?.id === pending.id && contact)
          state = { ...state, lastStrikeResolution: { ...state.lastStrikeResolution, contact } };
        if (multi) releaseSeparatedControl();
      } else {
        state = recordExecution(
          state,
          'ball-body-contact',
          'pendingStrikeInterval.resolveBallRebound',
          1,
        );
        if (shared)
          state = {
            ...state,
            ball: {
              ...state.ball,
              continuousBodyContacts: [
                ...new Set([...(state.ball.continuousBodyContacts ?? []), actor.id]),
              ],
            },
          };
        const rebound = resolveBallRebound(
          body!.kind,
          incoming.velocity,
          { team: state.possessionTeam, endsSwitched: state.endsSwitched },
          incoming.spin,
          {
            surfaceNormal: body!.surfaceNormal,
            point: incoming.position,
            surfaceVelocity: { ...actor.velocity, z: 0 },
          },
        );
        state = handlers.body(state, actor.id);
        if (interruptedByLaw(state)) return restoreClock(state);
        state = {
          ...state,
          ball: {
            ...state.ball,
            velocity: rebound.velocity,
            ...(rebound.spin ? { spin: rebound.spin } : {}),
            lastTouchPlayerId: actor.id,
          },
          lastBallContact: {
            ...body!,
            at: state.time,
            preContactSpeed: Math.hypot(
              incoming.velocity.x,
              incoming.velocity.y,
              incoming.velocity.z,
            ),
            postContactSpeed: Math.hypot(
              rebound.velocity.x,
              rebound.velocity.y,
              rebound.velocity.z,
            ),
          },
        };
      }
      if (
        isRestartSetup(state) ||
        (state.scenario !== 'open_play' && state.restart?.phase !== 'release') ||
        state.postGoal ||
        state.ball.heldByKeeperId
      )
        return restoreClock(state);
    }
    if (!shared) excluded.add(actor.id);
  }
  if (elapsed < dt - 1e-12) {
    state = recordExecution(state, 'unresolved', 'pendingStrikeInterval.event_budget', 1);
    if (multi) {
      transportEnd = elapsed;
      for (const p of finalPlayers.filter((p) => clusterIds.has(p.id) || origins.has(p.id))) {
        const atStop = playerAt(p, elapsed);
        finalPlayers = finalPlayers.map((q) =>
          q.id === p.id ? { ...q, position: atStop.position } : q,
        );
      }
      state = {
        ...state,
        playerBodyContacts: (state.playerBodyContacts ?? []).map((c) => ({
          ...c,
          continuationUnresolvedReason: 'event_budget',
        })),
      };
    }
    // Event budget exhausted: preserve uncertain evidence, never fabricate a clean miss.
    state = finishPendingStrike(state, 'unresolved', 'event_budget', state.time, { evaluations });
    if (pending && state.lastStrikeResolution?.id === pending.id)
      state = {
        ...state,
        lastStrikeResolution: {
          ...state.lastStrikeResolution,
          continuationUnresolvedReason: 'event_budget',
        },
      };
    // Conservative stop at the last witnessed contact, as in the existing loose-ball CCD remainder.
  }
  state = restoreClock(state);
  if (multi && !handlers.bodyOnly) releaseSeparatedControl();
  if (state.pendingStrike && end >= state.pendingStrike.expiresAt - 1e-9)
    return finishPendingStrike(state, 'miss', 'swing_completed_without_contact', end, {
      evaluations,
    });
  if (state.pendingStrike)
    state = {
      ...state,
      pendingStrike: {
        ...state.pendingStrike,
        phase:
          end - state.pendingStrike.selectedAt >= state.pendingStrike.path.onset
            ? 'swinging'
            : 'preparing',
      },
    };
  return state;
};
