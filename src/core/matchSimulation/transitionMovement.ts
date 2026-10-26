import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observeBoundedScene } from './boundedPerception';
import { clampPitchPoint, distance, distanceToSegment } from './matchSpace';
import {
  transitionRunSchema,
  type transitionRuntimeSchema,
  estimateUsefulContact,
  observedOffsideAssessment,
  boundedPositionThreat,
} from './opportunityWindows';
import type { z } from 'zod';

type Runtime = z.infer<typeof transitionRuntimeSchema>;
const human = (s: TacticalMatchState, id: string) =>
  s.playerAgencyEnabled !== false && s.controlledFootballerId === id;

/** Each run is built from the runner's local scene after an observed physical
 * release. Two jobs bound coordination/memory. There is no reserved return pass. */
export const observeTransitionRelease = (
  before: TacticalMatchState,
  after: TacticalMatchState,
): TacticalMatchState => {
  const pass = after.lastPassDiagnostic;
  if (
    !after.experimentalTransitionIntelligence ||
    before.restart ||
    before.postGoal ||
    !pass ||
    pass.passId === before.lastPassDiagnostic?.passId ||
    pass.releasedAt !== after.time
  )
    return after;
  const runs: Runtime['runs'] = [];
  for (const actor of before.players) {
    if (
      actor.slot.position === 'goalkeeper' ||
      actor.slot.position === 'center_back' ||
      (/back/.test(actor.slot.position) && actor.duty !== 'attack') ||
      actor.duty === 'defend' ||
      human(before, actor.id) ||
      before.discipline?.[actor.id]?.sentOff
    )
      continue;
    const s = observeBoundedScene(before, actor);
    const ownRelease = actor.id === pass.passerId;
    const source = ownRelease
      ? { position: s.position, team: s.team }
      : s.visible.find((p) => p.id === pass.passerId);
    if (
      !source ||
      source.team !== s.team ||
      (!ownRelease && distance(source.position, s.position) > 24)
    )
      continue;
    // The passer knows their own recipient. Others see a release direction, not
    // the private receiver identity or the recipient's next planned action.
    if (ownRelease && actor.id === pass.intendedReceiverId) continue;
    const current = after.players.find((p) => p.id === actor.id);
    const releasedScene = current ? observeBoundedScene(after, current) : undefined;
    if (!releasedScene?.ball) continue;
    const flight = releasedScene.ball.velocity;
    if (!ownRelease && flight) {
      const dx = actor.position.x - releasedScene.ball.position.x,
        dy = actor.position.y - releasedScene.ball.position.y;
      const along = dx * flight.x + dy * flight.y;
      const across =
        Math.abs(dx * flight.y - dy * flight.x) / Math.max(0.1, Math.hypot(flight.x, flight.y));
      if (along > 0 && across < 2) continue;
    }
    const cover = s.visible.filter(
      (p) =>
        p.team === s.team &&
        !p.keeper &&
        p.id !== pass.passerId &&
        s.direction * (source.position.x - p.position.x) > 3,
    );
    if (
      cover.length < (ownRelease ? 1 : 2) ||
      !s.config.patterns ||
      s.instructions.includes('hold_position')
    )
      continue;
    const foes = s.visible.filter((p) => p.team !== s.team);
    const offside = observedOffsideAssessment(s, actor.position);
    if (!offside.uncertain && offside.risk > 0) continue;
    const targets = [-4, 0, 4].map((lateral) =>
      clampPitchPoint({
        x: actor.position.x + s.direction * Math.min(9, s.capability.runSpeed * 1.4),
        y: actor.position.y + lateral,
      }),
    );
    const options = targets
      .map((target) => {
        const arrival = estimateUsefulContact(
          { position: s.position, velocity: s.velocity, facing: s.facing },
          target,
          s.capability.maximumSprintSpeed,
          s.capability.acceleration,
          0,
        );
        const opponent = Math.min(
          5,
          ...foes.map((p) => estimateUsefulContact(p, target).playableSeconds),
        );
        const lane = Math.min(
          8,
          ...foes.map((p) => distanceToSegment(p.position, source.position, target)),
        );
        return { target, margin: opponent - arrival.playableSeconds, lane };
      })
      .filter((p) => p.margin > -0.2 && p.lane > 1 && distance(p.target, s.position) > 3)
      .sort((a, b) => b.margin - a.margin || b.lane - a.lane);
    const best = options[0];
    if (!best) continue;
    const reaction = 0.3 - ((s.attributes.gameReading + s.attributes.concentration) / 200) * 0.18;
    runs.push(
      transitionRunSchema.parse({
        actorId: actor.id,
        sourceId: pass.passerId,
        kind: ownRelease ? 'pass_and_run' : 'third_man',
        origin: s.position,
        target: best.target,
        observedAt: after.time,
        recognisedAt: after.time + reaction,
        expiresAt: after.time + 3.6,
        reason: 'visible_space_with_rest_cover_no_return_promise',
      }),
    );
  }
  runs.sort(
    (a, b) =>
      Number(b.kind === 'pass_and_run') - Number(a.kind === 'pass_and_run') ||
      a.actorId.localeCompare(b.actorId),
  );
  const retained =
    after.transitionRuntime?.runs.filter(
      (r) => r.expiresAt > after.time && !runs.some((n) => n.actorId === r.actorId),
    ) ?? [];
  return {
    ...after,
    transitionRuntime: {
      ...after.transitionRuntime,
      lastScanAt: after.time,
      runs: [...runs, ...retained].slice(0, 2),
    },
  };
};

