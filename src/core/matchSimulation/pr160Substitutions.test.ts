// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { isEligibleForNormalPosition } from '../footballerWorld';
import { createTacticalMatch, stepTacticalMatch, startSecondHalf } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { awardNaturalRestart } from './restartScenarios';
import { enforceMinimumPlayers, advanceMatchRules } from './matchRules';
import {
  observePlayerMatchStats,
  createMatchStatistics,
  assertMatchStatisticsInvariants,
} from './playerMatchStats';
import { createMatchFitness } from './matchFitness';
import {
  requestSubstitutions,
  stepSubstitutionInterval,
  advanceMatchSubstitutions,
  planCoachSubstitutions,
  completeHalftimeSubstitutions,
  minimumEligiblePlayerCount,
  substitutionBlocksRestart,
  projectMatchVisiblePlayers,
} from './substitutions';
import {
  processInjuryAssessment,
  stepInjuryAssessmentInterval,
  observeDroppedBallContact,
  resolveDroppedBallGoalOutcome,
} from './injuryStoppage';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { endStoppage } from './stoppageLedger';
import { resolveMatchAction } from './matchActions';

const world = createCanonicalWorldDatabase();
const session = () =>
  createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'pr160-substitution',
    control: { mode: 'spectator' },
  });
const fixture = () => {
  const initial = createTacticalMatch(session());
  const timed = { ...initial, time: 3600, status: 'second_half' as const };
  return awardNaturalRestart(timed, 'throw_in', {
    restartTeam: 'home',
    restartPoint: { x: 50, y: 0 },
  });
};
const pair = (state: TacticalMatchState, position?: string, exclude: string[] = []) => {
  for (const outgoing of state.players.filter(
    (player) =>
      player.team === 'home' &&
      !exclude.includes(player.id) &&
      (position ? player.slot.position === position : player.slot.position !== 'goalkeeper'),
  )) {
    const incoming = state.bench?.home.find(
      (player) =>
        !exclude.includes(player.id) &&
        isEligibleForNormalPosition(player.profile, outgoing.slot.position),
    );
    if (incoming) return { outgoingId: outgoing.id, incomingId: incoming.id };
  }
  throw new Error('Fixture lacks a legal bench pair.');
};
const finish = (initial: TacticalMatchState, seconds = 35) => {
  let state = initial;
  for (
    let tick = 0;
    tick < seconds / 0.025 &&
    state.substitutionState?.pending.length &&
    substitutionBlocksRestart(state);
    tick++
  ) {
    const next = stepSubstitutionInterval(state, 0.025);
    state = {
      ...next,
      statistics: observePlayerMatchStats(
        state.statistics ?? createMatchStatistics(state),
        state,
        next,
      ),
    };
  }
  return state;
};

