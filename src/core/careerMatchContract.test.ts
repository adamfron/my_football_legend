// @vitest-environment node
/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { createCanonicalWorldDatabase } from '../../scripts/createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { acceptProfessionalOffer } from './careerSeasons';
import { advanceCareerFlow } from './careerFlow';
import { advanceSimulationStep } from './careerSimulation';
import { RETAINED_DETAILED_MATCHES, retainCareerMatchResults } from './careerMatchRetention';
import { getLeagueTable } from './leagueSeason';
import { enforceMinimumPlayers } from './matchSimulation/matchRules';
import { advanceCareerWeek, getCurrentFixture } from './careerWeeks';
import {
  applyCareerMatchResult,
  CareerMatchEvidence,
  careerMatchInputSchema,
  createCareerMatchInput,
  finishCareerMatch,
  MATCH_RESULT_MAX_BYTES,
  startCareerMatch,
} from './careerMatchContract';
import { serializeCurrentCareerSave, parseCareerSave, hydrateCareerWithWorld } from './persistence';
import {
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation/matchSimulation';
import {
  applyPlayerDecision,
  projectPlayerDecisionOpportunity,
} from './matchSimulation/playerDecision';

const world = createCanonicalWorldDatabase();
const currentCareer = () => {
  let career = advanceCareerFlow({
    ...createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Kontrakt',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'central_midfielder',
          heightCm: 178,
          weightKg: 70,
          seed: 'pr164-contract',
        },
        'pr164-contract',
        0,
      ),
      'pr164-contract',
      world,
    ),
    seasonOutcome: { finalPosition: 6, champion: false, competitionType: 'academy' },
  });
  const offer = career.professionalOffers?.[0];
  if (!offer) throw new Error('Professional offer required.');
  career = acceptProfessionalOffer(career, offer.id);
  for (let i = 0; i < 50 && !getCurrentFixture(career); i++) career = advanceCareerWeek(career);
  return career;
};

