// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createOpenPlayMatchFixture as createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { createMatchFitness } from './matchFitness';
import { awardNaturalRestart } from './restartScenarios';
import {
  planCoachSubstitutions,
  substitutionOpportunityCost,
  evaluateRoleReplacement,
} from './substitutions';
import { deriveGoalkeeperApproach } from './goalkeeperPositioning';
import { deriveTacticalTargets } from './tacticalPositioning';
import { deriveTacticalRolePhase } from './roleTactics';
import { assessCoachTactics } from './coachIntelligence';
import { withRankingObserver } from './decisionObservation';
import { distance } from './matchSpace';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const initial = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr183-controlled',
      control: { mode: 'spectator' },
    }),
  );

const substitutionFixture = (time = 180) => {
  const state = awardNaturalRestart({ ...initial(), time }, 'throw_in', {
    restartTeam: 'home',
    restartPoint: { x: 52, y: 0 },
  });
  for (const player of state.players) player.fitness = createMatchFitness();
  const outgoing = state.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!;
  const incoming = {
    id: 'pr183-reserve',
    condition: 100,
    profile: { ...structuredClone(outgoing.profile), id: 'pr183-reserve' },
  };
  state.bench = { home: [incoming], away: [] };
  return { state, outgoing, incoming };
};

describe('PR183 strategic substitutions', () => {
  it('retains a healthy equal-strength opening XI and a slightly better reserve', () => {
    const { state, incoming } = substitutionFixture();
    expect(planCoachSubstitutions(state).substitutionState!.pending).toHaveLength(0);
    incoming.profile.attributes.finishing = Math.min(
      100,
      incoming.profile.attributes.finishing + 3,
    );
    expect(planCoachSubstitutions(state).substitutionState!.pending).toHaveLength(0);
  });
  it('does not double-count a recoverable burst deficit as role unsuitability', () => {
    const { state, outgoing, incoming } = substitutionFixture();
    const fresh = evaluateRoleReplacement(state, outgoing, incoming).roleBenefit;
    outgoing.fitness!.burstReadiness = 0.05;
    expect(evaluateRoleReplacement(state, outgoing, incoming).roleBenefit).toBe(fresh);
    expect(planCoachSubstitutions(state).substitutionState!.pending).toHaveLength(0);
  });
  it('allows an actual injury replacement in minute three', () => {
    const { state, outgoing } = substitutionFixture();
    outgoing.injury = {
      id: 'pr183-injury',
      playerId: outgoing.id,
      at: 179,
      status: 'unable',
      mechanism: 'contact',
      injuryType: 'impact',
      recoveryDays: 4,
      assessmentRequired: true,
    };
    const requests = planCoachSubstitutions(state).substitutionState!.pending;
    expect(requests).toHaveLength(1);
    expect(requests[0]!.reason).toBe('injury');
  });
  it('reorganises a minute-two dismissal without trying to replace the dismissed player', () => {
    const { state } = substitutionFixture(120);
    const defender = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'center_back',
    )!;
    state.discipline = {
      [defender.id]: { team: 'home', yellowCards: 0, sentOff: true, sentOffAt: 119 },
    };
    state.players = state.players.filter((p) => p.id !== defender.id);
    state.departedPlayers = [defender];
    const organised = assessCoachTactics(state, false, true);
    expect(organised.teams.home.coaching!.plan).toBe('reorganise');
    expect(organised.players.filter((p) => p.team === 'home')).toHaveLength(10);
    expect(
      planCoachSubstitutions(organised).substitutionState!.pending.some(
        (r) => r.outgoing.id === defender.id,
      ),
    ).toBe(false);
  });
  it('allows a severe observed mismatch early instead of imposing a minute ban', () => {
    const { state, outgoing, incoming } = substitutionFixture();
    state.teams.home.coaching!.samples = 24;
    for (const key of Object.keys(
      outgoing.profile.attributes,
    ) as (keyof typeof outgoing.profile.attributes)[]) {
      outgoing.profile.attributes[key] = 15;
      incoming.profile.attributes[key] = 90;
    }
    expect(planCoachSubstitutions(state).substitutionState!.pending).toHaveLength(1);
  });
  it('prices repeated dangerous exposure of a booked player from actual challenge evidence', () => {
    const { state, outgoing, incoming } = substitutionFixture();
    state.discipline = { [outgoing.id]: { team: 'home', yellowCards: 1, sentOff: false } };
    const ordinary = evaluateRoleReplacement(state, outgoing, incoming).cardRisk;
    state.defensiveTelemetry = {
      opportunities: 6,
      attempted: 6,
      missed: 0,
      beaten: 0,
      cleanWins: 0,
      looseBalls: 0,
      fouls: 3,
      yellowCards: 1,
      redCards: 0,
      secondYellowDismissals: 0,
      straightReds: 0,
      penalties: 0,
      advantageRecalled: 0,
      highRiskIntents: 4,
      slides: 0,
      tacticalIntents: 0,
      advantagePlayed: 0,
      byPlayer: {},
    };
    state.defensiveTelemetry.byPlayer[outgoing.id] = {
      ...state.defensiveTelemetry,
      fouls: 3,
      highRiskIntents: 4,
    };
    expect(evaluateRoleReplacement(state, outgoing, incoming).cardRisk).toBeGreaterThan(ordinary);
  });
  it('values significant late fatigue and a suitable halftime replacement', () => {
    const { state, outgoing } = substitutionFixture(4800);
    outgoing.fitness = { ...createMatchFitness(), longTermCapacity: 0.2, burstReadiness: 0.03 };
    expect(planCoachSubstitutions(state).substitutionState!.pending[0]!.reason).toBe('fatigue');
    state.time = 2800;
    state.status = 'half_time';
    expect(planCoachSubstitutions(state).substitutionState!.pending[0]!.roleId).toBeDefined();
  });
  it('preserves scarcity, marginal batch cost and the absence of a suitable reserve', () => {
    const { state } = substitutionFixture();
    expect(substitutionOpportunityCost(state, 'home', 3)).toBeGreaterThan(
      substitutionOpportunityCost(state, 'home'),
    );
    const early = substitutionOpportunityCost(state, 'home');
    state.time = 4800;
    expect(substitutionOpportunityCost(state, 'home')).toBeLessThan(early);
    state.bench!.home = [];
    expect(planCoachSubstitutions(state).substitutionState!.pending).toHaveLength(0);
  });
});

