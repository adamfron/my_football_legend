// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { serializeCurrentCareerSave, parseCareerSave } from './persistence';
import {
  evaluatePlayStyleUnlocks,
  getUnlockedPlayStyles,
  getPlayStyleProgress,
  qualifyingPlayStyles,
  playStylePreparationRelief,
  playStyleIdSchema,
  type PlayStyleEvidence,
} from './playStyles';
import type { CareerState, HistoryFact, PlayStyleId } from '../types/domain';
import type { PlayerDecisionOutcome } from './matchSimulation/matchState';
import { createFormationBenchmarkSession } from './matchSimulation/benchmarkFixtures';
import { createOpenPlayMatchFixture as createTacticalMatch } from './matchSimulation/matchSimulation';
import { advanceMatchFitness, createMatchFitness } from './matchSimulation/matchFitness';
import {
  deriveOnBallPreparation,
  preparationMarginForAction,
} from './matchSimulation/onBallPreparation';
import { playerAttributesSchema } from '../schemas/domainSchemas';
import { deriveDefensiveContext, derivePressingPlan } from './matchSimulation/defensiveChallenges';

const career = (): CareerState => {
  const base = createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Styl',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'goalkeeper',
        heightCm: 190,
        weightKg: 80,
        seed: 'pr166-style',
      },
      'pr166-style',
      0,
    ),
    'pr166-style',
  );
  return {
    ...base,
    player: {
      ...base.player,
      attributes: playerAttributesSchema.parse(
        Object.fromEntries(Object.keys(base.player.attributes).map((key) => [key, 70])),
      ),
    },
  };
};
const addEvidence = (
  base: CareerState,
  style: PlayStyleId,
  index: number,
  situations = 2,
): CareerState => {
  const evidence: PlayStyleEvidence = {
    style,
    situations,
    successes: Math.min(1, situations),
    contexts: [
      ['positional_attack:space', 'attacking_transition:pressed', 'defensive_transition:wide'][
        index % 3
      ]!,
    ],
  };
  const fact: HistoryFact = {
    id: `canonical_match:style-${index}`,
    factType: 'canonical_match_result',
    season: 2026 + Math.floor(index / 4),
    date: `${2026 + Math.floor(index / 4)}-09-${String((index % 4) + 1).padStart(2, '0')}`,
    actors: [base.player.id],
    targets: [],
    clubs: [base.currentClub.id],
    competitions: ['u17'],
    data: { summary: { styles: [evidence] } },
    causes: [],
    tags: ['canonical'],
    visibility: 'public',
    narrativeImportance: 50,
    emotionalTone: 'neutral',
  };
  return {
    ...base,
    historyFacts: [...base.historyFacts, fact],
    matchHistory: [
      ...(base.matchHistory ?? []),
      {
        matchId: fact.id,
        date: fact.date,
        opponentId: 'opponent',
        teamLevel: 'academy',
        started: true,
        minutes: 90,
        goals: 0,
        assists: 0,
        xG: 0,
        xA: 0,
        keyPasses: 0,
        defensiveActions: 0,
        saves: 0,
        personalImpact: 0,
      },
    ],
  };
};
const outcome = (style: PlayStyleId): PlayerDecisionOutcome => ({
  decisionId: 'decision',
  actorId: 'player',
  selectedAt: 3700,
  resolvedAt: 3702,
  decisionKind:
    style === 'ball_winner'
      ? 'defensive_response'
      : style === 'between_the_lines' || style === 'engine'
        ? 'off_ball_run'
        : 'on_ball',
  selectedIntent:
    style === 'calm_finisher'
      ? 'shot:placed'
      : style === 'ball_winner'
        ? 'challenge:standing'
        : style === 'between_the_lines' || style === 'engine'
          ? 'attack_space'
          : 'pass:through',
  startContext: {
    phase: 'positional_attack',
    pressure: 0.4,
    fieldProgress: 0.65,
    possession: 'home',
  },
  behaviourContext: {
    forwardMetres: 12,
    opponentsBypassed: 2,
    betweenLines: true,
    goalDistance: 20,
    activeEffort: true,
    goalkeeper: style === 'goalkeeper_distributor',
    pressOpportunity: true,
  },
  result: {
    kind: 'resolved',
    passCompleted: true,
    duelWon: true,
    teamRetainedPossession: true,
    progressDelta: 0.08,
    shotOutcome: 'save',
  },
});