describe('PR160 real bench and legal physical substitutions', () => {
  it('names genuine active squad profiles, preserves attributes/condition and excludes XI', () => {
    const match = session();
    for (const side of ['home', 'away'] as const) {
      const team = match[side];
      expect(team.bench?.length).toBeGreaterThan(0);
      expect(team.bench?.length).toBeLessThanOrEqual(9);
      for (const bench of team.bench!) {
        expect(team.club.squadPlayerIds).toContain(bench.footballerId);
        expect(team.players.some((player) => player.footballerId === bench.footballerId)).toBe(
          false,
        );
        expect(bench.profile).toBe(world.footballers[bench.footballerId]!.profile);
        expect(bench.condition).toBe(world.footballers[bench.footballerId]!.fitness);
      }
    }
  });
  it('carries a real bench player’s persisted playable injury into their own appearance', () => {
    const baseSession = session(),
      benchPlayer = baseSession.home.bench![0]!;
    const original = world.footballers[benchPlayer.footballerId]!;
    const patchedWorld = {
      ...world,
      footballers: {
        ...world.footballers,
        [benchPlayer.footballerId]: {
          ...original,
          condition: {
            capacity: original.fitness ?? 100,
            lastUpdatedDate: '2026-10-09',
            injuryUntilDate: '2026-10-11',
            injuryStatus: 'playable' as const,
          },
        },
      },
    };
    const match = createSingleMatchSession(patchedWorld, baseSession.setup);
    const bench = match.home.bench!.find(
      (player) => player.footballerId === benchPlayer.footballerId,
    )!;
    expect(bench.injury!.status).toBe('playable');
    expect(bench.injury!.recoveryDays).toBe(2);
    const initial = createTacticalMatch(match),
      state = { ...initial, status: 'half_time' as const, time: 2700 };
    const outgoing = state.players.find(
      (player) =>
        player.team === 'home' && isEligibleForNormalPosition(bench.profile, player.slot.position),
    )!;
    const completed = completeHalftimeSubstitutions(
      requestSubstitutions(state, 'home', [
        { outgoingId: outgoing.id, incomingId: bench.footballerId },
      ]),
    );
    expect(completed.players.find((player) => player.id === bench.footballerId)!.injury).toEqual(
      bench.injury,
    );
  });
  it('physically walks out and enters at halfway only after legal exit, with new identity', () => {
    const state = fixture(),
      change = pair(state),
      original = state.players.find((player) => player.id === change.outgoingId)!;
    const requested = requestSubstitutions(state, 'home', [change]);
    expect(requested.players.some((player) => player.id === change.outgoingId)).toBe(false);
    expect(requested.players.some((player) => player.id === change.incomingId)).toBe(false);
    expect(
      projectMatchVisiblePlayers(requested).find((player) => player.id === change.outgoingId)!
        .position,
    ).toEqual(original.position);
    expect(requested.substitutionState!.pending[0]!.outgoing.position).toEqual(original.position);
    const oneTick = stepSubstitutionInterval(requested, 0.025);
    expect(oneTick.substitutionState!.pending[0]!.outgoing.position).not.toEqual(original.position);
    expect(
      distance2(original.position, oneTick.substitutionState!.pending[0]!.outgoing.position),
    ).toBeLessThan(0.03);
    const finished = finish(oneTick);
    expect(finished.substitutionState!.pending).toHaveLength(0);
    expect(
      projectMatchVisiblePlayers(finished).some((player) => player.id === change.outgoingId),
    ).toBe(false);
    const fact = finished.substitutionState!.completed[0]!;
    expect(fact.enteredAt).toBeGreaterThan(fact.leftAt);
    const incoming = finished.players.find((player) => player.id === change.incomingId)!;
    expect(incoming.position.x).toBe(52.5);
    expect(incoming.slot).toEqual(original.slot);
    expect(incoming.profile).toBe(world.footballers[change.incomingId]!.profile);
    expect(
      finished.statistics!.players.find((player) => player.playerId === original.id)!
        .distanceCovered,
    ).toBeGreaterThan(original.locomotionTelemetry?.distanceTotal ?? 0);
    expect(finished.departedPlayers!.find((player) => player.id === original.id)!.profile).toBe(
      original.profile,
    );
    expect(tacticalMatchStateSchema.safeParse(finished).success).toBe(true);
  });
  it('combines multiple replacements in one opportunity and preserves both final statistics', () => {
    let state = fixture();
    const first = pair(state),
      second = pair(state, undefined, [first.outgoingId, first.incomingId]);
    state = requestSubstitutions(state, 'home', [first, second]);
    expect(state.substitutionState!.used.home).toBe(2);
    expect(state.substitutionState!.opportunities.home).toBe(1);
    const finished = finish(state);
    expect(finished.substitutionState!.completed).toHaveLength(2);
    for (const change of [first, second]) {
      const fact = finished.substitutionState!.completed.find(
        (value) => value.outgoingId === change.outgoingId,
      )!;
      expect(
        finished.statistics!.players.find((value) => value.playerId === change.outgoingId)!
          .minutesPlayed,
      ).toBeCloseTo(fact.leftAt / 60, 6);
      expect(
        finished.statistics!.players.find((value) => value.playerId === change.incomingId)!
          .minutesPlayed,
      ).toBeGreaterThanOrEqual(0);
    }
    assertMatchStatisticsInvariants(finished.statistics!, finished);
  });
  it('gives a fresh entrant their own body state and preserves only their own history on permitted return', () => {
    const initial = fixture(),
      change = pair(initial);
    const state: TacticalMatchState = {
      ...initial,
      substitutionRules: { ...initial.substitutionRules!, returnSubstitutions: true },
      players: initial.players.map((player) =>
        player.id === change.outgoingId
          ? {
              ...player,
              position: { x: 52.5, y: 0.5 },
              goalkeeperRole: true,
              desiredFacingAngle: 2,
              movementMode: 'backpedal' as const,
              turnRate: 9,
              locomotionIntensity: 'sprint' as const,
              locomotionReason: 'press_commit' as const,
              targetSpeed: 9,
              sprintStartedAt: initial.time - 1,
              locomotionTelemetry: {
                distanceTotal: 1000,
                distanceWalk: 1000,
                distanceJog: 0,
                distanceRun: 0,
                distanceSprint: 0,
                sprintSeconds: 0,
                sprintBursts: 0,
                maxSpeed: 0,
              },
            }
          : player,
      ),
    };
    const first = finish(requestSubstitutions(state, 'home', [change]));
    const entrant = first.players.find((player) => player.id === change.incomingId)!;
    for (const field of [
      'goalkeeperRole',
      'desiredFacingAngle',
      'movementMode',
      'turnRate',
      'locomotionIntensity',
      'locomotionReason',
      'targetSpeed',
      'sprintStartedAt',
    ])
      expect(entrant).not.toHaveProperty(field);
    expect(entrant.locomotionTelemetry!.distanceTotal).toBeLessThan(1);
    const ownHistory = first.departedPlayers!.find((player) => player.id === change.outgoingId)!;
    const returned = finish(
      requestSubstitutions(first, 'home', [
        { outgoingId: change.incomingId, incomingId: change.outgoingId },
      ]),
    );
    const returning = returned.players.find((player) => player.id === change.outgoingId)!;
    expect(returned.departedPlayers!.some((player) => player.id === returning.id)).toBe(false);
    expect(new Set(returned.departedPlayers!.map((player) => player.id)).size).toBe(
      returned.departedPlayers!.length,
    );
    expect(returning.profile).toBe(ownHistory.profile);
    expect(returning.fitness!.workload.seconds).toBeGreaterThan(
      ownHistory.fitness!.workload.seconds,
    );
    expect(returning.locomotionTelemetry!.distanceTotal).toBeGreaterThan(
      ownHistory.locomotionTelemetry!.distanceTotal,
    );
    const afterMinute = { ...returned, time: returned.time + 60 };
    const statistics = observePlayerMatchStats(returned.statistics!, returned, afterMinute);
    expect(
      statistics.players.find((player) => player.playerId === returning.id)!.minutesPlayed,
    ).toBeCloseTo(
      first.statistics!.players.find((player) => player.playerId === returning.id)!.minutesPlayed +
        1,
      6,
    );
    assertMatchStatisticsInvariants(statistics, afterMinute);
    expect(tacticalMatchStateSchema.safeParse(returned).success).toBe(true);
    const dismissed = advanceMatchRules(afterMinute, {
      ...afterMinute,
      statistics,
      pendingCards: [
        {
          id: 'return-entry-red-card',
          challengeId: 'return-entry-infringement',
          at: afterMinute.time,
          actorId: returning.id,
          team: returning.team,
          opponentId: afterMinute.players.find((player) => player.team === 'away')!.id,
          awardedTeam: 'away',
          position: returning.position,
          severity: 'excessive_force',
          tactical: false,
          promisingAttack: false,
          dogso: false,
          penalty: false,
          card: 'red',
        },
      ],
    });
    const afterDismissal = observePlayerMatchStats(statistics, afterMinute, dismissed);
    const sentOff = afterDismissal.players.find((player) => player.playerId === returning.id)!;
    expect(dismissed.players.some((player) => player.id === returning.id)).toBe(false);
    expect(sentOff.redCards).toBe(1);
    expect(sentOff.minutesPlayed).toBeCloseTo(
      statistics.players.find((player) => player.playerId === returning.id)!.minutesPlayed,
      6,
    );
    assertMatchStatisticsInvariants(afterDismissal, dismissed);
    const later = observePlayerMatchStats(afterDismissal, dismissed, {
      ...dismissed,
      time: dismissed.time + 30,
      statistics: afterDismissal,
    });
    expect(later.players.find((player) => player.playerId === returning.id)!.minutesPlayed).toBe(
      sentOff.minutesPlayed,
    );
  });
  it('rejects open-play, duplicate names, outsiders and a dismissed outgoing player atomically', () => {
    const state = fixture(),
      change = pair(state),
      open = { ...state, scenario: 'open_play' as const };
    delete open.restart;
    delete open.stoppageLedger;
    expect(requestSubstitutions(open, 'home', [change])).toBe(open);
    expect(requestSubstitutions(state, 'home', [change, change])).toBe(state);
    expect(requestSubstitutions(state, 'home', [{ ...change, incomingId: 'outsider' }])).toBe(
      state,
    );
    const dismissed = {
      ...state,
      discipline: {
        [change.outgoingId]: {
          yellowCards: 0,
          sentOff: true,
          sentOffAt: state.time,
          team: 'home' as const,
        },
      },
    };
    expect(requestSubstitutions(dismissed, 'home', [change])).toBe(dismissed);
  });
  it('enforces player and opportunity limits and prohibits bench reuse/re-entry', () => {
    const state = fixture(),
      change = pair(state);
    const limited = {
      ...state,
      substitutionState: { ...state.substitutionState!, used: { home: 5, away: 0 } },
    };
    expect(requestSubstitutions(limited, 'home', [change])).toBe(limited);
    const spent = {
      ...state,
      substitutionState: { ...state.substitutionState!, opportunities: { home: 3, away: 0 } },
    };
    expect(requestSubstitutions(spent, 'home', [change])).toBe(spent);
    const finished = finish(requestSubstitutions(state, 'home', [change]));
    const illegal = {
      ...finished,
      bench: {
        ...finished.bench!,
        home: [
          ...finished.bench!.home,
          {
            id: change.outgoingId,
            profile: world.footballers[change.outgoingId]!.profile,
            condition: 100,
          },
        ],
      },
    };
    expect(
      requestSubstitutions(illegal, 'home', [
        { outgoingId: change.incomingId, incomingId: change.outgoingId },
      ]),
    ).toBe(illegal);
  });
  it('cannot replace an already substituted injured departure with another bench player', () => {
    const base = fixture(),
      change = pair(base),
      outgoing = base.players.find((player) => player.id === change.outgoingId)!;
    const injured = {
      ...outgoing,
      injury: {
        id: 'old-injury',
        playerId: outgoing.id,
        at: base.time,
        status: 'unable' as const,
        mechanism: 'contact' as const,
        injuryType: 'impact' as const,
        recoveryDays: 3,
        assessmentRequired: true,
      },
    };
    const finished = finish(
      requestSubstitutions(
        {
          ...base,
          players: base.players.map((player) => (player.id === outgoing.id ? injured : player)),
        },
        'home',
        [change],
      ),
      70,
    );
    const another = finished.bench!.home.find((player) =>
      isEligibleForNormalPosition(player.profile, outgoing.slot.position),
    );
    expect(another).toBeDefined();
    expect(
      requestSubstitutions(finished, 'home', [
        { outgoingId: outgoing.id, incomingId: another!.id },
      ]),
    ).toBe(finished);
  });
  it('makes halftime changes without using opportunities or adding playing seconds', () => {
    const state = { ...fixture(), status: 'half_time' as const, time: 2700 },
      change = pair(state);
    const request = requestSubstitutions(state, 'home', [change]);
    const complete = completeHalftimeSubstitutions(request);
    expect(complete.time).toBe(2700);
    expect(complete.substitutionState!.pending).toHaveLength(0);
    expect(complete.substitutionState!.opportunities.home).toBe(0);
    expect(startSecondHalf(complete).status).toBe('second_half');
  });
  it('only allows an actual specialist goalkeeper to replace a goalkeeper', () => {
    const state = fixture(),
      change = pair(state, 'goalkeeper');
    const finished = finish(requestSubstitutions(state, 'home', [change]));
    expect(
      finished.players.filter(
        (player) => player.team === 'home' && player.slot.position === 'goalkeeper',
      ),
    ).toHaveLength(1);
    expect(
      finished.players.find((player) => player.id === change.incomingId)!.profile.primaryPosition,
    ).toBe('goalkeeper');
    const outfielder = state.bench!.home.find(
      (player) => player.profile.primaryPosition !== 'goalkeeper',
    )!;
    expect(requestSubstitutions(state, 'home', [{ ...change, incomingId: outfielder.id }])).toBe(
      state,
    );
  });
  it('preserves controlled identity, clears decisions and offers no control over replacement', () => {
    const initial = fixture(),
      change = pair(initial),
      state = { ...initial, controlledFootballerId: change.outgoingId };
    const requested = requestSubstitutions(state, 'home', [change]);
    const finished = finish(requested);
    expect(finished.controlledFootballerId).toBe(change.outgoingId);
    expect(finished.players.some((player) => player.id === change.outgoingId)).toBe(false);
    expect(projectPlayerDecisionOpportunity(finished)).toBeUndefined();
    expect(
      finished.statistics!.players.some((player) => player.playerId === change.outgoingId),
    ).toBe(true);
  });
  it('coach retains a fit XI but values a fit genuine replacement for exhausted pressing work', () => {
    const base = fixture();
    expect(planCoachSubstitutions(base).substitutionState!.pending).toHaveLength(0);
    const change = pair(base),
      tired = {
        ...base,
        teams: { ...base.teams, home: { ...base.teams.home, style: 'pressing' as const } },
        players: base.players.map((player) =>
          player.id === change.outgoingId
            ? {
                ...player,
                fitness: { ...createMatchFitness(), longTermCapacity: 0.2, burstReadiness: 0.04 },
              }
            : player,
        ),
      };
    const planned = planCoachSubstitutions(tired);
    expect(
      planned.substitutionState!.pending.some(
        (request) => request.outgoing.id === change.outgoingId,
      ),
    ).toBe(true);
    expect(planned.substitutionState!.pending[0]!.reason).toBe('fatigue');
    const complete = finish(planned);
    expect(
      complete.players.find(
        (player) => player.id === complete.substitutionState!.completed[0]!.incomingId,
      )!.fitness!.longTermCapacity,
    ).toBeGreaterThan(0.7);
  });
  it('late exit delays entry until a later stoppage 60 running-clock seconds after restart', () => {
    const base = fixture(),
      change = pair(base),
      requested = requestSubstitutions(base, 'home', [change]);
    const delayed = {
      ...requested,
      substitutionState: {
        ...requested.substitutionState!,
        pending: requested.substitutionState!.pending.map((request) => ({
          ...request,
          delayed: true,
          leftAt: base.time + 3,
        })),
      },
    };
    expect(substitutionBlocksRestart(delayed)).toBe(false);
    const resumed = advanceMatchSubstitutions(
      delayed,
      {
        ...delayed,
        time: base.time + 4,
        restart: { ...delayed.restart!, phase: 'release' as const },
      },
      0.025,
    );
    expect(resumed.substitutionState!.pending[0]!.eligibleEntryAt).toBe(base.time + 64);
    const nextStoppage = awardNaturalRestart(
      endStoppage({ ...resumed, time: base.time + 63 }),
      'throw_in',
      { restartTeam: 'home', restartPoint: { x: 50, y: 0 } },
    );
    expect(
      advanceMatchSubstitutions(resumed, nextStoppage, 0.025).substitutionState!.pending[0]!
        .refereeEntryAt,
    ).toBeUndefined();
    const tooEarlyStoppage = advanceMatchSubstitutions(
      nextStoppage,
      { ...nextStoppage, time: base.time + 65 },
      0.025,
    );
    expect(tooEarlyStoppage.substitutionState!.pending[0]!.refereeEntryAt).toBeUndefined();
    const eligibleStoppage = awardNaturalRestart(
      endStoppage({ ...tooEarlyStoppage, time: base.time + 66 }),
      'throw_in',
      { restartTeam: 'home', restartPoint: { x: 50, y: 0 } },
    );
    const legal = advanceMatchSubstitutions(tooEarlyStoppage, eligibleStoppage, 0.025);
    expect(legal.substitutionState!.pending[0]!.refereeEntryAt).toBe(base.time + 66);
    expect(finish(legal).substitutionState!.completed[0]!.delayed).toBe(true);
  });
  it('completes a pending delayed entrant during the scheduled halftime interval', () => {
    const base = fixture(),
      change = pair(base),
      requested = requestSubstitutions(base, 'home', [change]);
    const half: TacticalMatchState = {
      ...requested,
      status: 'half_time',
      time: 3605,
      substitutionState: {
        ...requested.substitutionState!,
        pending: requested.substitutionState!.pending.map((request) => ({
          ...request,
          delayed: true,
          leftAt: 3604,
          resumedAt: 3604,
          eligibleEntryAt: 3664,
        })),
      },
    };
    const completed = completeHalftimeSubstitutions(half);
    expect(completed.time).toBe(3605);
    expect(completed.substitutionState!.pending).toHaveLength(0);
    expect(completed.substitutionState!.completed).toHaveLength(1);
  });
  it('counts temporary substitution shortage, but an unreplaced injured seventh player ends play', () => {
    const base = fixture(),
      change = pair(base);
    const seven = {
      ...base,
      players: base.players.filter(
        (player) =>
          player.team === 'away' ||
          [
            change.outgoingId,
            ...base.players
              .filter((value) => value.team === 'home' && value.id !== change.outgoingId)
              .slice(0, 6)
              .map((value) => value.id),
          ].includes(player.id),
      ),
    };
    const requested = requestSubstitutions(seven, 'home', [change]);
    expect(requested.players.filter((player) => player.team === 'home')).toHaveLength(6);
    expect(minimumEligiblePlayerCount(requested, 'home')).toBe(7);
    expect(enforceMinimumPlayers(requested).status).not.toBe('abandoned');
    const noReplacement = {
      ...seven,
      players: seven.players.filter((player) => player.id !== change.outgoingId),
      bench: { home: [], away: [] },
    };
    expect(enforceMinimumPlayers(noReplacement).status).toBe('abandoned');
  });
  it('finishes a lawful substitution and restores CPU football flow through the canonical step', () => {
    const base = fixture(),
      change = pair(base);
    let state = requestSubstitutions(base, 'home', [change]);
    for (
      let tick = 0;
      tick < 45 / 0.025 &&
      (state.substitutionState!.pending.length || state.restart?.phase !== 'release');
      tick++
    )
      state = stepTacticalMatch(state, 0.025);
    expect(state.substitutionState!.completed).toHaveLength(1);
    expect(state.substitutionState!.pending).toHaveLength(0);
    expect(state.restart?.phase === 'release' || state.scenario === 'open_play').toBe(true);
    expect(
      state.stoppageLedger?.intervals.some((interval) => interval.reasons.includes('substitution')),
    ).toBe(true);
  });
});