describe('PR183 native frozen retreat continuations', () => {
  it.each(['cm13', 'cm14'])(
    'restores useful choices in the long %s carry without forcing a pass',
    (name) => {
      const raw = JSON.parse(
        gunzipSync(
          readFileSync(`docs/performance/pr183-evidence/native-retreat-${name}.json.gz`),
        ).toString(),
      ) as TacticalMatchState;
      tacticalMatchStateSchema.parse(raw);
      let state = structuredClone(raw);
      const id = state.ball.ownerId!,
        origin = state.players.find((p) => p.id === id)!.position;
      const rankings: { at: number; pass: boolean }[] = [];
      for (let tick = 0; tick < 20 / 0.025 && state.ball.ownerId === id; tick++) {
        state = withRankingObserver(
          (s, actorId, ranked) => {
            if (actorId === id)
              rankings.push({ at: s.time, pass: ranked.some((r) => r.action.type === 'pass') });
          },
          () => stepTacticalMatchAfterDecisionProbe(state, 0.025),
        );
      }
      expect(rankings.some((r) => r.pass)).toBe(true);
      const end = state.players.find((p) => p.id === id)!.position;
      expect(origin.x - end.x).toBeLessThan(12);
      expect(state.time).toBeLessThan(raw.time + 20);
      expect(state.lastPassDiagnostic?.releasedAt ?? 0).toBeGreaterThan(raw.time);
    },
  );
  it('keeps ordinary recycling and build-up as legal tactical states', () => {
    const state = initial();
    delete state.restart;
    state.scenario = 'open_play';
    const actor = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
    )!;
    state.ball = { ...actor.position, ownerId: actor.id };
    expect(['build_up', 'settled_attack', 'rapid_transition']).toContain(
      deriveTacticalRolePhase(state, actor.team),
    );
  });
});

describe('PR183 anticipation of ground breakaways', () => {
  const fixture = (wide = false) => {
    const state = initial();
    delete state.restart;
    state.scenario = 'open_play';
    state.playerAgencyEnabled = false;
    state.time = 600;
    const keeper = state.players.find(
      (p) => p.team === 'away' && p.slot.position === 'goalkeeper',
    )!;
    const attacker = state.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!;
    for (const p of state.players) {
      p.position = { x: 40, y: p.position.y };
      p.target = { ...p.position };
      p.velocity = { x: 0, y: 0 };
    }
    keeper.position = { x: 102, y: 34 };
    keeper.target = { ...keeper.position };
    attacker.position = { x: 83, y: wide ? 46 : 34 };
    attacker.velocity = { x: 5, y: 0 };
    state.ball = {
      x: 83.5,
      y: attacker.position.y,
      ownerId: attacker.id,
      lastTouchPlayerId: attacker.id,
    };
    state.possessionTeam = 'home';
    return { state, keeper, attacker };
  };
  it.each([false, true])(
    'moves toward a credible uncovered central/diagonal threat, wide=%s',
    (wide) => {
      const { state, keeper } = fixture(wide);
      const approach = deriveGoalkeeperApproach(state, keeper)!;
      expect(approach).toBeDefined();
      expect(approach.target.x).toBeLessThan(100);
      expect(approach.keeperEta).toBeGreaterThan(0);
      expect(distance(approach.target, state.ball)).toBeGreaterThan(2);
      const target = deriveTacticalTargets(state).find((p) => p.id === keeper.id)!.target;
      expect(target.x).toBeLessThan(100);
    },
  );
  it('holds ordinary shape when a defender can immediately cover or no attacker owns the ball', () => {
    const { state, keeper, attacker } = fixture();
    const defender = state.players.find((p) => p.team === 'away' && p.id !== keeper.id)!;
    defender.position = { x: attacker.position.x + 0.5, y: attacker.position.y };
    expect(deriveGoalkeeperApproach(state, keeper)).toBeUndefined();
    delete state.ball.ownerId;
    expect(deriveGoalkeeperApproach(state, keeper)).toBeUndefined();
  });
  it('reads human attackers identically and preserves explicit keeper control', () => {
    const { state, keeper, attacker } = fixture();
    const npc = deriveGoalkeeperApproach(state, keeper);
    state.playerAgencyEnabled = true;
    state.controlledFootballerId = attacker.id;
    expect(deriveGoalkeeperApproach(state, keeper)).toEqual(npc);
    state.controlledFootballerId = keeper.id;
    expect(deriveGoalkeeperApproach(state, keeper)).toBeUndefined();
  });
  it('leaves an out-of-play ball to the boundary resolver, without an invalid arrival target', () => {
    const { state, keeper } = fixture(true);
    state.ball.x = 105.2;
    expect(deriveGoalkeeperApproach(state, keeper)).toBeUndefined();
  });
});
