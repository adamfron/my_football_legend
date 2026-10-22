import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace';
import { observeDepthThreats, deriveDepthDefence } from '../src/core/matchSimulation/depthThreat';
import { deriveCrossOpportunities } from '../src/core/matchSimulation/crossOpportunity';
import { derivePressingPlan } from '../src/core/matchSimulation/defensiveChallenges';
import { deriveAerialAssignments } from '../src/core/matchSimulation/aerialPositioning';
import {
  deriveFlankRunAssignments,
  calculateOffsideLine,
} from '../src/core/matchSimulation/tacticalPositioning';
import { deriveTeamShapeMetrics } from '../src/core/matchSimulation/teamShapeMetrics';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper';

export const spatialEvidenceSchema = z.object({
  samples: z.number().int().nonnegative(),
  sampled: z.record(z.string(), z.number()),
  events: z.record(z.string(), z.number()),
  crossTypes: z.record(z.string(), z.number()),
  aerialOutcomes: z.record(z.string(), z.number()),
  secondBallTeams: z.record(z.string(), z.number()),
  trace: z.array(z.unknown()).max(96),
  shape: z.array(z.unknown()).max(32),
});

/** External observation only: one-second exposure samples and canonical identity events
 * are deliberately separate. Bounded traces are examples, never whole-match denominators. */
