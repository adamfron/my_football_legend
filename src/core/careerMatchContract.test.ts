// @vitest-environment node
/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { createCanonicalWorldDatabase } from '../../scripts/createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { acceptProfessionalOffer } from './careerSeasons';
import { advanceCareerFlow } from './careerFlow';
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
      input = createCareerMatchInput(career, world, undefined, true);
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
  }, 900_000);
});
