// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../scripts/createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { advanceCareerFlow } from './careerFlow';
import {
  createCareerMatchInput,
  CareerMatchEvidence,
  startCareerMatch,
  finishCareerMatch,
  applyCareerMatchResult,
} from './careerMatchContract';
import { suspendedCareerFootballers } from './careerMatchDiscipline';
import { deriveSquadHierarchy } from './footballerWorld';
import { getCurrentSquadSelectionContext } from './youthWorld';
import { recoverCareerFitnessToDate } from './careerFitness';
import { getCurrentFixture } from './careerWeeks';
import { getPlayerAvailability } from './playerAvailability';
import {
  getSeasonGoalkeeperStats,
  getSeasonAppearanceStats,
  recordParticipation,
} from './seasonParticipation';
import { requestSubstitutions } from './matchSimulation/substitutions';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation/matchSimulation';
import {
  projectPlayerDecisionOpportunity,
  applyPlayerDecision,
} from './matchSimulation/playerDecision';
import { enforceMinimumPlayers } from './matchSimulation/matchRules';
import { isEligibleForNormalPosition } from './footballerWorld';
import { playerDecisionOutcomeSchema } from './matchSimulation/matchState';
import { createFormationBenchmarkMatch } from './matchSimulation/benchmarkFixtures';
import { compactMatchParticipant } from './careerMatchSummary';
import { retainCareerMatchResults } from './careerMatchRetention';
import { createCompletedSeasonSnapshot } from './seasonArchive';
import { parseCareerSave, serializeCurrentCareerSave } from './persistence';

const world = createCanonicalWorldDatabase();
const career = () =>
  advanceCareerFlow(
    createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Regresja',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'central_midfielder',
          heightCm: 178,
          weightKg: 70,
          seed: 'pr166-consequences',
        },
        'pr166-consequences',
        0,
      ),
      'pr166-consequences',
      world,
    ),
  );