export class SpatialEvidence {
  samples = 0;
  sampled: Record<string, number> = {};
  events: Record<string, number> = {};
  crossTypes: Record<string, number> = {};
  aerialOutcomes: Record<string, number> = {};
  secondBallTeams: Record<string, number> = {};
  trace: unknown[] = [];
  shape: unknown[] = [];
  lastSequence = -1;
  lastSample = -1;
  lastAerial = '';
  lastCarry = '';
  depthPasses = new Set<string>();
  activeTakeOn: { actorId: string; defenderId: string; dir: number; passed: boolean } | undefined;
  pendingSecondBall: { id: string; at: number; sourceTeam?: string } | undefined;
  maxRss = 0;
  private count(record: Record<string, number>, key: string, amount = 1) {
    record[key] = (record[key] ?? 0) + amount;
  }
  private add(kind: string, at: number, data: unknown) {
    if (this.trace.length < 96) this.trace.push({ kind, at, data });
  }
  observe(previous: TacticalMatchState, state: TacticalMatchState) {
    const carry = state.ballCarrierIntent;
    const carryId = carry ? `${carry.actorId}:${carry.startedAt}` : '';
    if (carryId !== this.lastCarry) {
      if (this.activeTakeOn) {
        const owner = state.players.find((p) => p.id === state.ball.ownerId);
        const actor = state.players.find((p) => p.id === this.activeTakeOn!.actorId);
        const outcome =
          owner && actor && owner.id === actor.id
            ? 'retained'
            : owner && owner.team !== actor?.team
              ? 'opponent_control'
              : 'released_or_loose';
        this.count(this.events, `take_on_end_${outcome}`);
        this.activeTakeOn = undefined;
      }
      this.lastCarry = carryId;
      if (carry) {
        this.count(this.events, 'carry_intent_started');
        if (carry.movementMode === 'sprint') this.count(this.events, 'sprint_carry_intent_started');
        const actor = state.players.find((p) => p.id === carry.actorId);
        if (actor && Math.abs(actor.position.y - 34) > 15 && carry.movementMode === 'sprint')
          this.count(this.events, 'wide_sprint_carry_intent_started');
        const defender =
          actor &&
          state.players
            .filter((p) => p.team !== actor.team && !isMatchGoalkeeper(p))
            .sort(
              (a, b) => distance(a.position, actor.position) - distance(b.position, actor.position),
            )[0];
        if (
          actor &&
          defender &&
          Math.abs(actor.position.y - 34) > 15 &&
          distance(actor.position, defender.position) <= 8
        ) {
          const dir = attacksRight(actor) ? 1 : -1;
          if (dir * (actor.position.x - defender.position.x) <= 1) {
            this.activeTakeOn = { actorId: actor.id, defenderId: defender.id, dir, passed: false };
            this.count(this.events, 'wing_take_on_started');
          }
        }
      }
    }
    if (this.activeTakeOn && !this.activeTakeOn.passed) {
      const actor = state.players.find((p) => p.id === this.activeTakeOn!.actorId);
      const defender = state.players.find((p) => p.id === this.activeTakeOn!.defenderId);
      if (
        actor &&
        defender &&
        state.ball.ownerId === actor.id &&
        this.activeTakeOn.dir * (actor.position.x - defender.position.x) > 1
      ) {
        this.activeTakeOn.passed = true;
        this.count(this.events, 'take_on_passed_marker_with_control');
      }
    }
    for (const e of state.actionEvents ?? []) {
      if (e.sequence <= this.lastSequence) continue;
      this.count(this.events, e.kind);
      this.count(this.events, `${e.kind}_outcome_${e.outcome}`);
      if (['challenge', 'tackle', 'slide_tackle', 'possession_loss'].includes(e.kind))
        this.count(this.events, `${e.kind}_cause_${e.cause}`);
      if (e.kind === 'pass' || e.kind === 'through_pass') {
        const passer = previous.players.find((p) => p.id === e.actorId);
        const diagnostic = state.lastPassDiagnostic;
        const target =
          diagnostic && Math.abs(diagnostic.releasedAt - e.at) < 0.026
            ? diagnostic.physicalTarget
            : e.requestedSpace;
        if (passer && target) {
          const dir = attacksRight(passer) ? 1 : -1;
          const line =
            dir > 0
              ? Math.max(52.5, previous.ball.x, calculateOffsideLine(previous, passer.team))
              : Math.min(52.5, previous.ball.x, calculateOffsideLine(previous, passer.team));
          if (dir * (target.x - line) > 0.5) {
            this.depthPasses.add(e.id);
            this.count(this.events, 'pass_targeted_behind_line');
          }
        }
      }
      if (e.kind === 'pass_result' && e.parentId && this.depthPasses.delete(e.parentId))
        this.count(this.events, `behind_line_pass_result_${e.outcome}`);
      if (['cross', 'through_pass', 'clearance', 'shot', 'offside'].includes(e.kind))
        this.add(e.kind, e.at, e);
      if (e.kind === 'cross') {
        this.count(this.crossTypes, e.cause);
        this.add('cross_trajectory', state.time, {
          id: e.id,
          from: state.ball.from,
          target: state.ball.target,
          velocity: state.ball.launchVelocity,
          height: state.ball.height,
        });
      }
      this.lastSequence = Math.max(this.lastSequence, e.sequence);
    }
    const aerial = state.lastAerialContact;
    if (aerial?.id && aerial.id !== this.lastAerial) {
      this.lastAerial = aerial.id;
      this.count(this.events, 'aerial_contact_opportunity');
      const participants = [...state.players, ...(state.departedPlayers ?? [])];
      const ballContactTeams = new Set(
        aerial.contestantIds
          .map((id) => participants.find((p) => p.id === id)?.team)
          .filter((team) => team !== undefined),
      );
      if (ballContactTeams.size === 2) this.count(this.events, 'multi_player_ball_contact');
      const teams = new Set(
        [...aerial.contestantIds, ...(aerial.challengerIds ?? [])]
          .map((id) => participants.find((p) => p.id === id)?.team)
          .filter((team) => team !== undefined),
      );
      if (teams.size === 2) {
        this.count(this.events, 'contested_aerial_opportunity');
        if (aerial.winnerId && aerial.contestantIds.includes(aerial.winnerId))
          this.count(this.events, 'contested_aerial_contact');
      }
      this.count(this.aerialOutcomes, state.lastAerialResult ?? 'unknown');
      this.add('aerial', state.time, { ...aerial, outcome: state.lastAerialResult });
      if (!state.ball.ownerId) {
        const sourceTeam = participants.find((p) => p.id === aerial.winnerId)?.team;
        this.pendingSecondBall = {
          id: aerial.id,
          at: state.time,
          ...(sourceTeam ? { sourceTeam } : {}),
        };
      }
    }
    if (this.pendingSecondBall) {
      if (state.time - this.pendingSecondBall.at > 8 || state.restart || state.ball.shot)
        this.pendingSecondBall = undefined;
      else if (!previous.ball.ownerId && state.ball.ownerId) {
        const p = state.players.find((p) => p.id === state.ball.ownerId)!;
        this.count(this.secondBallTeams, p.team);
        this.add('second_ball_recovery', state.time, {
          ...this.pendingSecondBall,
          playerId: p.id,
          team: p.team,
          point: p.position,
          ball: state.ball,
        });
        this.pendingSecondBall = undefined;
      }
    }
    if (
      Math.floor(state.time) <= this.lastSample ||
      state.restart ||
      state.postGoal ||
      state.status === 'half_time'
    )
      return;
    this.lastSample = Math.floor(state.time);
    this.samples++;
    this.count(
      this.sampled,
      'challenge_recovery_players',
      state.players.filter((p) => p.challengeRecovery && p.challengeRecovery.until > state.time)
        .length,
    );
    const threats = observeDepthThreats(state),
      defence = deriveDepthDefence(state, threats);
    this.count(this.sampled, 'credible_depth_threats', threats.filter((t) => t.credible).length);
    for (const a of defence) this.count(this.sampled, `depth_defence_${a.intention}`);
    const aerialAssignments = deriveAerialAssignments(state);
    this.count(this.sampled, 'aerial_assignments', aerialAssignments.length);
    for (const side of ['home', 'away'] as const) {
      const dir = attacksRight(side, state) ? 1 : -1,
        line = calculateOffsideLine(state, side);
      const forwards = state.players.filter(
        (p) =>
          p.team === side && ['striker', 'left_winger', 'right_winger'].includes(p.slot.position),
      );
      if (side === state.possessionTeam && state.ball.ownerId) {
        this.count(
          this.sampled,
          'forward_line_gap_metres',
          forwards.reduce((n, p) => n + dir * (line - p.position.x), 0),
        );
        this.count(this.sampled, 'forward_observations', forwards.length);
        this.count(
          this.sampled,
          'depth_behind_line_metres',
          attacksRight(side, state) ? 105 - line : line,
        );
        this.count(this.sampled, 'attacking_shape_observations');
      }
      for (const a of deriveFlankRunAssignments(state, side))
        this.count(this.sampled, a.relationship);
      const shape = deriveTeamShapeMetrics(state, side);
      this.count(this.sampled, 'box_occupants', shape.boxAttackers);
      this.count(this.sampled, 'team_shape_observations');
      this.count(this.sampled, 'block_width_metres', shape.width);
      this.count(this.sampled, 'block_length_metres', shape.length);
      this.count(this.sampled, 'defence_midfield_gap_metres', shape.lines.defenceToMidfield);
      this.count(this.sampled, 'midfield_attack_gap_metres', shape.lines.midfieldToAttack);
      this.count(
        this.sampled,
        'defensive_line_from_own_goal_metres',
        shape.lines.defensiveLine + 52.5,
      );
      if (this.shape.length < 32) this.shape.push({ at: state.time, side, line, ...shape });
    }
    const owner = state.players.find((p) => p.id === state.ball.ownerId);
    if (owner) {
      const crosses = deriveCrossOpportunities(state, owner);
      if (crosses.length) {
        this.count(this.sampled, 'crossing_positions');
        this.count(this.sampled, 'cross_candidates', crosses.length);
      }
      if (Math.abs(owner.position.y - 34) > 15) {
        const opponents = state.players
          .filter((p) => p.team !== owner.team && !isMatchGoalkeeper(p))
          .sort(
            (a, b) => distance(a.position, owner.position) - distance(b.position, owner.position),
          );
        const defender = opponents[0];
        if (defender && distance(defender.position, owner.position) < 10) {
          this.count(this.sampled, 'wing_1v1_exposure');
          const plan = derivePressingPlan(state, defender.id);
          if (plan) this.count(this.sampled, `wing_defence_${plan.behaviour}`);
        }
      }
    }
    if (threats.some((t) => t.credible)) this.add('depth_threat', state.time, { threats, defence });
  }
  export(state: TacticalMatchState) {
    const sprintDistance = [...state.players, ...(state.departedPlayers ?? [])].reduce(
      (n, p) => n + (p.fitness?.workload.distanceSprint ?? 0),
      0,
    );
    return {
      ...spatialEvidenceSchema.parse({
        ...this,
        events: {
          ...this.events,
          unresolved_behind_line_passes: this.depthPasses.size,
          unresolved_wide_take_on: this.activeTakeOn ? 1 : 0,
        },
      }),
      sprintDistance,
      definitions: {
        sampled:
          'one-second in-play exposure, not independent events; mean forward gap uses forward_observations',
        events:
          'canonical action sequence plus unique carry-intent/aerial contact IDs; opportunities include unsuccessful contacts; unresolved counters describe the final endpoint',
        secondBalls:
          'first actual owner acquisition within 8s of aerial contact, before restart/shot; temporal lineage, not causal attribution',
        trace: 'first 96 examples; shape: first 32 team samples',
        takeOns:
          'unique wide carry intents with nearest non-keeper opponent within 8m and not already more than 1m behind; passed marker requires >1m goalward lead with actual control. Ending outcomes are control states, not universal dribble success/failure; released_or_loose includes deliberate passes and knock-ons.',
        behindLine:
          'canonical pass/through-pass releases with physical target >0.5m beyond the pre-release legal defender/ball/halfway line; outcome follows the same canonical parent ID. A target is not proof of reception or a successful depth run.',
      },
    };
  }
}