export const advanceTransitionRuns = (s: TacticalMatchState): TacticalMatchState => {
  if (
    !s.experimentalTransitionIntelligence ||
    !s.transitionRuntime ||
    s.time - s.transitionRuntime.lastScanAt < 0.1 - 1e-8
  )
    return s;
  const runs = s.transitionRuntime.runs.filter((run) => {
    const actor = s.players.find((p) => p.id === run.actorId);
    if (
      !actor ||
      s.restart ||
      s.postGoal ||
      s.time >= run.expiresAt ||
      human(s, run.actorId) ||
      s.ball.ownerId === run.actorId ||
      s.discipline?.[run.actorId]?.sentOff
    )
      return false;
    const scene = observeBoundedScene(s, actor);
    if (!scene.ball) return false;
    const owner = scene.visible.find((p) => p.id === scene.ball?.ownerId);
    if (owner && owner.team !== actor.team) return false;
    return distance(actor.position, run.target) > 0.8;
  });
  return { ...s, transitionRuntime: { ...s.transitionRuntime, lastScanAt: s.time, runs } };
};

/** Defenders respond to visible velocity and goal-side danger, including during
 * flight. They never inspect an attacker's run ID, future pass or private intent.
 * A nearer covering teammate can own the job; a lone central screen can stay. */
export const advanceTransitionDefence = (state: TacticalMatchState): TacticalMatchState => {
  if (
    !state.experimentalTransitionIntelligence ||
    state.time - (state.transitionRuntime?.defenceScanAt ?? -1) < 0.1 - 1e-8
  )
    return state;
  const players = state.players.map((actor) => {
    const { transitionMark: _old, ...unmarked } = actor;
    void _old;
    if (
      actor.slot.position === 'goalkeeper' ||
      human(state, actor.id) ||
      state.restart ||
      state.postGoal ||
      state.discipline?.[actor.id]?.sentOff
    )
      return actor.transitionMark ? unmarked : actor;
    const s = observeBoundedScene(state, actor);
    if (
      !s.ball ||
      s.ball.ownerId === actor.id ||
      s.visible.some((p) => p.id === s.ball?.ownerId && p.team === actor.team)
    )
      return actor.transitionMark ? unmarked : actor;
    const friends = s.visible.filter((p) => p.team === s.team && !p.keeper);
    const owner = s.visible.find((p) => p.id === s.ball?.ownerId);
    const ballThreat = boundedPositionThreat(-s.direction, s.ball.position);
    const screen = actor.slot.position === 'center_back' && Math.abs(actor.position.y - 34) < 12;
    const centralCover = friends.some(
      (p) =>
        Math.abs(p.position.y - 34) < 12 && s.direction * (s.ball!.position.x - p.position.x) > 0,
    );
    const options = s.visible
      .filter(
        (p) =>
          p.team !== s.team && !p.keeper && p.id !== owner?.id && -s.direction * p.velocity.x > 1,
      )
      .map((p) => {
        const target = clampPitchPoint({
          x: p.position.x + p.velocity.x * 0.65 - s.direction * 1.2,
          y: p.position.y + p.velocity.y * 0.65,
        });
        const ours = estimateUsefulContact(
          { position: s.position, velocity: s.velocity, facing: s.facing },
          target,
          s.capability.maximumSprintSpeed,
          s.capability.acceleration,
        ).playableSeconds;
        const covered = friends.some(
          (q) =>
            estimateUsefulContact(q, target).playableSeconds + 0.2 < ours &&
            s.direction * (p.position.x - q.position.x) >= -1,
        );
        const threat = boundedPositionThreat(-s.direction, target);
        return { runnerId: p.id, target, ours, covered, threat };
      })
      .filter(
        (p) =>
          !p.covered &&
          p.ours < 3 &&
          p.threat > ballThreat &&
          (!screen || centralCover || Math.abs(p.target.y - 34) < 14),
      )
      .sort((a, b) => b.threat - a.threat || a.ours - b.ours);
    const best = options[0];
    return best
      ? {
          ...actor,
          transitionMark: {
            runnerId: best.runnerId,
            observedAt: state.time,
            target: best.target,
            runnerThreat: best.threat,
            ballThreat,
          },
        }
      : actor.transitionMark
        ? unmarked
        : actor;
  });
  return {
    ...state,
    players,
    transitionRuntime: {
      lastScanAt: state.transitionRuntime?.lastScanAt ?? state.time,
      runs: state.transitionRuntime?.runs ?? [],
      defenceScanAt: state.time,
    },
  };
};

export const transitionRunTarget = (s: TacticalMatchState, actor: MatchPlayerState) => {
  if (
    !s.experimentalTransitionIntelligence ||
    s.restart ||
    s.postGoal ||
    human(s, actor.id) ||
    s.ball.ownerId === actor.id
  )
    return;
  const run = s.transitionRuntime?.runs.find(
    (p) => p.actorId === actor.id && s.time >= p.recognisedAt && s.time < p.expiresAt,
  );
  return run?.target;
};