describe('PR166 six behavioural styles', () => {
  it('does not credit passive shape or containment as ball-winning intent even beside the carrier', () => {
    for (const intent of ['hold_shape', 'hold_line', 'contain'])
      expect(
        qualifyingPlayStyles({ ...outcome('ball_winner'), selectedIntent: intent }),
      ).not.toContain('ball_winner');
    expect(qualifyingPlayStyles({ ...outcome('ball_winner'), selectedIntent: 'press' })).toContain(
      'ball_winner',
    );
  });
  for (const style of playStyleIdSchema.options)
    it(`${style}: requires repeated meaningful contexts, persists and unlocks once`, () => {
      expect(qualifyingPlayStyles(outcome(style))).toContain(style);
      expect(qualifyingPlayStyles({ ...outcome(style), result: undefined })).toEqual([]);
      const meaningless = {
        ...outcome(style),
        behaviourContext: {
          forwardMetres: 0,
          opponentsBypassed: 0,
          betweenLines: false,
          goalDistance: 90,
          activeEffort: false,
          goalkeeper: false,
          pressOpportunity: false,
        },
      };
      expect(qualifyingPlayStyles(meaningless)).toEqual([]);
      let base = career();
      for (let index = 0; index < 11; index++)
        base = evaluatePlayStyleUnlocks(addEvidence(base, style, index));
      expect(getUnlockedPlayStyles(base)).not.toContain(style);
      base = evaluatePlayStyleUnlocks(addEvidence(base, style, 11));
      expect(getUnlockedPlayStyles(base)).toContain(style);
      const fact = base.historyFacts.find((f) => f.factType === 'play_style_unlocked')!;
      expect(fact.causes).toHaveLength(6);
      expect(getPlayStyleProgress(base).find((p) => p.style === style)).toMatchObject({
        matches: 12,
        seasons: 3,
        months: 24,
      });
      expect(evaluatePlayStyleUnlocks(base)).toBe(base);
      const loaded = parseCareerSave(serializeCurrentCareerSave(base));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) throw new Error('save');
      const transferred = {
        ...loaded.save.career,
        currentSeason: 2027,
        careerSeasonNumber: 2,
        currentClub: { ...base.currentClub, id: 'next-club' },
      };
      expect(getUnlockedPlayStyles(transferred)).toContain(style);
      expect(getPlayStyleProgress(transferred).find((p) => p.style === style)?.situations).toBe(24);
      expect(evaluatePlayStyleUnlocks(transferred)).toBe(transferred);
      let harmless = career();
      for (let index = 0; index < 16; index++) harmless = addEvidence(harmless, style, index, 0);
      expect(getUnlockedPlayStyles(evaluatePlayStyleUnlocks(harmless))).not.toContain(style);
    });

  for (const style of [
    'progressive_passer',
    'goalkeeper_distributor',
    'calm_finisher',
    'between_the_lines',
  ] as const)
    it(`${style}: contextual preparation relief has a small deterministic bound`, () => {
      const c = {
        forwardMetres: 12,
        goalDistance: 20,
        pressure: 0.4,
        goalkeeper: true,
        pass: true,
        shot: true,
        reception: true,
      };
      expect(playStylePreparationRelief([style], c)).toBe(0.025);
      if (style === 'goalkeeper_distributor')
        expect(playStylePreparationRelief([style], { ...c, forwardMetres: 0 })).toBe(0);
      expect(
        playStylePreparationRelief([style], {
          ...c,
          forwardMetres: 0,
          goalDistance: 90,
          pressure: 0,
          reception: false,
        }),
      ).toBe(0);
      const state = createTacticalMatch(
        createFormationBenchmarkSession({
          anchor: '4-3-3',
          opponent: '4-4-2',
          attributes: 65,
          seed: 'style-effects',
        }),
      );
      const actor = state.players[style === 'goalkeeper_distributor' ? 0 : 8]!;
      actor.position = { x: 85, y: 34 };
      actor.facingAngle = Math.PI / 2;
      state.currentPressure = 0.4;
      state.onBallPreparation = {
        actorId: actor.id,
        gainedAt: 0,
        readyAt: 1,
        kind: 'settling',
        incomingSpeed: 0,
      };
      const action =
        style === 'calm_finisher'
          ? {
              type: 'shot' as const,
              actorId: actor.id,
              intent: 'placed' as const,
              target: { x: 105, y: 34 },
            }
          : {
              type: 'pass' as const,
              actorId: actor.id,
              receiverId: state.players[9]!.id,
              intent: 'through' as const,
              target: { x: 100, y: 60 },
            };
      if (style !== 'between_the_lines') {
        const ordinary = preparationMarginForAction(state, actor, action);
        const experienced = preparationMarginForAction(
          state,
          { ...actor, playStyles: [style] },
          action,
        );
        expect(experienced - ordinary).toBeCloseTo(0.025, 6);
      } else {
        state.ball = { x: 85, y: 34, velocity: { x: -14, y: 0 } };
        state.teams.home.phase = 'positional_attack';
        const ordinary = deriveOnBallPreparation(state, actor, 'directional_control');
        const experienced = deriveOnBallPreparation(
          state,
          { ...actor, playStyles: [style] },
          'directional_control',
        );
        expect(ordinary.readyAt - experienced.readyAt).toBeCloseTo(0.025, 6);
      }
    });

  it('engine improves late low-work recovery while real exertion remains equal', () => {
    const state = createTacticalMatch(
      createFormationBenchmarkSession({
        anchor: '4-3-3',
        opponent: '4-4-2',
        attributes: 65,
        seed: 'engine-effect',
      }),
    );
    const actor = state.players[8]!;
    actor.fitness = { ...createMatchFitness(75), burstReadiness: 0.3 };
    actor.fitness.workload.seconds = 3601;
    const sample = { dt: 0.025, speed: 1, previousSpeed: 1, distance: 0.025, turnRadians: 0 };
    const ordinary = advanceMatchFitness(actor, sample);
    const experienced = advanceMatchFitness({ ...actor, playStyles: ['engine'] }, sample);
    expect(experienced.burstReadiness).toBeGreaterThan(ordinary.burstReadiness);
    expect(experienced.exertionSpent).toBe(ordinary.exertionSpent);
    expect(experienced.longTermCapacity).toBe(ordinary.longTermCapacity);
  });

  it('ball winner modestly anticipates a nearby moving carrier through the real pressing plan', () => {
    const state = createTacticalMatch(
      createFormationBenchmarkSession({
        anchor: '4-3-3',
        opponent: '4-4-2',
        attributes: 65,
        seed: 'winner-effect',
      }),
    );
    const defender = state.players[13]!,
      carrier = state.players[8]!;
    defender.position = { x: 72, y: 34 };
    carrier.position = { x: 70, y: 34 };
    carrier.velocity = { x: 2, y: 0 };
    state.ball = { x: 70, y: 34, ownerId: carrier.id };
    expect(deriveDefensiveContext(state, defender.id)).toBeTruthy();
    const ordinary = derivePressingPlan(state, defender.id);
    defender.playStyles = ['ball_winner'];
    const experienced = derivePressingPlan(state, defender.id);
    expect(experienced?.target.x).not.toBe(ordinary?.target.x);
  });
});
