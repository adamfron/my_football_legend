import { BALL_RADIUS, PASSIVE_OUTFIELD_BODY, UPRIGHT_OUTFIELD_BALL_BODY } from './ballFlight';
import { composeArticulatedLegs, effectiveArticulatedFoot } from './articulatedBody';
import { hasIndividualLowerBody, individualHipOffset } from './bodyMorphology';
import {
  composedContactSurface,
  firstComposedLegContact,
  observeOpposingShinPressure,
  shinSwingRecoil,
  touchingComposedLeg,
} from './composedLegContact';
import { affineBootClearOfBallFlight, minimumQuadratic } from './composedLegCurvature';
import { deriveLowerBodyGeometry, interpolateLowerBodyPose } from './lowerBodyGeometry';
import {
  advanceDynamicBalance,
  dynamicContactMobility,
  interpolateDynamicBalance,
  loadDynamicBalance,
  swingShankAndFootMass,
} from './dynamicBalance';
import {
  advanceArticulatedStance,
  continueParkedArticulatedStance,
  SWING_METRES_PER_SECOND,
} from './articulatedGait';
import {
  activeArticulatedFoot,
  MAX_GROUNDED_SUPPORT_HEIGHT,
  postImpactStanceEditionSchema,
  type BodyPoint,
} from './articulatedBodyState';
import { compareSharedContactEvents, type sharedContactEventSchema } from './sharedContactTimeline';
import { recordExecution } from './executionWitness';
import {
  contactWorkTraceEnabled,
  receptionMechanicsTraceEnabled,
  receptionTraceEnabled,
  traceReception,
} from './receptionTrace';
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
  type playerBodyContactSchema,
} from './playerBodyContact';
import { resolveDefensiveChallenge, type ChallengeDiagnostic } from './defensiveChallenges';
import { executeFootContact } from './footContact';
import {
  ballLinearImpulse,
  COMPOSED_LIMB_IMPACT,
  measureBallContactWork,
  retainContinuousBodyContacts,
  resolveComposedLimbImpact,
  resolveOpposingBallContactImpulse,
  supportContinuousBodyContacts,
} from './ballContactResolution';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  findPitchBoundaryCrossing,
  isBallWithinPlayingBoundary,
  type PitchBoundaryCrossing,
} from './pitchBoundary';
import { findFirstBallContact, resolveBallRebound, type ContactCandidate } from './ballFlight';
import {
  BALL_PHYSICS,
  ZERO_BALL_SPIN,
  dragAcceleration,
  firstGroundImpactTime,
  integrateBallFlight,
  magnusAcceleration,
} from './ballPhysics';
import { canParticipatePhysically } from './matchInjuries';
import { motorContactReadyAt, advanceControlledBall } from './ballContactGeometry';
import { canContactAfterThrowIn } from './throwIn';
import { captureOffsideSnapshot } from './offside';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { GOALKEEPER_PHYSICS } from './goalkeeperIntervention';
import { isRestartSetup } from './restartPhase';
import { haltEvidence } from './matchSafety';
import {
  executePendingContact,
  findStrikeIntervalContact,
  finishPendingStrike,
  beginFootRecovery,
  physicalStrikeBall,
  withPhysicalStrikeBall,
} from './pendingStrike';

type EventLegHit = Extract<
  NonNullable<ReturnType<typeof firstComposedLegContact>>,
  { kind: 'contact' }
>;

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
  control: (
    state: TacticalMatchState,
    actorId: string,
    contact: { foot: 'left' | 'right'; normal: BodyPoint },
  ) => TacticalMatchState;
  body: (state: TacticalMatchState, actorId: string) => TacticalMatchState;
};

