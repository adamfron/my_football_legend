// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPr167Career, pr167World as world } from '../../scripts/pr167Fixtures';
import {
  applyCareerMatchResult,
  CareerMatchEvidence,
  careerMatchResultSchema,
  contractFingerprint,
  createCareerMatchInput,
  startCareerMatch,
} from './careerMatchContract';
import {
  canContinueCareerMatch,
  continueCareerMatch,
  remainingCareerMatchSeconds,
} from './careerMatchContinuation';
import { serializeCareerSave, parseCareerSave, hydrateCareerWithWorld } from './persistence';
import { advanceSimulationStep, simulateSelectedCareerFixture } from './careerSimulation';
import { createMatchFitness } from './matchSimulation/matchFitness';
import type { TacticalMatchState } from './matchSimulation/matchState';
import { simulateSummaryRemainder } from './summaryMatchContinuation';
import { getCurrentFixture } from './careerWeeks';
import { retainCareerMatchResults } from './careerMatchRetention';

const source = createPr167Career();
const input = createCareerMatchInput(source, world);
const at = (minute: number, home = 0, away = 0): TacticalMatchState => {
  const state = startCareerMatch(input);
  delete state.restart;
  const homeScorer = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'striker',
  )!.id;
  const awayScorer = state.players.find(
    (p) => p.team === 'away' && p.slot.position === 'striker',
  )!.id;
  const goals = Array.from({ length: home + away }, (_, index) => ({
    id: `prefix-goal-${index}`,
    replayKey: `prefix-goal-${index}`,
    at: (index + 1) * 60,
    kind: 'goal' as const,
    team: index < home ? ('home' as const) : ('away' as const),
    actorId: index < home ? homeScorer : awayScorer,
    score: { home: Math.min(home, index + 1), away: Math.max(0, index + 1 - home) },
  }));
  return {
    ...state,
    time: minute * 60,
    status: minute === 45 ? 'half_time' : minute > 45 ? 'second_half' : 'first_half',
    scenario: 'open_play',
    timekeeping: {
      period: minute > 45 ? 'second_half' : 'first_half',
      periodStartedAt: minute > 45 ? 2700 : 0,
      nominalEndAt: minute > 45 ? 5400 : 2700,
      qualifyingLostSeconds: 0,
      additionalLostAfterAnnouncement: 0,
      requiredEndAt: minute > 45 ? 5400 : 2700,
    },
    score: { home, away },
    matchEvents: goals,
    statistics: {
      ...state.statistics!,
      observedThrough: minute * 60,
      players: state.statistics!.players.map((p) => ({
        ...p,
        minutesPlayed: minute,
        passesAttempted: 8,
        passesCompleted: 6,
        touches: 11,
        goals: p.playerId === homeScorer ? home : p.playerId === awayScorer ? away : 0,
        shots: p.playerId === homeScorer ? home : p.playerId === awayScorer ? away : 0,
        shotsOnTarget: p.playerId === homeScorer ? home : p.playerId === awayScorer ? away : 0,
      })),
    },
  };
};