describe('PR164 career fixture contract', () => {
  it('prepares the fresh real U-17 season without forcing selection and safely records abandonment', () => {
    const career = advanceCareerFlow(
      createCareerState(
        generateStartingPlayerProfile(
          {
            firstName: 'Jan',
            lastName: 'Junior',
            nationality: 'PL',
            age: 16,
            dominantFoot: 'right',
            position: 'central_midfielder',
            heightCm: 178,
            weightKg: 70,
            seed: 'pr166-youth',
          },
          'pr166-youth',
          0,
        ),
        'pr166-youth',
        world,
      ),
    );
    const input = createCareerMatchInput(career, world);
    expect(career.leagueSeason?.competition.category).toBe('youth');
    const beforeMatchSave = parseCareerSave(serializeCurrentCareerSave(career));
    if (!beforeMatchSave.ok) throw new Error('Uncommitted fixture failed save validation');
    const restoredInput = createCareerMatchInput(
      hydrateCareerWithWorld(beforeMatchSave.save.career, world),
      world,
    );
    expect(restoredInput.footballFingerprint).toBe(input.footballFingerprint);
    expect(startCareerMatch(restoredInput)).toEqual(startCareerMatch(input));
    expect(
      input.session.setup.control.mode === 'player' && input.session.setup.control.forceIntoXI,
    ).toBe(false);
    expect(
      input.session.home.players
        .concat(input.session.away.players)
        .every((p) => p.profile.age <= 17),
    ).toBe(true);
    const initial = startCareerMatch(input);
    expect(() => finishCareerMatch(input, initial, new CareerMatchEvidence())).toThrow(/completed/);
    const departing = initial.players.filter((p) => p.team === 'home').slice(0, 5);
    const abandoned = enforceMinimumPlayers({
      ...initial,
      players: initial.players.filter((p) => !departing.includes(p)),
      departedPlayers: departing,
    });
    expect(abandoned.status).toBe('abandoned');
    const result = finishCareerMatch(input, abandoned, new CareerMatchEvidence());
    const committed = applyCareerMatchResult(career, world, input, result);
    expect(
      committed.leagueSeason!.rounds[input.fixture.roundIndex]!.fixtures.find(
        (f) => f.id === input.fixture.id,
      )?.outcome,
    ).toBe('abandoned');
    expect(
      getLeagueTable(committed).find((r) => r.clubId === input.fixture.homeClubId)?.played,
    ).toBe(0);
    expect(
      committed.historyFacts.find((f) => f.id === `canonical_match:${input.fixture.id}`)?.data
        .result,
    ).toEqual(result);
    expect(
      applyCareerMatchResult(
        { ...committed, currentSeason: 2027, leagueSeason: undefined },
        world,
        input,
        result,
      ).historyFacts,
    ).toBe(committed.historyFacts);
  });

  it('plays a fresh real U-17 fixture with human intent, commits, saves, reloads and advances its calendar', () => {
    const career = advanceCareerFlow(
      createCareerState(
        generateStartingPlayerProfile(
          {
            firstName: 'Jan',
            lastName: 'Junior',
            nationality: 'PL',
            age: 16,
            dominantFoot: 'right',
            position: 'central_midfielder',
            heightCm: 178,
            weightKg: 70,
            seed: 'pr166-youth',
          },
          'pr166-youth',
          0,
        ),
        'pr166-youth',
        world,
      ),
    );
    const input = createCareerMatchInput(career, world);
    let state = startCareerMatch(input),
      ticks = 0,
      choices = 0;
    const evidence = new CareerMatchEvidence();
    while (state.status !== 'full_time' && state.status !== 'abandoned' && ticks++ < 430000) {
      if (state.status === 'half_time') state = startSecondHalf(state);
      const opportunity = projectPlayerDecisionOpportunity(state);
      if (opportunity) {
        const option =
          opportunity.options.find(
            (o) => o.kind === 'action' && ['pass', 'shot', 'cross'].includes(o.action.type),
          ) ?? opportunity.options[0]!;
        state = applyPlayerDecision(state, opportunity, option.id);
        choices++;
        evidence.observe(state);
      }
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      evidence.observe(state);
    }
    expect(state.status, JSON.stringify({ ticks, time: state.time, restart: state.restart })).toBe(
      'full_time',
    );
    expect(choices).toBeGreaterThan(0);
    const result = finishCareerMatch(input, state, evidence);
    const committed = applyCareerMatchResult(career, world, input, result);
    const loaded = parseCareerSave(serializeCurrentCareerSave(committed));
    if (!loaded.ok) throw new Error('U-17 save reload failed');
    const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
    expect(applyCareerMatchResult(hydrated, world, input, result)).toBe(hydrated);
    expect(
      hydrated.seasonParticipation?.find((r) => r.fixtureId === input.fixture.id)?.score,
    ).toEqual(result.score);
    expect(hydrated.matchHistory!.at(-1)?.teamLevel).toBe('academy');
    expect(hydrated.matchHistory!.at(-1)?.metricsSource).toBe('canonical');
    const after = advanceSimulationStep({
      ...hydrated,
      player: { ...hydrated.player, matchPresentation: 'simulate_all' },
    });
    expect(
      after.leagueSeason!.rounds[input.fixture.roundIndex]!.fixtures.find(
        (f) => f.id === input.fixture.id,
      )?.homeGoals,
    ).toBe(result.score.home);
    expect(after.seasonParticipation?.filter((r) => r.fixtureId === input.fixture.id)).toHaveLength(
      1,
    );
    const history = Array.from({ length: 600 }, (_, i) => ({
      ...committed.historyFacts.find((f) => f.factType === 'canonical_match_result')!,
      id: `canonical_match:retention-${i}`,
      season: i < 570 ? 2025 : 2026,
    }));
    const retained = retainCareerMatchResults({ ...committed, historyFacts: history });
    expect(retained.historyFacts.filter((f) => f.data.result)).toHaveLength(
      RETAINED_DETAILED_MATCHES,
    );
    expect(retained.historyFacts.every((f) => f.data.resultFingerprint && f.data.summary)).toBe(
      true,
    );
    const bytes = new TextEncoder().encode(serializeCurrentCareerSave(retained)).byteLength;
    const retentionSizes = [1, 10, 120, 600].map((count) => {
      const receipts = history
        .slice(-count)
        .map((fact, i) => ({ ...fact, season: i < count - Math.min(6, count) ? 2025 : 2026 }));
      const scaled = retainCareerMatchResults({ ...committed, historyFacts: receipts });
      return {
        canonicalReceipts: count,
        receiptStorageBytesBeforeRetention: new TextEncoder().encode(JSON.stringify(receipts))
          .byteLength,
        saveBytesAfterRetention: new TextEncoder().encode(serializeCurrentCareerSave(scaled))
          .byteLength,
      };
    });
    console.info('PR166 U-17 career receipt', {
      score: result.score,
      choices,
      endedAt: result.endedAt,
      canonicalResultBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
      saveBytes: new TextEncoder().encode(serializeCurrentCareerSave(committed)).byteLength,
      retained600ResultSaveBytes: bytes,
    });
    if (process.env.MFL_PR166_RECEIPT === '1')
      writeFileSync(
        'docs/performance/PR166-youth-contract.json',
        JSON.stringify(
          {
            seed: input.footballSeed,
            inputFingerprint: input.footballFingerprint,
            resultFingerprint: result.completedMatchId,
            score: result.score,
            choices,
            endedAt: result.endedAt,
            resultBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
            saveBytes: new TextEncoder().encode(serializeCurrentCareerSave(committed)).byteLength,
            retained600ResultSaveBytes: bytes,
            retentionMeasurement:
              '600 copies of the actual completed canonical result; 570 historical + 30 current receipts, not 600 independently simulated matches',
            retentionSizes,
            controlledEvidence: result.controlledEvidence,
          },
          null,
          2,
        ) + '\n',
      );
  }, 900_000);
  it('validates roster/provenance and keeps presentation seed outside football', () => {
    const career = currentCareer(),
      input = createCareerMatchInput(career, world),
      visual = createCareerMatchInput(career, world, 'different-stadium-seed');
    expect(input.footballFingerprint).toBe(visual.footballFingerprint);
    expect(startCareerMatch(input)).toEqual(startCareerMatch(visual));
    const duplicate = structuredClone(input);
    duplicate.session.home.bench[0] = duplicate.session.home.players[0]!;
    expect(careerMatchInputSchema.safeParse(duplicate).success).toBe(false);
    expect(careerMatchInputSchema.safeParse({ ...input, version: 2 }).success).toBe(false);
    expect(() =>
      finishCareerMatch(input, startCareerMatch(input), new CareerMatchEvidence()),
    ).toThrow(/completed/);
    expect(JSON.stringify(input)).not.toMatch(/diagnostics|replayFrames/);
  });

  it('plays an actual full fixture twice, commits, reloads and rejects duplicates/conflicts', () => {
    const career = currentCareer(),
      input = createCareerMatchInput(career, world);
    expect(
      input.session.setup.control.mode === 'player' && input.session.setup.control.forceIntoXI,
    ).toBe(false);
    const play = () => {
      let state = startCareerMatch(input);
      const evidence = new CareerMatchEvidence();
      let ticks = 0,
        choices = 0;
      while (state.status !== 'full_time' && state.status !== 'abandoned' && ticks++ < 430000) {
        if (state.status === 'half_time') state = startSecondHalf(state);
        const opportunity = projectPlayerDecisionOpportunity(state);
        if (opportunity) {
          const option =
            opportunity.options.find(
              (o) => o.kind === 'action' && ['pass', 'shot', 'cross'].includes(o.action.type),
            ) ?? opportunity.options[0];
          if (!option) throw new Error('Empty human opportunity.');
          state = applyPlayerDecision(state, opportunity, option.id);
          choices++;
          evidence.observe(state);
        }
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        evidence.observe(state);
      }
      expect(
        state.status,
        JSON.stringify({ ticks, choices, time: state.time, restart: state.restart?.readiness }),
      ).toBe('full_time');
      expect(choices).toBeGreaterThan(0);
      return finishCareerMatch(input, state, evidence);
    };
    const result = play(),
      repeat = play();
    expect(repeat).toEqual(result);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(
      MATCH_RESULT_MAX_BYTES,
    );
    expect(result.controlledEvidence.selected).toBeGreaterThan(0);
    const committed = applyCareerMatchResult(career, world, input, result);
    expect(committed.leagueSeason!.rounds[input.fixture.roundIndex]!.completed).toBe(true);
    expect(committed.matchHistory!.at(-1)?.matchId).toBe(result.completedMatchId);
    expect(
      committed.seasonParticipation!.find((r) => r.fixtureId === input.fixture.id)?.score,
    ).toEqual(result.score);
    expect(committed.worldDelta!.footballerConditionOverrides![career.player.id]!.source).toBe(
      'canonical',
    );
    const loaded = parseCareerSave(serializeCurrentCareerSave(committed));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
    expect(applyCareerMatchResult(hydrated, world, input, result)).toBe(hydrated);
    expect(() =>
      applyCareerMatchResult(hydrated, world, input, {
        ...result,
        score: { home: result.score.home + 1, away: result.score.away },
      }),
    ).toThrow(/Conflicting/);
    expect(() =>
      applyCareerMatchResult({ ...career, seed: 'another-career' }, world, input, result),
    ).toThrow(/belong/);
    expect(() =>
      applyCareerMatchResult(career, world, input, {
        ...result,
        fixture: { ...result.fixture, date: '2099-01-01' },
      }),
    ).toThrow(/mismatch/);
    const falseStarter = structuredClone(result);
    falseStarter.participants[0]!.started = false;
    expect(() => applyCareerMatchResult(career, world, input, falseStarter)).toThrow(/enter/);
    const unnamed = structuredClone(result);
    unnamed.participants[0]!.id = 'unnamed';
    unnamed.participants[0]!.stats.playerId = 'unnamed';
    expect(() => applyCareerMatchResult(career, world, input, unnamed)).toThrow(/unnamed/);
    if (process.env.MFL_PR164_RECEIPT === '1')
      writeFileSync(
        'docs/performance/PR164-contract.json',
        JSON.stringify(
          {
            seed: input.footballSeed,
            inputFingerprint: input.footballFingerprint,
            selection:
              'explicit forceIntoXI=true for controlled-player coverage; default adapter uses manager selection',
            fullMatchRepetitions: 2,
            identical: true,
            endedAt: result.endedAt,
            score: result.score,
            resultBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
            saveBytes: new TextEncoder().encode(serializeCurrentCareerSave(committed)).byteLength,
            participants: result.participants.length,
            substitutions: result.substitutions.length,
            cards: result.cards.length,
            controlledEvidence: result.controlledEvidence,
            checks: [
              'real calendar fixture',
              'full-time canonical physics',
              'repeat equality',
              'schema v7 save/hydrate',
              'duplicate no-op',
              'conflict rejected',
              'wrong career/date rejected',
              'condition persisted',
            ],
          },
          null,
          2,
        ) + '\n',
      );
    console.info('PR164 canonical bridge receipt', {
      endedAt: result.endedAt,
      score: result.score,
      bytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
      participants: result.participants.length,
      selected: result.controlledEvidence.selected,
      resolved: result.controlledEvidence.resolved,
      substitutions: result.substitutions.length,
    });
    if (process.env.MFL_PR166_RECEIPT === '1')
      writeFileSync(
        'docs/performance/PR166-professional-contract.json',
        JSON.stringify(
          {
            seed: input.footballSeed,
            inputFingerprint: input.footballFingerprint,
            selection: 'actual career coach selection, forceIntoXI=false',
            fixture: input.fixture,
            fullMatchRepetitions: 2,
            identical: true,
            endedAt: result.endedAt,
            score: result.score,
            resultBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
            saveBytes: new TextEncoder().encode(serializeCurrentCareerSave(committed)).byteLength,
            participants: result.participants.length,
            substitutions: result.substitutions.length,
            cards: result.cards.length,
            controlledEvidence: result.controlledEvidence,
          },
          null,
          2,
        ) + '\n',
      );
  }, 900_000);
});