const bodyAt = (
  a: MatchPlayerState,
  b: MatchPlayerState,
  fraction: number,
  seconds: number,
  parked = false,
): MatchPlayerState => ({
  ...b,
  ...(a.articulatedStance && b.articulatedStance
    ? {
        articulatedStance: {
          ...a.articulatedStance,
          ...(a.articulatedStance.dynamicBalance
            ? {
                dynamicBalance: interpolateDynamicBalance(
                  a.articulatedStance.dynamicBalance,
                  b.articulatedStance.dynamicBalance,
                  fraction,
                ),
              }
            : {}),
          ...(fraction >= 1
            ? {
                support: b.articulatedStance.support,
                supportYaw: b.articulatedStance.supportYaw,
                stepSeconds: b.articulatedStance.stepSeconds,
              }
            : {}),
          elapsed:
            parked || fraction >= 1
              ? b.articulatedStance.elapsed
              : Math.min(
                  a.articulatedStance.stepSeconds,
                  a.articulatedStance.elapsed + seconds * fraction,
                ),
          angularVelocity: b.articulatedStance.angularVelocity,
          left: {
            x:
              a.articulatedStance.left.x +
              (b.articulatedStance.left.x - a.articulatedStance.left.x) * fraction,
            y:
              a.articulatedStance.left.y +
              (b.articulatedStance.left.y - a.articulatedStance.left.y) * fraction,
            z:
              a.articulatedStance.left.z +
              (b.articulatedStance.left.z - a.articulatedStance.left.z) * fraction,
          },
          right: {
            x:
              a.articulatedStance.right.x +
              (b.articulatedStance.right.x - a.articulatedStance.right.x) * fraction,
            y:
              a.articulatedStance.right.y +
              (b.articulatedStance.right.y - a.articulatedStance.right.y) * fraction,
            z:
              a.articulatedStance.right.z +
              (b.articulatedStance.right.z - a.articulatedStance.right.z) * fraction,
          },
        },
      }
    : {}),
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
  const preserveParkedStance =
    moved.experimentalPostImpactStance === postImpactStanceEditionSchema.value;
  const composedLegs = Boolean(moved.experimentalComposedLegContact && !handlers.bodyOnly);
  const coupledLimbImpulse = moved.experimentalComposedLegContact === 'composed-leg-impulse-dev-v2';
  const dynamicBalance = Boolean(moved.experimentalDynamicBalance);
  const traceWork = contactWorkTraceEnabled();
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
  const origins = new Map<string, { player: MatchPlayerState; at: number; parked?: true }>();
  const stoppedSwings = new Map<string, 'left' | 'right'>();
  const recheckLegs = dynamicBalance
    ? new Map<string, Set<ReturnType<typeof composedContactSurface>>>()
    : undefined;
  const travelled = new Map<string, number>();
  let transportEnd = dt;
  const playerAt = (p: MatchPlayerState, at: number) => {
    const origin = origins.get(p.id);
    const a = origin?.player ?? before.get(p.id) ?? p;
    const began = origin?.at ?? 0;
    const value = bodyAt(
      a,
      p,
      (at - began) / Math.max(1e-12, dt - began),
      dt - began,
      origin?.parked,
    );
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
                ...(p.articulatedStance
                  ? {
                      articulatedStance:
                        transportEnd < dt
                          ? playerAt(p, transportEnd).articulatedStance
                          : p.articulatedStance,
                    }
                  : {}),
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
  if (composedLegs) delete state.lastLimbContacts;
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
  type SwingYield = ReturnType<typeof shinSwingRecoil>;
  const rebasePlayer = (
    p: MatchPlayerState,
    {
      torsoImpact,
      stopSwing,
      limbImpact,
      swingYield,
    }: {
      torsoImpact?: boolean;
      stopSwing?: 'left' | 'right';
      limbImpact?: boolean;
      swingYield?: SwingYield;
    } = {},
  ) => {
    const old = finalPlayers.find((q) => q.id === p.id)!;
    const trace = receptionMechanicsTraceEnabled() && p.articulatedStance;
    const eventPlayer = trace || limbImpact ? playerAt(old, elapsed) : undefined;
    const segmentOrigin = trace ? (origins.get(p.id)?.player ?? before.get(p.id)) : undefined;
    const began = origins.get(p.id)?.at ?? 0;
    travelled.set(
      p.id,
      (travelled.get(p.id) ?? 0) + Math.hypot(old.velocity.x, old.velocity.y) * (elapsed - began),
    );
    origins.set(p.id, { player: p, at: elapsed });
    changedVelocities.set(p.id, stopSwing ? old.velocity : p.velocity);
    if (stopSwing) stoppedSwings.set(p.id, stopSwing);
    finalPlayers = finalPlayers.map((q) => {
      if (q.id !== p.id) return q;
      // The gait motor already produced this interval's ankle path. Add the
      // impulse's root displacement to the remaining chord without retargeting it.
      const position = limbImpact
        ? {
            x: q.position.x + (p.velocity.x - eventPlayer!.velocity.x) * (dt - elapsed),
            y: q.position.y + (p.velocity.y - eventPlayer!.velocity.y) * (dt - elapsed),
          }
        : stopSwing
          ? q.position
          : integrateCanonicalBodyRemainder(p, dt - elapsed);
      const endpoint = { ...q, position, velocity: stopSwing ? q.velocity : p.velocity };
      const activeFoot = p.articulatedStance ? activeArticulatedFoot(state, p.id) : undefined;
      const parked =
        preserveParkedStance && torsoImpact
          ? continueParkedArticulatedStance(p, endpoint, activeFoot)
          : undefined;
      if (parked)
        origins.set(p.id, {
          player: { ...p, articulatedStance: parked },
          at: elapsed,
          parked: true,
        });
      let stance = limbImpact
        ? q.articulatedStance
        : p.articulatedStance
          ? (parked ??
            advanceArticulatedStance(
              p,
              endpoint,
              dt - elapsed,
              activeFoot,
              q.articulatedStance?.angularVelocity,
            ))
          : undefined;
      if (stance && swingYield) {
        const { foot, x, y } = swingYield;
        const shifted = {
          ...stance,
          [foot]: { ...stance[foot], x: stance[foot].x + x, y: stance[foot].y + y },
        };
        const from = p.articulatedStance![foot];
        const to = shifted[foot];
        if (
          Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) <=
          SWING_METRES_PER_SECOND * (dt - elapsed)
        ) {
          try {
            deriveLowerBodyGeometry({ ...endpoint, articulatedStance: shifted });
            stance = shifted;
          } catch {
            // The authored workspace cannot take this ankle displacement.
          }
        }
      }
      const stopped = stoppedSwings.get(p.id);
      const endpointWithStance = {
        ...endpoint,
        ...(p.plantBalance ? { plantBalance: p.plantBalance } : {}),
        ...(stance
          ? {
              articulatedStance: stopped
                ? {
                    ...stance,
                    support: p.articulatedStance!.support,
                    [stopped]: p.articulatedStance![stopped],
                  }
                : stance,
            }
          : {}),
      };
      const next = dynamicBalance
        ? advanceDynamicBalance({ ...state, time: end }, p, endpointWithStance, dt - elapsed, true)
        : endpointWithStance;
      if (trace && eventPlayer)
        traceReception('pendingStrikeInterval.rebasePlayer', start + elapsed, p.id, {
          before: eventPlayer,
          after: p,
          segmentOrigin,
          nominalEnd: old,
          end: next,
          seconds: dt - elapsed,
          activeFoot,
          ...(swingYield && stance !== q.articulatedStance ? { swingYield } : {}),
          parkedRemainder: Boolean(parked),
          recovery: state.recoveringFeet?.filter((f) => f.actorId === p.id),
        });
      return next;
    });
  };
  const loadOpponentContacts = (
    player: MatchPlayerState,
    contacts: z.infer<typeof playerBodyContactSchema>[],
  ) => {
    if (!dynamicBalance) return player;
    for (const c of contacts) {
      const index = c.participants[0] === player.id ? 0 : c.participants[1] === player.id ? 1 : -1;
      if (index === -1 || !c.normalImpulse || c.kind === 'unresolved') continue;
      const impulse = {
        x: c.masses[index] * (c.after[index].x - c.before[index].x),
        y: c.masses[index] * (c.after[index].y - c.before[index].y),
        z: 0,
      };
      const position = c.positionsAtContact?.[index] ?? player.position;
      const radius = UPRIGHT_OUTFIELD_BALL_BODY.radius;
      const side = index === 0 ? -1 : 1;
      const point = {
        x: position.x + side * c.normal.x * radius,
        y: position.y + side * c.normal.y * radius,
        z: (player.profile.heightCm / 100) * UPRIGHT_OUTFIELD_BALL_BODY.centreHeightRatio,
      };
      player = loadDynamicBalance(state, player, point, impulse, 'opponent');
    }
    return player;
  };
  const yieldSwingBetweenShins = (
    player: MatchPlayerState,
    hit: EventLegHit,
    previous: TacticalMatchState['lastBallContact'],
    earlier: TacticalMatchState['lastBallContact'],
  ) => {
    if (previous?.leg?.region !== 'shin' || hit.leg.region !== 'shin') return;
    const opposing = previous.surfaceNormal;
    if (
      !opposing ||
      opposing.x * hit.normal.x + opposing.y * hit.normal.y + opposing.z * hit.normal.z >= 0
    )
      return;
    // Across two players, require a return impact on the first shin before
    // interrupting a gait command.
    if (
      previous.playerId !== player.id &&
      (earlier?.playerId !== player.id ||
        earlier.leg?.region !== 'shin' ||
        earlier.leg.foot !== hit.leg.foot)
    )
      return;
    const priorPlayer = state.players.find((p) => p.id === previous.playerId);
    if (
      previous.playerId === player.id &&
      (previous.leg.foot === hit.leg.foot || hit.leg.foot !== player.articulatedStance?.support)
    )
      return;
    for (const [actor, swing] of [
      [priorPlayer, previous.leg.foot],
      ...(previous.playerId === player.id ? [] : [[player, hit.leg.foot] as const]),
    ] as const) {
      const stance = actor?.articulatedStance;
      if (
        !actor ||
        !stance ||
        stance.support === swing ||
        stoppedSwings.has(actor.id) ||
        activeArticulatedFoot(state, actor.id) ||
        (actor.verticalJump?.height ?? 0) > 0
      )
        continue;
      const endpoint = finalPlayers.find((p) => p.id === actor.id)!;
      if (endpoint.articulatedStance?.support !== stance.support) continue;
      try {
        deriveLowerBodyGeometry({
          ...endpoint,
          articulatedStance: { ...endpoint.articulatedStance, [swing]: stance[swing] },
        });
      } catch {
        continue;
      }
      // Yield the remaining swing at the actual pose, keeping the planned root and plant.
      rebasePlayer(actor, { stopSwing: swing });
    }
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
    return effectiveArticulatedFoot(
      state,
      a,
      p,
      foot,
      start + began,
      dt - began,
      elapsed + t - began,
    );
  };
  const eventLimit = multi ? MULTI_BODY.events : 4;
  for (
    let eventCount = 0;
    (eventCount < eventLimit || (composedLegs && eventCount === eventLimit)) &&
    elapsed < dt - 1e-12;
    eventCount++
  ) {
    const beforeSearch = state;
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
    const freeFlight = integrateBallFlight(ball, seconds, state.ballEnvironment);
    let integrated = freeFlight;
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
    const supportSurfacesAt = (t: number): ContactCandidate[] => [
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
    ];
    const advanceBall = (t: number) => {
      const flight = integrateBallFlight(ball, t, state.ballEnvironment);
      if (!hasSupport || t === 0) return flight;
      const supported = supportContinuousBodyContacts(
        flight.position,
        flight.velocity,
        supportSurfacesAt(t),
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
      legUnresolved?: string;
      legHit?: EventLegHit;
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
        const a = bodyAt(before.get(p.id) ?? p, p, elapsed / dt, dt);
        const b = bodyAt(before.get(q.id) ?? q, q, elapsed / dt, dt);
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
        const last = state.lastBallContact;
        if (composedLegs && last?.playerId === p.id && last.leg?.foot === foot) {
          const point = footAt(0).position;
          if (
            Math.hypot(
              point.x - ball.position.x,
              point.y - ball.position.y,
              point.z - ball.position.z,
            ) <
            BALL_RADIUS + 0.035
          )
            continue;
        }
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
    if (composedLegs) {
      let freeBallAcceleration: number | undefined;
      let freeBallPrefix: { until: number; acceleration: number } | undefined;
      let deadline = Math.min(seconds, ...events.map((e) => e.at));
      if (
        !supports.length &&
        seconds <= 0.025 &&
        state.ballEnvironment?.groundContact === 'event-v1'
      ) {
        const horizon = dynamicBalance ? deadline : seconds;
        const bootsClear = (acceleration: BodyPoint, prefix = horizon) =>
          footSupports.every(({ contact, player }) => {
            const foot = intervalFoot(player, contact.foot, 0);
            return (
              foot.accelerationBound === 0 &&
              affineBootClearOfBallFlight(ball, acceleration, foot, prefix)
            );
          });
        if (ball.position.z <= BALL_RADIUS && ball.velocity.z === 0) {
          if (!hasSupport)
            freeBallAcceleration =
              BALL_PHYSICS.rollingDeceleration * state.ballEnvironment.rollingResistanceMultiplier;
          // The rolling integrator keeps a stationary ball at this point, even while spin decays.
          else if (
            ball.position.z === BALL_RADIUS &&
            ball.velocity.x === 0 &&
            ball.velocity.y === 0 &&
            bootsClear({ x: 0, y: 0, z: 0 })
          )
            freeBallAcceleration = 0;
        } else {
          // The event-v1 integrator holds this acceleration until a ground impact.
          const drag = dragAcceleration(ball.velocity);
          const lift = magnusAcceleration(ball.velocity, ball.spin);
          const acceleration = {
            x: drag.x + lift.x,
            y: drag.y + lift.y,
            z: -BALL_PHYSICS.gravity + drag.z + lift.z,
          };
          const lowest = hasSupport
            ? minimumQuadratic(ball.position.z, ball.velocity.z, acceleration.z / 2, seconds)
            : ball.position.z +
              Math.min(0, ball.velocity.z) * seconds +
              0.5 * Math.min(0, acceleration.z) * seconds ** 2;
          const noGroundImpact = dynamicBalance
            ? firstGroundImpactTime(ball.position.z, ball.velocity.z, acceleration.z) > horizon
            : lowest > BALL_RADIUS;
          if (noGroundImpact && bootsClear(acceleration))
            freeBallAcceleration = Math.hypot(acceleration.x, acceleration.y, acceleration.z);
          else if (dynamicBalance && !supports.length) {
            // A contact or ground crossing farther down the interval does not
            // invalidate a shorter, provably unprojected flight prefix. This
            // bound prunes search branches only. It creates no event or impulse.
            const impact = firstGroundImpactTime(ball.position.z, ball.velocity.z, acceleration.z);
            let high = Math.min(horizon, impact);
            let low = 0;
            for (let i = 0; i < 12; i++) {
              const middle = (low + high) / 2;
              if (middle < impact && bootsClear(acceleration, middle)) low = middle;
              else high = middle;
            }
            if (low > 0)
              freeBallPrefix = {
                until: low,
                acceleration: Math.hypot(acceleration.x, acceleration.y, acceleration.z),
              };
          }
        }
      }
      const ballSpeed =
        Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z) +
        Math.sqrt(2 / 3) * BALL_RADIUS * Math.hypot(ball.spin.x, ball.spin.y, ball.spin.z) +
        (BALL_PHYSICS.gravity + BALL_PHYSICS.maximumMagnusAcceleration) * seconds +
        (freeBallAcceleration === undefined ? 2 * supportSpeedBound : 0);
      for (const p of finalPlayers) {
        if (
          deadline <= 1e-10 ||
          !p.articulatedStance ||
          isMatchGoalkeeper(p) ||
          uncertainActors.has(p.id) ||
          !canParticipatePhysically(p) ||
          state.discipline?.[p.id]?.sentOff ||
          !canContactAfterThrowIn(state, p.id)
        )
          continue;
        const first = playerAt(p, elapsed);
        const travel = Math.hypot(p.position.x - first.position.x, p.position.y - first.position.y);
        if (
          Math.hypot(first.position.x - ball.position.x, first.position.y - ball.position.y) >
          1.5 + travel + ballSpeed * deadline
        )
          continue;
        const turn = p.facingAngle - first.facingAngle;
        const hipYaw = (p.lowerBodyPose?.hipYaw ?? 0) - (first.lowerBodyPose?.hipYaw ?? 0);
        const yawSpeed = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)) + hipYaw) / seconds;
        const height = Math.max(1.4, Math.min(2.2, p.profile.heightCm / 100));
        const left = intervalFoot(p, 'left', 0),
          right = intervalFoot(p, 'right', 0);
        const geometryAt = (t: number) =>
          composeArticulatedLegs(
            playerAt(p, elapsed + t),
            t === 0 ? left : intervalFoot(p, 'left', t),
            t === 0 ? right : intervalFoot(p, 'right', t),
          );
        const recheckSurfaces = recheckLegs?.get(p.id);
        let geometrySamples = 0;
        const searchBegan = traceWork ? performance.now() : 0;
        const hit = firstComposedLegContact(
          deadline,
          traceWork
            ? (t) => {
                geometrySamples++;
                return geometryAt(t);
              }
            : geometryAt,
          (t) => (t === 0 ? ball : advanceBall(t)),
          {
            horizontalHipSpeed:
              travel / seconds +
              (hasIndividualLowerBody(p.bodyMorphology)
                ? yawSpeed * individualHipOffset(height, p.bodyMorphology)
                : yawSpeed * height * 0.055),
            yawSpeed,
            unconstrainedPelvisAt: (t) =>
              height * 0.49 -
              0.25 *
                ((first.lowerBodyPose?.crouch ?? 0) +
                  (((p.lowerBodyPose?.crouch ?? 0) - (first.lowerBodyPose?.crouch ?? 0)) * t) /
                    seconds) +
              (p.verticalJump?.height ?? 0),
            unconstrainedPelvisSpeed:
              (0.25 *
                Math.abs((p.lowerBodyPose?.crouch ?? 0) - (first.lowerBodyPose?.crouch ?? 0))) /
              seconds,
            bootSpeed: { left: left.speedBound, right: right.speedBound },
            ballSpeed,
            tightenIndividualKneeBound: coupledLimbImpulse,
            ...(recheckSurfaces ? { recheckSurfaces } : {}),
            ...(freeBallAcceleration !== undefined &&
            left.accelerationBound === 0 &&
            right.accelerationBound === 0
              ? { ballAcceleration: freeBallAcceleration }
              : {}),
            ...(freeBallPrefix && left.accelerationBound === 0 && right.accelerationBound === 0
              ? { freeBallPrefix }
              : {}),
          },
          footSupports.filter((c) => c.player.id === p.id).map((c) => c.contact.foot),
        );
        if (traceWork)
          traceReception('pendingStrikeInterval.composedLegSearch', start + elapsed, p.id, {
            geometrySamples,
            milliseconds: performance.now() - searchBegan,
            outcome: hit?.kind ?? 'clear',
            ...(hit?.kind === 'unresolved' ? { reason: hit.reason } : {}),
          });
        if (!hit) continue;
        deadline = Math.min(deadline, hit.at);
        const frontier = hit.kind === 'unresolved' && hit.reason === 'budget' && hit.at > 1e-10;
        events.push({
          at: hit.at,
          rank: hit.kind === 'contact' ? 4 : 1,
          key: hit.kind === 'contact' ? `${p.id}:${hit.leg.foot}:${hit.leg.region}` : p.id,
          playerId: p.id,
          kind: hit.kind === 'contact' ? 'leg' : frontier ? 'search_frontier' : 'leg_unresolved',
          ...(hit.kind === 'contact' ? { legHit: hit } : { legUnresolved: hit.reason }),
        });
      }
    }
    // Exact numeric time first; only events in the same 1ns bucket use legal/body/foot/strike and stable identity.
    events.sort(compareSharedContactEvents);
    const event = events[0];
    if (receptionMechanicsTraceEnabled())
      traceReception('pr224.full.intervalRace', state.time, event?.playerId ?? '', {
        elapsed,
        seconds,
        ball,
        event,
        feet: footSupports.map(({ player, contact }) => ({ id: player.id, foot: contact.foot })),
        bodySupports: supports.map((surface) => surface.playerId),
        action: state.pendingStrike?.id,
        recoveries: state.recoveringFeet?.map((foot) => ({ id: foot.actorId, foot: foot.foot })),
      });
    if (receptionMechanicsTraceEnabled() && hasSupport && (event?.at ?? seconds) > 0) {
      const duration = event?.at ?? seconds;
      traceReception(
        'pendingStrikeInterval.committedSupport',
        start + elapsed,
        state.ball.ownerId ?? '',
        {
          seconds: duration,
          ball,
          freeFlight: event
            ? integrateBallFlight(ball, duration, state.ballEnvironment)
            : freeFlight,
          withSupport: event ? advanceBall(duration) : integrated,
          environment: state.ballEnvironment,
          surfaces: supportSurfacesAt(duration),
          next: event?.kind ?? 'end_of_tick',
        },
      );
    }
    if (!event) {
      if (
        receptionTraceEnabled() &&
        state.ball.ownerId &&
        integrated.velocity !== freeFlight.velocity &&
        (integrated.velocity.x !== freeFlight.velocity.x ||
          integrated.velocity.y !== freeFlight.velocity.y ||
          integrated.velocity.z !== freeFlight.velocity.z)
      )
        traceReception(
          'pendingStrikeInterval.continuousSupportRemainder',
          start + elapsed,
          state.ball.ownerId,
          {
            seconds,
            freeFlight,
            withSupport: integrated,
            bodyIds: supports.map((c) => c.playerId),
            feet: footSupports.map(({ contact, player }) => ({
              actorId: player.id,
              foot: contact.foot,
              from: intervalFoot(player, contact.foot, 0),
              to: intervalFoot(player, contact.foot, seconds),
            })),
          },
        );
      if (!handlers.bodyOnly) state = advanceBallState(state, integrated, seconds);
      elapsed = dt;
      break;
    }
    // The last allowed event can leave a free tail. Certify that tail with the
    // usual search, but never consume or resolve another event on exhaustion.
    if (eventCount === eventLimit) {
      state = beforeSearch;
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
    if (event.kind === 'leg_unresolved') {
      const reason = `unresolved_composed_leg_contact_${event.legUnresolved}`;
      state = recordExecution(state, 'unresolved', reason, 1);
      state = {
        ...state,
        safetyHalt: {
          ...haltEvidence(state, 'physical_contact', reason, start),
          actorIds: [event.playerId!],
        },
      };
      return restoreClock(state);
    }
    if (event.kind === 'separating_foot') {
      // A passive surface that is already separating has zero normal impulse.
      // Retain its unilateral support until real clearance, without counting a
      // strike/control/touch or interrupting the still-live selected action.
      state = {
        ...state,
        continuousFootContacts: [
          ...(state.continuousFootContacts ?? []),
          {
            actorId: event.playerId!,
            foot: event.key.endsWith(':left') ? ('left' as const) : ('right' as const),
          },
        ].slice(-44),
      };
      continue;
    }
    if (event.kind === 'player_cluster' || event.kind === 'player_edge') {
      const result = resolveMultiBodyContact(state, event.participants!, state.time);
      if (receptionTraceEnabled())
        traceReception('pendingStrikeInterval.resolveMultiBodyContact', state.time, event.key, {
          kind: event.kind,
          participants: event.participants,
          contacts: result.contacts,
          ball: state.ball,
        });
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
      const loadedPlayers = result.players.map((p) => loadOpponentContacts(p, result.contacts));
      for (const p of loadedPlayers)
        rebasePlayer(p, {
          torsoImpact:
            preserveParkedStance &&
            result.contacts.some((c) => c.kind === 'impact' && c.participants.includes(p.id)),
        });
      state = {
        ...state,
        players: state.players.map((p) => loadedPlayers.find((q) => q.id === p.id) ?? p),
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
        const loadedPlayers = result.players.map((p) => loadOpponentContacts(p, [result.evidence]));
        for (const p of loadedPlayers) {
          rebasePlayer(p);
        }
        state = {
          ...state,
          players: state.players.map((p) => loadedPlayers.find((q) => q.id === p.id) ?? p),
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
    if (receptionTraceEnabled())
      traceReception('pendingStrikeInterval.contactRace', state.time, actor.id, {
        kind: event.kind,
        key: event.key,
        hit: event.hit,
        ball: state.ball,
        position: actor.position,
        velocity: actor.velocity,
        stance: actor.articulatedStance,
      });
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
    if (event.legHit) {
      const { leg } = event.legHit;
      const priorLeg = state.lastLimbContacts?.at(-1);
      const earlierLeg = state.lastLimbContacts?.at(-2);
      const surface = (value: typeof leg) =>
        coupledLimbImpulse ? composedContactSurface(value) : `${value.foot}_${value.region}`;
      const other =
        !hasSupport &&
        (coupledLimbImpulse || leg.region === 'shin') &&
        priorLeg === state.lastBallContact &&
        priorLeg?.leg &&
        (coupledLimbImpulse || priorLeg.leg.region === 'shin') &&
        (priorLeg.playerId !== actor.id || surface(priorLeg.leg) !== surface(leg)) &&
        earlierLeg?.playerId === actor.id &&
        earlierLeg.leg &&
        surface(earlierLeg.leg) === surface(leg)
          ? finalPlayers.find((p) => p.id === priorLeg.playerId)
          : undefined;
      const legGeometryAt = (player: MatchPlayerState) => (t: number) =>
        composeArticulatedLegs(
          playerAt(player, elapsed + t),
          intervalFoot(player, 'left', t),
          intervalFoot(player, 'right', t),
        );
      const touchingLegOf = (player: MatchPlayerState, value: typeof leg) =>
        touchingComposedLeg(
          composedContactSurface(value),
          incoming.position,
          legGeometryAt(player),
          dt - elapsed,
          coupledLimbImpulse,
        );
      const touching = other && priorLeg?.leg && touchingLegOf(other, priorLeg.leg);
      // A joint response constrains the remainder. Both surface velocities must use
      // the same forward sample as the next search at this event boundary.
      const jointPrimary =
        touching && coupledLimbImpulse
          ? touchingLegOf(finalPlayers.find((player) => player.id === actor.id)!, leg)
          : event.legHit;
      const primaryResponse = dynamicBalance ? dynamicContactMobility(state, actor) : undefined;
      const pressingPair =
        dynamicBalance && other && leg.region === 'shin' && priorLeg?.leg?.region === 'shin'
          ? observeOpposingShinPressure(
              event.legHit,
              composedContactSurface(priorLeg.leg),
              incoming.position,
              legGeometryAt(other),
              dt - elapsed,
              state.time - priorLeg.at,
            )
          : undefined;
      const stance = actor.articulatedStance;
      const endpoint = other?.articulatedStance;
      const support = stance?.support;
      const landing = endpoint?.support;
      const supportTransfer =
        pressingPair &&
        other?.id === actor.id &&
        touching &&
        support &&
        landing &&
        support !== landing &&
        stance[support].z <= MAX_GROUNDED_SUPPORT_HEIGHT &&
        endpoint[landing].z <= MAX_GROUNDED_SUPPORT_HEIGHT &&
        !actor.verticalJump?.height &&
        !activeArticulatedFoot(state, actor.id);
      const loadedPair = pressingPair && (other?.id !== actor.id || supportTransfer);
      const pairRestitution = supportTransfer ? COMPOSED_LIMB_IMPACT.restitution : 0;
      // Pitch/roll rotates the trunk, while knee and shin paths are supplied by
      // anchored-leg IK. Joint constraints use the measured forward velocities.
      const simultaneous =
        touching &&
        jointPrimary &&
        resolveOpposingBallContactImpulse(
          incoming.velocity,
          jointPrimary,
          touching,
          pairRestitution,
        );
      const pressure = !simultaneous && other?.id !== actor.id ? pressingPair : undefined;
      const impactLaw = pressure ? { restitution: 0, friction: 0 } : COMPOSED_LIMB_IMPACT;
      const { normal, velocity: surfaceVelocity } =
        simultaneous && jointPrimary ? jointPrimary : event.legHit;
      const entry = traceWork
        ? {
            root: { position: actor.position, velocity: actor.velocity },
            stance: actor.articulatedStance,
            pendingStrike: state.pendingStrike?.id,
            recovery: state.recoveringFeet?.find(
              (foot) => foot.actorId === actor.id && foot.foot === leg.foot,
            ),
            challenge: state.defensiveChallenge?.id,
            ownerId: state.ball.ownerId,
            continuousFeet: state.continuousFootContacts,
            continuousBodies: state.ball.continuousBodyContacts,
            ground: incoming.position.z <= BALL_RADIUS,
          }
        : undefined;
      state = finishPendingStrike(state, 'interrupted', 'incidental_leg', state.time, {
        evaluations,
        firstEvent: event.key,
      });
      state = handlers.body(state, actor.id);
      if (interruptedByLaw(state)) return restoreClock(state);
      const impactInput = { velocity: incoming.velocity, spin: incoming.spin ?? ZERO_BALL_SPIN };
      const impulse =
        !simultaneous && coupledLimbImpulse
          ? resolveComposedLimbImpact(
              impactInput,
              event.legHit,
              !pressure && primaryResponse
                ? (j) => primaryResponse(leg.point, leg.point, j)
                : undefined,
              impactLaw,
            )
          : undefined;
      const response = simultaneous
        ? { velocity: simultaneous.velocity, spin: incoming.spin }
        : (impulse ??
          resolveBallRebound(
            'defender',
            incoming.velocity,
            { team: state.possessionTeam, endsSwitched: state.endsSwitched },
            incoming.spin,
            { surfaceNormal: normal, surfaceVelocity, point: incoming.position },
          ));
      const responseSource = simultaneous
        ? leg.region === 'shin' && touching?.leg.region === 'shin'
          ? 'pendingStrikeInterval.opposingShinContacts'
          : 'pendingStrikeInterval.opposingLegContacts'
        : 'pendingStrikeInterval.composedLeg';
      state = recordExecution(state, 'ball-body-contact', responseSource, 1);
      if (simultaneous && receptionMechanicsTraceEnabled())
        traceReception(responseSource, state.time, actor.id, {
          primary:
            simultaneous && jointPrimary ? { ...event.legHit, ...jointPrimary } : event.legHit,
          other: touching,
          otherId: other?.id,
          incoming: incoming.velocity,
          outgoing: simultaneous.velocity,
        });
      if (entry) {
        const outgoing = { velocity: response.velocity, spin: response.spin ?? impactInput.spin };
        const constraints = [
          {
            actorId: actor.id,
            leg,
            normal,
            velocity: surfaceVelocity,
            impulse:
              simultaneous?.impulses[0] ??
              impulse?.impulse ??
              ballLinearImpulse(incoming.velocity, outgoing.velocity),
          },
        ];
        if (simultaneous && touching && other)
          constraints.push({ actorId: other.id, ...touching, impulse: simultaneous.impulses[1] });
        traceReception('pendingStrikeInterval.composedLimbWork', state.time, actor.id, {
          solver: simultaneous ? 'opposing_limbs' : impulse ? 'coupled_impulse' : 'legacy_rebound',
          ...(dynamicBalance
            ? { bodyMobility: Boolean(!simultaneous && !pressure && primaryResponse) }
            : {}),
          ...(pressure ? { pressure } : {}),
          ...(supportTransfer && simultaneous
            ? { supportTransfer: { from: support, to: landing } }
            : {}),
          parameters: simultaneous
            ? { restitution: pairRestitution, friction: 0 }
            : impulse
              ? impactLaw
              : { restitution: 0.38, tangentRetention: 0.72, spinRetention: 0.3 },
          atInTick: elapsed,
          position: incoming.position,
          correction: 0,
          incoming: impactInput,
          outgoing,
          entry,
          account: measureBallContactWork(impactInput, outgoing, constraints),
        });
      }
      state = {
        ...state,
        ball: {
          ...state.ball,
          velocity: response.velocity,
          ...(response.spin ? { spin: response.spin } : {}),
          airborne: incoming.position.z > BALL_RADIUS || response.velocity.z > 0,
          lastTouchPlayerId: actor.id,
          looseSince: state.time,
        },
        lastBallContact: {
          kind: 'defender',
          playerId: actor.id,
          leg,
          at: state.time,
          point: incoming.position,
          segmentFraction: event.at / seconds,
          surfaceNormal: normal,
          surfaceVelocity,
          preContactSpeed: Math.hypot(
            incoming.velocity.x,
            incoming.velocity.y,
            incoming.velocity.z,
          ),
          postContactSpeed: Math.hypot(
            response.velocity.x,
            response.velocity.y,
            response.velocity.z,
          ),
        },
      };
      delete state.ball.ownerId;
      delete state.controlledBallContact;
      delete state.ballAcquisition;
      state.lastLimbContacts = [...(state.lastLimbContacts ?? []), state.lastBallContact!];
      if (dynamicBalance) {
        const trackLeg = (id: string, contact: typeof leg) => {
          const surfaces =
            recheckLegs?.get(id) ?? new Set<ReturnType<typeof composedContactSurface>>();
          surfaces.add(composedContactSurface(contact));
          recheckLegs?.set(id, surfaces);
        };
        if (loadedPair && simultaneous && jointPrimary && touching && other) {
          for (const [id, contact] of [
            [actor.id, jointPrimary.leg],
            [other.id, touching.leg],
          ] as const) {
            trackLeg(id, contact);
          }
        }
        const swingReaction = (
          player: MatchPlayerState,
          surface: { leg: typeof leg; normal: BodyPoint },
          impulse: BodyPoint,
        ) => {
          const { foot } = surface.leg;
          const support = player.articulatedStance?.support;
          if (
            !loadedPair ||
            !simultaneous ||
            !support ||
            support === foot ||
            activeArticulatedFoot(state, player.id) ||
            player.verticalJump?.height
          )
            return;
          const n = surface.normal;
          return shinSwingRecoil(
            player,
            incoming.position,
            foot,
            impulse.x * n.x + impulse.y * n.y + impulse.z * n.z,
            swingShankAndFootMass(player, foot),
            simultaneous.dissipated / 4,
            dt - elapsed,
          );
        };
        const reaction = (player: MatchPlayerState, point: BodyPoint, applied: BodyPoint) =>
          loadDynamicBalance(
            state,
            player,
            point,
            { x: -applied.x, y: -applied.y, z: -applied.z },
            'ball',
          );
        const loadedActor = reaction(
          actor,
          simultaneous && jointPrimary ? jointPrimary.leg.point : leg.point,
          simultaneous?.impulses[0] ?? impulse!.impulse,
        );
        if (simultaneous && jointPrimary && touching && other?.id === actor.id) {
          rebasePlayer(reaction(loadedActor, touching.leg.point, simultaneous.impulses[1]), {
            limbImpact: true,
            swingYield:
              swingReaction(actor, jointPrimary, simultaneous.impulses[0]) ??
              swingReaction(actor, touching, simultaneous.impulses[1]),
          });
        } else {
          rebasePlayer(loadedActor, {
            limbImpact: true,
            swingYield:
              simultaneous && jointPrimary
                ? swingReaction(actor, jointPrimary, simultaneous.impulses[0])
                : undefined,
          });
          if (simultaneous && touching && other) {
            const otherActor = playerAt(other, elapsed);
            rebasePlayer(reaction(otherActor, touching.leg.point, simultaneous.impulses[1]), {
              limbImpact: true,
              swingYield: swingReaction(otherActor, touching, simultaneous.impulses[1]),
            });
          }
        }
      } else if (!simultaneous) yieldSwingBetweenShins(actor, event.legHit, priorLeg, earlierLeg);
      continue;
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
          state = handlers.control(state, actor.id, {
            foot: event.key.endsWith(':left') ? 'left' : 'right',
            normal: event.hit!.normal!,
          });
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
    if (coupledLimbImpulse && !state.executionWitnesses)
      state = {
        ...state,
        safetyHalt: haltEvidence(
          state,
          'physical_contact',
          'pendingStrikeInterval.event_budget',
          start,
        ),
      };
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