describe('PR166 career consequences', () => {
  it('keeps a genuinely selected substitute on the bench, enters canonically and records a short cameo or unused bench', () => {
    const base = career();
    let source = base,
      input = createCareerMatchInput(base, world);
    let found = false;
    for (let ability = 30; ability < 70; ability += 2) {
      source = { ...base, player: { ...base.player, attributes: { ...base.player.attributes } } };
      for (const key of Object.keys(source.player.attributes) as Array<
        keyof typeof source.player.attributes
      >)
        source.player.attributes[key] = ability;
      input = createCareerMatchInput(source, world);
      if (
        [...input.session.home.bench, ...input.session.away.bench].some(
          (p) => p.footballerId === source.player.id,
        )
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    const initial = startCareerMatch(input);
    expect(initial.players.some((p) => p.id === source.player.id)).toBe(false);
    expect(projectPlayerDecisionOpportunity(initial)).toBeUndefined();
    const side =
      input.fixture.homeClubId === source.currentClub.id ? ('home' as const) : ('away' as const);
    const outgoing = initial.players.find(
      (p) => p.team === side && isEligibleForNormalPosition(source.player, p.slot.position),
    )!;
    const selected = requestSubstitutions({ ...initial, status: 'half_time', time: 2700 }, side, [
      { outgoingId: outgoing.id, incomingId: source.player.id, reason: 'tactical' },
    ]);
    let entered = startSecondHalf(selected);
    expect(entered.players.some((p) => p.id === source.player.id)).toBe(true);
    expect(
      entered.substitutionState?.completed.some((f) => f.incomingId === source.player.id),
    ).toBe(true);
    const evidence = new CareerMatchEvidence();
    for (let tick = 0; tick < 80; tick++) {
      const opportunity = projectPlayerDecisionOpportunity(entered);
      if (opportunity)
        entered = applyPlayerDecision(entered, opportunity, opportunity.options[0]!.id);
      entered = stepTacticalMatchAfterDecisionProbe(entered, 0.025);
      evidence.observe(entered);
    }
    const withdraw = entered.players.filter((p) => p.team !== side).slice(0, 5);
    const terminal = enforceMinimumPlayers({
      ...entered,
      players: entered.players.filter((p) => !withdraw.includes(p)),
      departedPlayers: [...(entered.departedPlayers ?? []), ...withdraw],
    });
    const result = finishCareerMatch(input, terminal, evidence);
    const committed = applyCareerMatchResult(source, world, input, result);
    const row = committed.seasonParticipation!.find((p) => p.fixtureId === input.fixture.id)!;
    expect(row.status).toBe('substitute');
    expect(row.participationEvidence?.substitutions[0]?.incomingId).toBe(source.player.id);
    expect(row.participationEvidence?.substitutions[0]?.reason).toBe('tactical');
    expect(row.participationEvidence?.substitutions[0]?.outgoingName).toBeTruthy();
    expect(row.started).toBe(false);
    expect(row.canonicalStats!.minutesPlayed).toBeGreaterThan(0);
    expect(row.canonicalStats!.minutesPlayed).toBeLessThan(1);
    expect(getSeasonAppearanceStats(committed.seasonParticipation!).appearances).toBe(1);
    const archive = createCompletedSeasonSnapshot(committed);
    const archivedSave = parseCareerSave(
      serializeCurrentCareerSave({ ...committed, completedSeasons: [archive] }),
    );
    expect(archivedSave.ok).toBe(true);
    if (!archivedSave.ok) throw new Error('Exact-minute archive failed save validation.');
    expect(
      archivedSave.save.career.completedSeasons![0]!.matches.find(
        (match) => match.matchId === input.fixture.id,
      )!.minutes,
    ).toBe(row.canonicalStats!.minutesPlayed);
    const leave = initial.players.filter((p) => p.team !== side).slice(0, 5);
    const unusedTerminal = enforceMinimumPlayers({
      ...initial,
      players: initial.players.filter((p) => !leave.includes(p)),
      departedPlayers: leave,
    });
    const unused = applyCareerMatchResult(
      source,
      world,
      input,
      finishCareerMatch(input, unusedTerminal, new CareerMatchEvidence()),
    );
    expect(unused.seasonParticipation!.find((p) => p.fixtureId === input.fixture.id)?.status).toBe(
      'unused_bench',
    );
    expect(unused.matchHistory?.length ?? 0).toBe(source.matchHistory?.length ?? 0);
  });
  it('uses the existing actual coach hierarchy, seven bench identities and current conditions', () => {
    const base = career(),
      fixture = getCurrentFixture(base)!;
    const dated = { ...recoverCareerFitnessToDate(base, fixture.date), currentDate: fixture.date };
    const hierarchy = deriveSquadHierarchy(dated, getCurrentSquadSelectionContext(dated)!);
    const input = createCareerMatchInput(base, world);
    const team = input.session[input.fixture.homeClubId === base.currentClub.id ? 'home' : 'away'];
    expect(team.players.map((p) => p.footballerId)).toEqual(
      hierarchy.preferredXI.map((p) => p.footballerId),
    );
    expect(team.bench.map((p) => p.footballerId)).toEqual(
      hierarchy.bench.map((p) => p.footballerId),
    );
    expect(input.substitutionRules.namedBenchSize).toBe(7);
    expect(() =>
      createCareerMatchInput(
        {
          ...base,
          playerAvailability: {
            injuries: [],
            suspensionMatchesRemaining: 1,
            leagueYellowCards: 0,
            matchesMissedThroughInjury: 0,
            matchesMissedThroughSuspension: 0,
          },
        },
        world,
      ),
    ).toThrow(/unavailable/);
  });

  it('serves real NPC card bans on subsequent scheduled fixtures, including simulated rounds', () => {
    const base = career(),
      first = base.leagueSeason!.rounds[0]!.fixtures.find((f) =>
        [f.homeClubId, f.awayClubId].includes(base.currentClub.id),
      )!;
    const npc = createCareerMatchInput(base, world).session.home.players[0]!.footballerId;
    const dated = {
      ...base,
      historyFacts: [
        ...base.historyFacts,
        {
          id: 'discipline',
          factType: 'canonical_match_result',
          season: 2026,
          date: first.date,
          actors: [],
          targets: [],
          clubs: [first.homeClubId, first.awayClubId],
          competitions: [],
          causes: [],
          tags: [],
          visibility: 'public' as const,
          narrativeImportance: 50,
          emotionalTone: 'neutral' as const,
          data: {
            summary: {
              fixture: { ...first, seasonId: base.leagueSeason!.id },
              participants: [{ id: npc, team: 'home', yellowCards: 0, redCards: 1 }],
              cards: [{ actorId: npc, kind: 'red' }],
            },
          },
        },
      ],
    };
    const clubFixtures = base
      .leagueSeason!.rounds.flatMap((r) => r.fixtures)
      .filter((f) => [f.homeClubId, f.awayClubId].includes(first.homeClubId))
      .sort((a, b) => a.date.localeCompare(b.date));
    expect(suspendedCareerFootballers(dated, clubFixtures[1]!.date)).toContain(npc);
    expect(suspendedCareerFootballers(dated, clubFixtures[3]!.date)).toContain(npc);
    expect(suspendedCareerFootballers(dated, clubFixtures[4]!.date)).not.toContain(npc);
    const twoYellows = structuredClone(dated);
    const receipt = twoYellows.historyFacts.at(-1)!;
    receipt.data.summary = {
      fixture: { ...first, seasonId: base.leagueSeason!.id },
      participants: [
        compactMatchParticipant({
          id: npc,
          team: 'home',
          started: true,
          position: 'goalkeeper',
          condition: 85,
          stats: { minutesPlayed: 30, goals: 0, assists: 0, yellowCards: 2, redCards: 1 },
        }),
      ],
      cards: [
        { actorId: npc, kind: 'yellow' },
        { actorId: npc, kind: 'second_yellow_red' },
      ],
    };
    expect(suspendedCareerFootballers(twoYellows, clubFixtures[1]!.date)).toContain(npc);
    expect(suspendedCareerFootballers(twoYellows, clubFixtures[2]!.date)).not.toContain(npc);
    expect(
      suspendedCareerFootballers(retainCareerMatchResults(twoYellows), clubFixtures[1]!.date),
    ).toContain(npc);
  });

  it('uses the dated canonical injury recovery and never invents goalkeeper ratings', () => {
    const base = career();
    const injured = {
      ...base,
      playerAvailability: {
        injuries: [
          {
            id: 'injury',
            startDate: '2026-08-01',
            canonicalRecoveryDate: '2026-08-08',
            severity: 'minor' as const,
            injuryType: 'strain' as const,
            matchesRemaining: 2,
            source: 'match' as const,
            status: 'active' as const,
          },
        ],
        suspensionMatchesRemaining: 0,
        leagueYellowCards: 0,
        matchesMissedThroughInjury: 0,
        matchesMissedThroughSuspension: 0,
      },
    };
    expect(getPlayerAvailability(injured, '2026-08-07').available).toBe(false);
    expect(getPlayerAvailability(injured, '2026-08-08').available).toBe(true);
    const row = {
      ...base.seasonParticipation![0]!,
      fixtureStatus: 'completed' as const,
      assignedPosition: 'goalkeeper' as const,
      minutes: 90,
      started: true,
      status: 'starter' as const,
      metricsSource: 'canonical' as const,
      canonicalStats: {
        saves: 3,
        goalsConceded: 1,
        catches: 2,
        parries: 1,
        touches: 4,
        shots: 0,
        shotsOnTarget: 0,
        tacklesWon: 0,
        interceptions: 1,
        passesAttempted: 4,
        passesCompleted: 3,
        distanceCovered: 100,
        sprintBursts: 0,
      },
    };
    const next = recordParticipation(base, row);
    expect(getSeasonGoalkeeperStats(next.seasonParticipation!).saves).toBe(3);
    expect(getSeasonGoalkeeperStats(next.seasonParticipation!).goalsConceded).toBe(1);
    expect(next.seasonParticipation![0]!.rating).toBeUndefined();
  });

  it('deduplicates observed decisions and bounds repetitive attempts per five-minute context', () => {
    const { state } = createFormationBenchmarkMatch({
      anchor: '4-3-3',
      opponent: '4-4-2',
      attributes: 65,
      seed: 'evidence-bounds',
    });
    const actor = state.players[8]!;
    state.controlledFootballerId = actor.id;
    const evidence = new CareerMatchEvidence();
    for (let i = 0; i < 50; i++) {
      state.lastPlayerDecisionOutcome = playerDecisionOutcomeSchema.parse({
        decisionId: `decision-${i}`,
        actorId: actor.id,
        selectedAt: 10 + i,
        resolvedAt: 11 + i,
        decisionKind: 'on_ball',
        selectedIntent: 'pass:through',
        startContext: {
          phase: 'positional_attack',
          pressure: 0.4,
          fieldProgress: 0.5,
          possession: 'home',
        },
        behaviourContext: {
          forwardMetres: 15,
          opponentsBypassed: 1,
          betweenLines: false,
          goalDistance: 50,
          activeEffort: false,
          goalkeeper: false,
          pressOpportunity: false,
        },
        result: { kind: 'pass_completed', passCompleted: true },
      });
      evidence.observe(state);
      evidence.observe(state);
    }
    const snapshot = evidence.snapshot(actor.id);
    expect(snapshot.selected).toBe(50);
    expect(snapshot.behaviour.find((b) => b.style === 'progressive_passer')?.situations).toBe(1);
    expect(snapshot.recentOutcomes).toHaveLength(12);
  });
});