describe('PR167 canonical to summary continuation', () => {
  it.each([
    [12, 0, 0],
    [63, 2, 1],
    [45, 1, 0],
    [89, 3, 2],
  ])(
    'preserves the complete prefix at %i minutes (%i:%i), commits once and reloads',
    (minute, home, away) => {
      const state = at(minute!, home, away),
        original = structuredClone(state);
      const result = continueCareerMatch(input, state, new CareerMatchEvidence());
      expect(result.continuation!.remainingSeconds).toBe((90 - minute!) * 60);
      expect(result.score.home).toBeGreaterThanOrEqual(home!);
      expect(result.score.away).toBeGreaterThanOrEqual(away!);
      expect(result.continuation!.prefix.score).toEqual(state.score);
      expect(result.continuation!.prefix.participants.map((p) => p.stats)).toEqual(
        state.statistics!.players,
      );
      expect(result.participants.every((p) => p.stats.minutesPlayed === 90)).toBe(true);
      expect(state).toEqual(original);
      expect(continueCareerMatch(input, structuredClone(state), new CareerMatchEvidence())).toEqual(
        result,
      );
      const committed = applyCareerMatchResult(source, world, input, result);
      const archived = retainCareerMatchResults({
        ...committed,
        currentSeason: committed.currentSeason + 1,
      });
      const receipt = archived.historyFacts.find(
        (f) => f.id === `canonical_match:${input.fixture.id}`,
      )!;
      expect(receipt.data.result).toBeUndefined();
      expect(
        (receipt.data.summary as { provenance: { canonicalEvents: unknown[] } }).provenance
          .canonicalEvents,
      ).toEqual(state.matchEvents);
      expect((receipt.data.summary as { provenance: { source: string } }).provenance.source).toBe(
        'canonical_plus_summary',
      );
      expect(applyCareerMatchResult(archived, world, input, result)).toBe(archived);
      expect(committed.activeMatch).toBeUndefined();
      expect(
        committed.seasonParticipation!.filter((p) => p.fixtureId === input.fixture.id),
      ).toHaveLength(1);
      const save = serializeCareerSave(committed),
        parsed = parseCareerSave(save);
      if (!parsed.ok) throw new Error('Combined result save failed');
      const loaded = hydrateCareerWithWorld(parsed.save.career, world);
      expect(applyCareerMatchResult(loaded, world, input, result)).toBe(loaded);
      expect(() => advanceSimulationStep(loaded)).not.toThrow();
      expect(() =>
        applyCareerMatchResult(committed, world, input, {
          ...result,
          score: { home: result.score.home + 1, away: result.score.away },
        }),
      ).toThrow(/Conflicting/);
    },
  );

  it('uses actual period boundaries and known added time, including a late halftime', () => {
    const state = at(63);
    state.timekeeping!.periodStartedAt = 2760;
    state.timekeeping!.nominalEndAt = 5460;
    state.timekeeping!.requiredEndAt = 5460;
    expect(remainingCareerMatchSeconds(state)).toBe(1680);
    const half = at(45);
    half.time = 2790;
    expect(remainingCareerMatchSeconds(half)).toBe(2700);
  });

  it('preserves outgoing and incoming participants and does not invent bench appearances', () => {
    const state = at(63),
      outgoing = state.players.find((p) => p.team === 'home' && p.slot.position !== 'goalkeeper')!;
    const incoming = input.session.home.bench[0]!;
    state.players = state.players.map((p) =>
      p.id === outgoing.id
        ? {
            ...outgoing,
            id: incoming.footballerId,
            profile: incoming.profile,
            activeSince: 1800,
            fitness: createMatchFitness(90),
          }
        : p,
    );
    state.departedPlayers = [outgoing];
    state.substitutionState = {
      ...state.substitutionState!,
      used: { home: 1, away: 0 },
      completed: [
        {
          id: 'sub-1',
          team: 'home',
          outgoingId: outgoing.id,
          incomingId: incoming.footballerId,
          requestedAt: 1790,
          leftAt: 1795,
          enteredAt: 1800,
          opportunityId: 'window-1',
          reason: 'tactical',
          delayed: false,
        },
      ],
    };
    state.statistics!.players = state.statistics!.players.map((p) =>
      p.playerId === outgoing.id ? { ...p, minutesPlayed: 30 } : p,
    );
    state.statistics!.players.push({
      ...state.statistics!.players[0]!,
      playerId: incoming.footballerId,
      minutesPlayed: 33,
    });
    const result = continueCareerMatch(input, state, new CareerMatchEvidence());
    expect(result.participants.find((p) => p.id === outgoing.id)!.stats.minutesPlayed).toBe(30);
    expect(
      result.participants.find((p) => p.id === incoming.footballerId)!.stats.minutesPlayed,
    ).toBe(60);
    expect(result.participants).toHaveLength(23);
    expect(result.substitutions).toEqual(state.substitutionState.completed);
    expect(() => applyCareerMatchResult(source, world, input, result)).not.toThrow();
  });

  it.each(['red', 'injury'] as const)(
    'keeps %s removal, score, cards and condition without re-entry',
    (kind) => {
      const state = at(63, 2, 1),
        body = state.players.find((p) => p.id === source.player.id)!;
      if (kind === 'red') {
        state.discipline = {
          [body.id]: { yellowCards: 0, sentOff: true, sentOffAt: 3600, team: body.team },
        };
        state.players = state.players.filter((p) => p.id !== body.id);
        state.departedPlayers = [body];
        state.recentCards = [
          {
            id: 'red-1',
            foulId: 'foul-1',
            at: 3600,
            foulAt: 3600,
            actorId: body.id,
            team: body.team,
            position: { x: 30, y: 30 },
            kind: 'red',
            reason: 'excessive_force',
            delayed: false,
          },
        ];
      } else
        body.injury = {
          id: 'injury-1',
          playerId: body.id,
          at: 3600,
          status: 'unable',
          mechanism: 'movement',
          injuryType: 'muscle',
          recoveryDays: 7,
          assessmentRequired: false,
        };
      state.statistics!.players = state.statistics!.players.map((p) =>
        p.playerId === body.id ? { ...p, minutesPlayed: 60, redCards: kind === 'red' ? 1 : 0 } : p,
      );
      const result = continueCareerMatch(input, state, new CareerMatchEvidence());
      const player = result.participants.find((p) => p.id === body.id)!;
      expect(player.stats.minutesPlayed).toBe(60);
      expect(player.condition).toBe(body.fitness!.longTermCapacity * 100);
      expect(result.cards).toEqual(state.recentCards ?? []);
      expect(player.injury).toEqual(body.injury);
      const committed = applyCareerMatchResult(source, world, input, result);
      if (kind === 'red') expect(committed.playerAvailability?.suspensionMatchesRemaining).toBe(3);
      else
        expect(
          committed.playerAvailability?.injuries.some(
            (injury) => injury.id === body.injury!.id && injury.status === 'active',
          ),
        ).toBe(true);
    },
  );

  it('keeps a genuine unused controlled substitute on the bench without a fictitious appearance', () => {
    const career = createPr167Career(false, 'pr166-youth', 'striker'),
      input = createCareerMatchInput(career, world),
      state = startCareerMatch(input);
    expect(state.players.some((p) => p.id === career.player.id)).toBe(false);
    expect(
      [...input.session.home.bench, ...input.session.away.bench].some(
        (p) => p.footballerId === career.player.id,
      ),
    ).toBe(true);
    const result = continueCareerMatch(input, state, new CareerMatchEvidence());
    const committed = applyCareerMatchResult(career, world, input, result);
    expect(result.participants.some((p) => p.id === career.player.id)).toBe(false);
    expect(
      committed.seasonParticipation!.find((p) => p.fixtureId === input.fixture.id)!.status,
    ).toBe('unused_bench');
    expect(
      committed.matchHistory?.some((p) => p.matchId === result.completedMatchId) ?? false,
    ).toBe(false);
  });

  it('retains unselected human agency without inventing a decision or further behavioural evidence', () => {
    const state = at(12),
      evidence = new CareerMatchEvidence();
    const result = continueCareerMatch(input, state, evidence, true);
    expect(result.controlledEvidence).toEqual(evidence.snapshot(source.player.id));
    expect(result.controlledEvidence.selected).toBe(0);
    expect(result.continuation!.prefix.unselectedDecision).toBe(true);
    const changed = structuredClone(result);
    changed.participants[0]!.stats.passesCompleted++;
    expect(careerMatchResultSchema.safeParse(changed).success).toBe(false);
    const reentry = structuredClone(result);
    reentry.participants[0]!.stats.minutesPlayed++;
    expect(careerMatchResultSchema.safeParse(reentry).success).toBe(false);
  });

  it('keeps an already selected but unresolved human action explicitly unresolved', () => {
    const state = at(12),
      evidence = new CareerMatchEvidence();
    state.pendingPlayerDecision = {
      decisionId: 'pending-human-pass',
      actorId: source.player.id,
      selectedAt: 719,
      decisionKind: 'on_ball',
      selectedIntent: 'pass:through',
      startContext: {
        phase: 'positional_attack',
        pressure: 0.5,
        fieldProgress: 50,
        possession: 'home',
      },
    };
    const result = continueCareerMatch(input, state, evidence);
    expect(result.controlledEvidence.selected).toBe(1);
    expect(result.controlledEvidence.resolved).toBe(0);
    expect(result.continuation!.prefix.unresolvedDecision?.disposition).toBe(
      'unresolved_at_handoff',
    );
    expect(result.controlledEvidence.behaviour).toEqual([]);
    expect(state.pendingPlayerDecision.result).toBeUndefined();
  });

  it('does not let presentation seed or the timing of a UI decision prompt choose the suffix RNG', () => {
    const state = at(63, 2, 1);
    const ordinary = continueCareerMatch(input, state, new CareerMatchEvidence(), false);
    const prompt = continueCareerMatch(input, state, new CareerMatchEvidence(), true);
    expect(prompt.continuation!.seed).toBe(ordinary.continuation!.seed);
    expect(prompt.score).toEqual(ordinary.score);
    expect(prompt.participants).toEqual(ordinary.participants);
    const presentation = createCareerMatchInput(source, world, 'different-look-camera-and-loading');
    expect(continueCareerMatch(presentation, state, new CareerMatchEvidence(), false)).toEqual(
      ordinary,
    );
  });

  it('rejects invalid time/statistics and terminal or unresolved referee transitions', () => {
    const state = at(12);
    state.statistics!.observedThrough = 600;
    expect(() => continueCareerMatch(input, state, new CareerMatchEvidence())).toThrow(
      /Statystyki/,
    );
    expect(canContinueCareerMatch({ ...at(12), status: 'full_time' })).toBe(false);
    expect(canContinueCareerMatch({ ...at(12), pendingInjuryAssessment: 'pending' })).toBe(false);
  });

  it('has no full-match score addition at zero time and scales expected suffix with duration', () => {
    const sums = [0, 60, 1620, 4680].map((remainingSeconds) =>
      Array.from({ length: 300 }, (_, i) =>
        simulateSummaryRemainder({
          seed: `suffix-${i}`,
          remainingSeconds,
          score: { home: 2, away: 1 },
          home: { strength: 60, players: 11, condition: 90 },
          away: { strength: 55, players: 10, condition: 75 },
        }),
      ).reduce((sum, score) => sum + score.home + score.away, 0),
    );
    expect(sums[0]).toBe(0);
    expect(sums[1]).toBeLessThan(sums[2]!);
    expect(sums[2]).toBeLessThan(sums[3]!);
  });
});

describe('PR167 full-fixture summary choice', () => {
  it.each([false, true])(
    'settles a %s professional fixture without the runtime and preserves the preference',
    (professional) => {
      const career = createPr167Career(professional),
        before = contractFingerprint(career),
        fixture = getCurrentFixture(career)!;
      const result = simulateSelectedCareerFixture(career);
      expect(contractFingerprint(career)).toBe(before);
      expect(result.player.matchPresentation).toBe(career.player.matchPresentation);
      expect(result.activeMatch).toBeUndefined();
      expect(result.currentDate).toBe(fixture.date);
      expect(
        result.leagueSeason!.rounds.flatMap((r) => r.fixtures).find((f) => f.id === fixture.id)!
          .completed,
      ).toBe(true);
      expect(result.seasonParticipation!.filter((p) => p.fixtureId === fixture.id)).toHaveLength(1);
      expect(parseCareerSave(serializeCareerSave(result)).ok).toBe(true);
      expect(() => simulateSelectedCareerFixture(result)).toThrow();
      expect(() => advanceSimulationStep(result)).not.toThrow();
    },
  );
});