const distance2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('PR160 physical injury assessment and participation', () => {
  const injure = (
    state: TacticalMatchState,
    id: string,
    status: 'playable' | 'unable' = 'unable',
  ): TacticalMatchState => ({
    ...state,
    players: state.players.map((player) =>
      player.id === id
        ? {
            ...player,
            injury: {
              id: `injury:${id}`,
              playerId: id,
              at: state.time,
              status,
              mechanism: 'contact',
              injuryType: 'impact',
              recoveryDays: 3,
              assessmentRequired: status === 'unable',
            },
          }
        : player,
    ),
    ...(status === 'unable' ? { pendingInjuryAssessment: `injury:${id}` } : {}),
  });
  it('keeps a playable injury active without inventing assessment or substitution', () => {
    const base = fixture(),
      change = pair(base),
      injured = injure(base, change.outgoingId, 'playable');
    expect(processInjuryAssessment(injured)).toBe(injured);
    expect(injured.players.find((player) => player.id === change.outgoingId)?.injury?.status).toBe(
      'playable',
    );
  });
  it('merges serious injury into an existing restart and legally replaces without losing history', () => {
    const base = fixture(),
      change = pair(base),
      injured = injure(base, change.outgoingId);
    let state = processInjuryAssessment(injured);
    expect(state.players.some((player) => player.id === change.outgoingId)).toBe(false);
    expect(state.injuryAssessment!.existingRestart).toBe(true);
    expect(state.stoppageLedger!.active!.reasons).toContain('injury');
    expect(state.stoppageLedger!.active!.reasons).toContain('substitution');
    for (let tick = 0; tick < 70 / 0.025 && state.injuryAssessment; tick++)
      state = stepInjuryAssessmentInterval(state, 0.025);
    expect(state.injuryAssessment).toBeUndefined();
    expect(
      state.substitutionState!.completed.some((fact) => fact.outgoingId === change.outgoingId),
    ).toBe(true);
    expect(
      state.departedPlayers!.find((player) => player.id === change.outgoingId)!.injury!.status,
    ).toBe('unable');
    expect(
      state.statistics!.players.find((player) => player.playerId === change.outgoingId)!
        .minutesPlayed,
    ).toBeCloseTo(base.time / 60, 6);
  });
  it('can legally replace a new serious injury after an authorized return, once per appearance', () => {
    const initial = fixture(),
      change = pair(initial);
    const base: TacticalMatchState = {
      ...initial,
      substitutionRules: { ...initial.substitutionRules!, returnSubstitutions: true },
      players: initial.players.map((player) =>
        player.id === change.outgoingId ? { ...player, position: { x: 52.5, y: 0.5 } } : player,
      ),
    };
    const first = finish(requestSubstitutions(base, 'home', [change]));
    const returned = finish(
      requestSubstitutions(first, 'home', [
        { outgoingId: change.incomingId, incomingId: change.outgoingId },
      ]),
    );
    expect(returned.players.some((player) => player.id === change.outgoingId)).toBe(true);
    const assessed = processInjuryAssessment(injure(returned, change.outgoingId));
    expect(assessed.substitutionState!.used.home).toBe(3);
    expect(assessed.substitutionState!.pending).toHaveLength(1);
    expect(assessed.substitutionState!.pending[0]!.outgoing.id).toBe(change.outgoingId);
    const completed = finish(assessed);
    expect(
      completed.substitutionState!.completed.filter(
        (fact) => fact.outgoingId === change.outgoingId,
      ),
    ).toHaveLength(2);
    const duplicate = completed.bench!.home.find((player) =>
      isEligibleForNormalPosition(
        player.profile,
        completed.departedPlayers!.find((body) => body.id === change.outgoingId)!.slot.position,
      ),
    )!;
    expect(
      requestSubstitutions(completed, 'home', [
        { outgoingId: change.outgoingId, incomingId: duplicate.id },
      ]),
    ).toBe(completed);
    assertMatchStatisticsInvariants(completed.statistics!, completed);
  });
  it('uses a real dropped ball, preserves its spot and requires legal separation after open-play injury', () => {
    const initial = createTacticalMatch(session()),
      change = pair(initial),
      open = {
        ...initial,
        time: 900,
        ball: { x: 52, y: 30, ownerId: change.outgoingId, lastTouchPlayerId: change.outgoingId },
      };
    delete open.restart;
    let state = processInjuryAssessment(injure(open, change.outgoingId));
    state = { ...state, bench: { home: [], away: [] } };
    for (let tick = 0; tick < 85 / 0.025 && state.injuryAssessment; tick++)
      state = stepInjuryAssessmentInterval(state, 0.025);
    expect(state.injuryAssessment).toBeUndefined();
    expect(state.ball.x).toBe(52);
    expect(state.ball.y).toBe(30);
    expect(state.ball.bounceCount).toBeGreaterThan(0);
    expect(state.ball.ownerId).toBeUndefined();
    expect(state.stoppageLedger!.intervals).toHaveLength(1);
  });
  it('prepares a dropped ball near a corner without unreachable four-metre positioning', () => {
    const initial = createTacticalMatch(session()),
      change = pair(initial);
    const open: TacticalMatchState = {
      ...initial,
      time: 900,
      ball: { x: 0.5, y: 0.5, ownerId: change.outgoingId },
      players: initial.players.map((player, index) => ({
        ...player,
        position: index < 3 ? { x: 0.3, y: 0.3 } : player.position,
      })),
      bench: { home: [], away: [] },
    };
    delete open.restart;
    let state = processInjuryAssessment(injure(open, change.outgoingId));
    for (let tick = 0; tick < 45 / 0.025 && state.injuryAssessment; tick++)
      state = stepInjuryAssessmentInterval(state, 0.025);
    expect(state.injuryAssessment).toBeUndefined();
    expect(state.ball.bounceCount).toBeGreaterThan(0);
    expect(state.ball.x).toBe(0.5);
    expect(state.ball.y).toBe(0.5);
  });
  it('needs two different real player contacts before a dropped-ball goal can count', () => {
    const base = createTacticalMatch(session()),
      first = base.players[1]!,
      second = base.players[2]!;
    let state: TacticalMatchState = {
      ...base,
      droppedBallTouchRestriction: {
        assessmentId: 'drop',
        team: first.team,
        secondPlayerTouched: false,
      },
    };
    state = observeDroppedBallContact(state, first.id);
    state = observeDroppedBallContact(state, first.id);
    expect(resolveDroppedBallGoalOutcome(state, first.team)).toBe('goal_kick');
    state = observeDroppedBallContact(state, second.id);
    expect(resolveDroppedBallGoalOutcome(state, first.team)).toBe('goal');
  });
  it('canonically disallows a released direct dropped-ball shot without deleting the real shot', () => {
    const initial = createTacticalMatch(session());
    const shooter = initial.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
    )!;
    const others = initial.players.map((player) =>
      player.id === shooter.id
        ? {
            ...player,
            position: { x: 96, y: 34 },
            target: { x: 96, y: 34 },
            facingAngle: 0,
            profile: {
              ...player.profile,
              attributes: {
                ...player.profile.attributes,
                finishing: 100,
                technique: 100,
                composure: 100,
              },
            },
          }
        : {
            ...player,
            position: { x: player.team === 'away' ? 80 : 60, y: 5 },
            target: { x: player.team === 'away' ? 80 : 60, y: 5 },
          },
    );
    let state: TacticalMatchState = {
      ...initial,
      players: others,
      ball: { x: 96, y: 34, ownerId: shooter.id },
      controlledFootballerId: shooter.id,
      playerAgencyEnabled: false,
      droppedBallTouchRestriction: {
        assessmentId: 'released-drop',
        team: 'home',
        firstTouchId: shooter.id,
        secondPlayerTouched: false,
      },
    };
    delete state.restart;
    state = resolveMatchAction(
      state,
      {
        type: 'shot',
        actorId: shooter.id,
        target: { x: 105, y: 34 },
        goalTarget: { horizontal: 0, vertical: 0.2 },
        intent: 'placed',
      },
      'human_selected',
    );
    for (let tick = 0; tick < 8 / 0.025 && !state.lastShot?.outcome; tick++)
      state = stepTacticalMatch(state, 0.025);
    expect(state.lastShot).toBeDefined();
    expect(state.lastShot!.outcome).toBe('miss');
    expect(state.lastShot!.classification).toBe('on_target');
    expect(state.lastRestartAward!.scenario).toBe('goal_kick');
    expect(state.lastRestartAward!.incidentId).toContain('direct-goal-disallowed');
    expect(state.score.home).toBe(0);
    expect(state.statistics!.players.find((player) => player.playerId === shooter.id)!.shots).toBe(
      1,
    );
  });
  it.each(['unreachable_keeper', 'reachable_keeper'] as const)(
    'finishes a genuinely released shot after its shooter becomes unable to continue (%s)',
    (keeperCase) => {
      const initial = createTacticalMatch(session());
      const shooter = initial.players.find(
        (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
      )!;
      const opposingKeeper = initial.players.find(
        (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
      )!;
      const shotPosition = { x: keeperCase === 'reachable_keeper' ? 75 : 96, y: 34 };
      let state: TacticalMatchState = {
        ...initial,
        players: initial.players.map((player) => ({
          ...player,
          position:
            player.id === shooter.id
              ? shotPosition
              : player.id === opposingKeeper.id && keeperCase === 'reachable_keeper'
                ? { x: 103, y: 34 }
                : { x: 60, y: 5 },
          target:
            player.id === shooter.id
              ? shotPosition
              : player.id === opposingKeeper.id && keeperCase === 'reachable_keeper'
                ? { x: 103, y: 34 }
                : { x: 60, y: 5 },
          facingAngle: 0,
        })),
        ball: { ...shotPosition, ownerId: shooter.id },
        controlledFootballerId: shooter.id,
        playerAgencyEnabled: false,
      };
      delete state.restart;
      state = resolveMatchAction(
        state,
        {
          type: 'shot',
          actorId: shooter.id,
          target: { x: 105, y: 34 },
          goalTarget: { horizontal: 0, vertical: 0.2 },
          intent: 'placed',
        },
        'human_selected',
      );
      for (let tick = 0; tick < 2 / 0.025 && !state.ball.shot; tick++)
        state = stepTacticalMatch(state, 0.025);
      expect(state.ball.shot).toBeDefined();
      const shotId = state.ball.shot!.shotId;
      const injuryTime = state.time;
      state = injure(state, shooter.id);
      state = {
        ...state,
        injuries: [state.players.find((player) => player.id === shooter.id)!.injury!],
      };
      state = processInjuryAssessment(state);
      expect(state.players.some((player) => player.id === shooter.id)).toBe(false);
      expect(state.ball.shot!.shotId).toBe(shotId);
      expect(state.injuryAssessment).toBeUndefined();
      for (let tick = 0; tick < 8 / 0.025 && !state.lastShot?.outcome; tick++)
        state = stepTacticalMatch(state, 0.025);
      expect(state.lastShot!.shotId).toBe(shotId);
      expect(state.lastShot!.outcome).toBeDefined();
      expect(state.players.some((player) => player.id === shooter.id)).toBe(false);
      const statistics = state.statistics!.players.find(
        (player) => player.playerId === shooter.id,
      )!;
      expect(statistics.shots).toBe(1);
      expect(statistics.goals).toBe(state.lastShot!.outcome === 'goal' ? 1 : 0);
      if (state.lastShot!.outcome === 'save') {
        expect(state.lastBallContact!.playerId).toBe(opposingKeeper.id);
        expect(
          state.statistics!.players.find((player) => player.playerId === opposingKeeper.id)!.saves,
        ).toBe(1);
        expect(
          state.statistics!.players.find(
            (player) =>
              state.players.find((actor) => actor.id === player.playerId)?.team === 'home' &&
              state.players.find((actor) => actor.id === player.playerId)?.profile
                .primaryPosition === 'goalkeeper',
          )!.saves,
        ).toBe(0);
      }
      expect(statistics.minutesPlayed).toBeCloseTo(injuryTime / 60, 6);
      assertMatchStatisticsInvariants(state.statistics!, state);
      const outcomeTime = state.time;
      const rebound = ['parry', 'parry_away'].includes(state.lastShot!.goalkeeperAction ?? '');
      const reboundPoint = { x: state.ball.x, y: state.ball.y };
      for (let tick = 0; tick < 15 / 0.025 && !state.injuryAssessment; tick++)
        state = stepTacticalMatch(state, 0.025);
      expect(state.injuryAssessment).toBeDefined();
      if (rebound) {
        expect(state.time).toBeGreaterThan(outcomeTime + 0.025);
        expect(distance2(state.ball, reboundPoint)).toBeGreaterThan(0.05);
      }
    },
  );
  it('completes an observer half with a serious injury, real replacement and continued football', () => {
    let state = createTacticalMatch(session());
    let injected = false,
      lastProgressAt = 0,
      progressKey = '',
      unchangedBlocker = '',
      blockerSince = 0;
    for (
      let tick = 0;
      tick < 140_000 && state.status !== 'half_time' && state.status !== 'abandoned';
      tick++
    ) {
      if (!injected && state.time >= 120) {
        const change = pair(state);
        state = injure(state, change.outgoingId);
        injected = true;
      }
      state = stepTacticalMatch(state, 0.025);
      const key = `${state.statistics?.players.reduce((sum, player) => sum + player.touches + player.passesAttempted + player.shots, 0)}:${state.substitutionState?.completed.length}:${state.restart?.phase}:${state.restart?.awardId}:${state.score.home}:${state.score.away}`;
      if (key !== progressKey) {
        progressKey = key;
        lastProgressAt = state.time;
      }
      if (state.time - lastProgressAt > 180)
        throw new Error(
          `CPU half has no football/restart progress for 180s at ${state.time}: ${JSON.stringify(state.restart?.readiness)}`,
        );
      const blockers =
        state.restart?.phase !== 'release' && state.restart?.readiness?.blockers.length
          ? `${state.restart.awardId}:${state.restart.readiness.blockers.join('|')}`
          : '';
      if (blockers !== unchangedBlocker) {
        unchangedBlocker = blockers;
        blockerSince = state.time;
      }
      if (blockers && state.time - blockerSince > 120)
        throw new Error(`CPU unchanged restart blocker for 120s at ${state.time}: ${blockers}`);
    }
    expect(injected).toBe(true);
    expect(state.status).toBe('half_time');
    expect(state.injuryAssessment).toBeUndefined();
    expect(state.substitutionState!.pending).toHaveLength(0);
    expect(state.substitutionState!.completed.some((fact) => fact.reason === 'injury')).toBe(true);
    expect(
      state.statistics!.players.reduce((sum, player) => sum + player.passesAttempted, 0),
    ).toBeGreaterThan(5);
    const substitute = state.substitutionState!.completed.find((fact) => fact.reason === 'injury')!;
    expect(
      state.statistics!.players.find((player) => player.playerId === substitute.incomingId)!
        .minutesPlayed,
    ).toBeGreaterThan(1);
    expect(
      state.stoppageLedger!.intervals.some(
        (interval) =>
          interval.reasons.includes('injury') && interval.reasons.includes('substitution'),
      ),
    ).toBe(true);
    assertMatchStatisticsInvariants(state.statistics!, state);
  }, 180_000);
});
