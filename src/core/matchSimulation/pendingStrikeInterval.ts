import { compareSharedContactEvents, type sharedContactEventSchema } from './sharedContactTimeline';
import type { z } from 'zod';
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
import { motorContactReadyAt } from './ballContactGeometry';
import { canContactAfterThrowIn } from './throwIn';
import { captureOffsideSnapshot } from './offside';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { GOALKEEPER_PHYSICS } from './goalkeeperIntervention';
import {
  canonicalStrikeFoot,
  executePendingContact,
  findStrikeIntervalContact,
  finishPendingStrike,
  physicalStrikeBall,
  withPhysicalStrikeBall,
} from './pendingStrike';

type Handlers = {
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

/** Ball branch of the canonical step, subordinate to its already integrated body segments.
 * No player/match stepping, hidden prediction, future state injection or RNG occurs here. */
export const advancePendingStrikeInterval = (
  input: TacticalMatchState,
  moved: TacticalMatchState,
  dt: number,
  handlers: Handlers,
): TacticalMatchState => {
  const pending = moved.pendingStrike;
  const shared = moved.experimentalContactTimeline === 'standing-contact-dev-v1';
  const start = moved.time - dt,
    end = moved.time;
  const before = new Map(input.players.map((p) => [p.id, p]));
  const finalPlayers = moved.players;
  const changedVelocities = new Map<string, MatchPlayerState['velocity']>();
  const restoreClock = (s: TacticalMatchState) => ({
    ...s,
    time: end,
    players: finalPlayers.map((p) => {
      const changed = s.players.find((a) => a.id === p.id);
      return changed
        ? {
            ...changed,
            position: p.position,
            facingAngle: p.facingAngle,
            velocity: changedVelocities.get(p.id) ?? p.velocity,
          }
        : p;
    }),
  });
  let state = { ...moved, time: start },
    elapsed = 0,
    evaluations = 0;
  const excluded = new Set<string>(pending ? [pending.actorId] : []);
  const resolveChallenge = (
    kind: 'ball' | 'body' | 'miss' | 'interrupted' | 'unresolved',
    reason: string,
    contact?: ReturnType<typeof executeFootContact>,
  ) => {
    const resolution = resolveDefensiveChallenge(state, {
      kind,
      reason,
      ...(contact ? { contact } : {}),
    });
    state = resolution.state;
    if (resolution.diagnostic) state = handlers.challenge?.(state, resolution.diagnostic) ?? state;
  };
  for (let eventCount = 0; eventCount < 4 && elapsed < dt - 1e-12; eventCount++) {
    const seconds = dt - elapsed;
    const ball = physicalStrikeBall(state);
    const integrated = integrateBallFlight(ball, seconds, state.ballEnvironment);
    let crossing = findPitchBoundaryCrossing(ball.position, integrated.position);
    if (crossing) {
      // Refine the whole-ball plane against the same integrator as foot contact.
      let low = 0,
        high = seconds;
      for (let i = 0; i < 32; i++) {
        const middle = (low + high) / 2;
        if (
          isBallWithinPlayingBoundary(
            integrateBallFlight(ball, middle, state.ballEnvironment).position,
          )
        )
          low = middle;
        else high = middle;
      }
      const out = integrateBallFlight(ball, high, state.ballEnvironment).position;
      const legal = findPitchBoundaryCrossing(ball.position, out);
      crossing = { ...(legal ?? crossing), segmentFraction: high / seconds };
    }
    const candidates: ContactCandidate[] = finalPlayers
      .filter(
        (p) =>
          !excluded.has(p.id) &&
          canParticipatePhysically(p) &&
          !state.discipline?.[p.id]?.sentOff &&
          canContactAfterThrowIn(state, p.id),
      )
      .map((p) => {
        const a = bodyAt(before.get(p.id) ?? p, p, elapsed / dt);
        return {
          kind: isMatchGoalkeeper(p) ? ('goalkeeper' as const) : ('defender' as const),
          playerId: p.id,
          centre: {
            ...p.position,
            z: isMatchGoalkeeper(p) ? GOALKEEPER_PHYSICS.contactCentreHeight : 0.9,
          },
          previousCentre: {
            ...a.position,
            z: isMatchGoalkeeper(p) ? GOALKEEPER_PHYSICS.contactCentreHeight : 0.9,
          },
          radius: isMatchGoalkeeper(p) ? GOALKEEPER_PHYSICS.passiveBodyRadiusMetres : 0.72,
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
    };
    const events: Event[] = [];
    const challenge = shared ? state.defensiveChallenge : undefined;
    const attempt = challenge?.physicalAttempt;
    if (attempt && attempt.expiresAt <= end)
      events.push({
        at: Math.max(0, attempt.expiresAt - state.time),
        rank: 4,
        key: challenge!.id,
        kind: 'challenge_expiry',
      });
    if (attempt && challenge) {
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
    if (crossing)
      events.push({
        at: seconds * crossing.segmentFraction,
        rank: 0,
        key: crossing.boundary,
        kind: 'boundary',
      });
    if (body && (body.playerId || ['left_post', 'right_post', 'crossbar'].includes(body.kind)))
      events.push({
        at: seconds * body.segmentFraction,
        rank: 1,
        key: body.playerId ?? body.kind,
        kind: 'body',
        ...(body.playerId ? { playerId: body.playerId } : {}),
      });
    for (const p of finalPlayers) {
      if (excluded.has(p.id) && p.id !== state.pendingStrike?.actorId) continue;
      if (
        !canParticipatePhysically(p) ||
        state.discipline?.[p.id]?.sentOff ||
        !canContactAfterThrowIn(state, p.id)
      )
        continue;
      const a = before.get(p.id) ?? p;
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
      for (const foot of prepared ? [prepared.plan.foot] : (['left', 'right'] as const)) {
        const footAt = (t: number) =>
          canonicalStrikeFoot(prepared, a, p, foot, start, dt, elapsed + t);
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
        if (!own && start + elapsed < motorContactReadyAt(state, p.id) - 1e-9) continue;
        const hit = findStrikeIntervalContact(
          state,
          prepared ? Math.min(seconds, Math.max(0, prepared.expiresAt - state.time)) : seconds,
          footAt,
        );
        evaluations += hit.evaluations;
        if (hit.outcome === 'clear') continue;
        // Uncertain competing geometry blocks the planned impulse conservatively.
        events.push({
          at: hit.local,
          rank: hit.outcome === 'unresolved' ? 1 : own ? 3 : 2,
          key: `${p.id}:${foot}`,
          kind:
            hit.outcome === 'unresolved'
              ? 'uncertain'
              : own
                ? 'strike'
                : defending
                  ? 'challenge'
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
      state = withPhysicalStrikeBall(state, integrated);
      if (shared && state.ball.continuousBodyContacts?.length) {
        const supported = supportContinuousBodyContacts(
          integrated.position,
          integrated.velocity,
          candidates.filter((c) => state.ball.continuousBodyContacts?.includes(c.playerId!)),
          seconds,
        );
        state = withPhysicalStrikeBall(state, { ...integrated, ...supported });
      }
      elapsed = dt;
      break;
    }
    const incoming =
      event.at > 0 ? integrateBallFlight(ball, event.at, state.ballEnvironment) : ball;
    elapsed += event.at;
    state = withPhysicalStrikeBall(
      {
        ...state,
        time: start + elapsed,
        players: finalPlayers.map((p) => bodyAt(before.get(p.id) ?? p, p, elapsed / dt)),
      },
      incoming,
    );
    if (event.kind === 'challenge_expiry') {
      resolveChallenge('miss', 'swing_completed_without_contact');
      continue;
    }
    if (event.kind === 'challenge_body') {
      state = finishPendingStrike(state, 'interrupted', 'active_body_contact', state.time, {
        evaluations,
        firstEvent: event.key,
      });
      resolveChallenge('body', 'swept_torso_contact');
      if (state.restart || state.scenario !== 'open_play' || state.postGoal)
        return restoreClock(state);
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
    if (event.kind === 'challenge') {
      const hit = event.hit!;
      const contact =
        hit.foot && hit.normal
          ? executePendingContact(state, actor, hit.foot, hit.normal, attempt!)
          : undefined;
      if (!contact?.available) {
        resolveChallenge('unresolved', contact?.unavailableReason ?? 'current_capability');
        excluded.add(actor.id);
        continue;
      }
      // The same actual-contact law/lineage observer as passive deflection.
      // It can end play; it never awards this foot secure possession.
      state = handlers.body(state, actor.id);
      if (state.restart || state.scenario !== 'open_play' || state.postGoal) {
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
          { actorId: actor.id, foot: contact.foot },
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
        ball: {
          x: state.ball.x,
          y: state.ball.y,
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
        state = handlers.control(state, actor.id);
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
          changedVelocities.set(actor.id, changedActor.velocity);
        const contact =
          state.lastGroundContact?.actorId === actor.id && state.lastGroundContact.at === state.time
            ? state.lastGroundContact.surfaceContact
            : undefined;
        if (pending && state.lastStrikeResolution?.id === pending.id && contact)
          state = { ...state, lastStrikeResolution: { ...state.lastStrikeResolution, contact } };
      } else {
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
        if (state.restart || state.scenario !== 'open_play' || state.postGoal)
          return restoreClock(state);
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
        state.restart ||
        state.scenario !== 'open_play' ||
        state.postGoal ||
        state.ball.heldByKeeperId
      )
        return restoreClock(state);
    }
    excluded.add(actor.id);
  }
  if (elapsed < dt - 1e-12) {
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
