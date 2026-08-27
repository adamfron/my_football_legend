import { z } from 'zod';

export const narrativeVariantSchema = z.object({
  key: z.string().min(1),
  weight: z.number().positive().optional(),
  requiredTags: z.array(z.string()).optional(),
  excludedTags: z.array(z.string()).optional(),
});
export const narrativeVariantSetSchema = z.object({
  id: z.string().min(1),
  variants: z.array(narrativeVariantSchema).min(1),
});
export const narrativeVariantContextSchema = z.object({
  careerSeed: z.string().min(1),
  scope: z.string().min(1),
  tags: z.array(z.string()),
  factIds: z.array(z.string()).optional(),
  actorIds: z.array(z.string()).optional(),
});
export const openingMonthRoleSchema = z.enum([
  'senior_training_rotation',
  'senior_trial_extended',
  'weekly_senior_access',
  'academy_leader',
  'individual_development_plan',
  'academy_match_opportunity',
]);

const score = z.number().min(0).max(100);
const unit = z.number().min(0).max(1);
const id = z.string().min(1);

export const relationshipScoresSchema = z.object({
  liking: score,
  trust: score,
  respect: score,
  rivalry: score,
  resentment: score,
  gratitude: score,
  professionalDependence: score,
});
export const faceGenomeSchema = z.object({
  headProportion: unit,
  jawWidth: unit,
  chinLength: unit,
  eyeSpacing: unit,
  eyeSize: unit,
  browShape: unit,
  noseLength: unit,
  noseWidth: unit,
  mouthWidth: unit,
  earSize: unit,
  skinTone: unit,
  eyeColor: unit,
  hairColor: unit,
  hairstyle: unit,
  facialHair: unit,
  ageSigns: unit,
  accessories: unit,
});
export const playerAttributesSchema = z.object({
  technique: score,
  vision: score,
  pace: score,
  stamina: score,
  finishing: score,
  defending: score,
  leadership: score,
  composure: score,
  spatialAwareness: score,
  determination: score,
  ambition: score,
  professionalism: score,
});
export const goalkeeperAttributesSchema = z.object({
  reflexes: score,
  handling: score,
  oneOnOnes: score,
  goalkeeperPositioning: score,
  aerialCommand: score,
  distribution: score,
  communication: score,
});
export const playerSchema = z.object({
  id,
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().int().min(15),
  nationality: z.string(),
  heightCm: z.number(),
  weightKg: z.number(),
  attributes: playerAttributesSchema,
  goalkeeperAttributes: goalkeeperAttributesSchema.optional(),
  traits: z.array(z.string()),
  archetypeId: id,
  careerPremiseId: id,
  potential: score,
  primaryPosition: z.string(),
  secondaryPositions: z.array(z.string()),
  positionFamiliarity: z.record(z.string(), unit),
  preferredRoles: z.array(z.string()),
  fitness: score,
  health: score,
  morale: score,
  reputation: score,
  matchPresentation: z.enum(['important_matches', 'simulate_all']),
  matchEffort: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  trainingEffort: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});
export const personSchema = z.object({
  id,
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  nationality: z.string(),
  age: z.number().int(),
  personality: z.array(z.string()),
  clubId: id.optional(),
  persistence: z.enum(['ephemeral', 'local', 'career']),
  relationshipParameters: relationshipScoresSchema,
  faceSeed: z.string(),
  faceGenome: faceGenomeSchema.optional(),
  narrativeTags: z.array(z.string()),
});
export const clubSchema = z.object({
  id,
  name: z.string(),
  country: z.string(),
  region: z.string(),
  dna: z.array(z.string()),
  currentSituation: z.string(),
  playStyle: z.string(),
  youthApproach: z.string(),
  prestige: score,
  seasonHistory: z.array(
    z.object({
      season: z.number().int(),
      summary: z.string(),
      placement: z.number().int().optional(),
    }),
  ),
  notablePlayers: z.array(id),
  notableCoaches: z.array(id),
  legends: z.array(id),
  rivals: z.array(id),
});
const positionalNeedSchema = z.object({
  starterQuality: score,
  depth: z.enum(['thin', 'normal', 'deep']),
  needLevel: score,
});
export const professionalClubSchema = z.object({
  id,
  name: z.string(),
  country: z.string(),
  region: z.string(),
  shortName: z.string().optional(),
  managerId: id.optional(),
  philosophyTags: z.array(z.string()).optional(),
  leagueTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  professionalLevel: z.number().int().min(1).max(5).optional(),
  reputation: score,
  strengthRating: score.optional(),
  overallStrength: score.optional(),
  financialLevel: score,
  playingStyle: z.string(),
  youthPolicy: score,
  developmentReputation: score,
  sellingClubTendency: score,
  pressureLevel: score,
  coachYouthTrust: score,
  archetype: z.enum([
    'YOUTH_TRADER',
    'RESULTS_FIRST',
    'LOCAL_DEVELOPMENT',
    'TECHNICAL_ACADEMY',
    'UNDERDOG',
    'AMBITIOUS_CLIMBER',
  ]),
  positionalNeeds: z.object({
    goalkeeper: positionalNeedSchema,
    defense: positionalNeedSchema,
    midfield: positionalNeedSchema,
    attack: positionalNeedSchema,
  }),
});
export const contractSchema = z.object({
  clubId: id,
  startDate: z.string(),
  endDate: z.string(),
  monthlySalary: z.number().int().positive(),
  signingBonus: z.number().int().nonnegative(),
  squadRole: z.enum([
    'development_player',
    'rotation',
    'first_team_competition',
    'important_player',
    'star_player',
  ]),
  contractType: z.enum(['professional', 'development']),
});
export const professionalOfferSchema = z.object({
  id,
  club: professionalClubSchema,
  contract: contractSchema,
  interestReasons: z.array(z.string()).min(1),
  opportunity: z.string(),
  risk: z.string(),
  competitionAssessment: z.string(),
});
export const eventDefinitionSchema = z.object({
  id,
  version: z.number().int().positive(),
  category: z.string(),
  tags: z.array(z.string()),
  availabilityConditions: z.array(z.string()),
  cast: z.array(z.string()),
  playerInformationKeys: z.array(z.string()),
  decisions: z
    .array(
      z.object({
        id,
        labelKey: z.string(),
        descriptionKey: z.string(),
        visiblePros: z.array(z.string()),
        visibleCons: z.array(z.string()),
        availability: z
          .object({
            positions: z.array(z.string()).optional(),
            positionGroups: z
              .array(z.enum(['goalkeeper', 'defender', 'midfielder', 'attacker', 'outfield']))
              .optional(),
            requiredFacts: z.array(z.string()).optional(),
            excludedFacts: z.array(z.string()).optional(),
            requiredTags: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .min(1),
  hiddenTests: z.array(
    z.object({
      id,
      attribute: z.string(),
      difficulty: score,
      successChanceModifier: z.number().optional(),
    }),
  ),
  consequences: z.array(
    z.object({
      id,
      type: z.string(),
      data: z.record(z.string(), z.unknown()),
      factType: z.string().optional(),
    }),
  ),
  nextEventIds: z.array(id),
  localizationKeys: z.object({ title: z.string(), summary: z.string() }),
});
export const eventInstanceSchema = z.object({
  id,
  definitionId: id,
  context: z.record(z.string(), z.unknown()),
  cast: z.record(z.string(), id),
  selectedDecisionId: id.optional(),
  randomState: z.string(),
  result: z.record(z.string(), z.unknown()).optional(),
  createdFactIds: z.array(id),
  threadChanges: z.record(z.string(), z.string()),
});
export const historyFactSchema = z.object({
  id,
  factType: z.string(),
  season: z.number().int(),
  date: z.string(),
  actors: z.array(id),
  targets: z.array(id),
  clubs: z.array(id),
  competitions: z.array(z.string()),
  data: z.record(z.string(), z.unknown()),
  causes: z.array(id),
  tags: z.array(z.string()),
  visibility: z.enum(['hidden', 'partial', 'public']),
  narrativeImportance: score,
  emotionalTone: z.enum(['positive', 'neutral', 'negative', 'bittersweet']),
});
export const storyThreadSchema = z.object({
  id,
  threadType: z.string(),
  participants: z.array(id),
  relatedFactIds: z.array(id),
  status: z.enum(['open', 'dormant', 'closed']),
  tension: score,
  importance: score,
  openedSeason: z.number().int(),
  lastActivitySeason: z.number().int(),
  recallTags: z.array(z.string()),
});
export const fixtureSchema = z.object({
  id,
  seasonId: id,
  date: z.string(),
  competition: z.enum(['league', 'academy_league', 'friendly']),
  opponent: z.object({
    id,
    name: z.string(),
    strength: score,
    style: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
  }),
  venue: z.enum(['home', 'away']),
  importance: score,
  matchImportance: z.enum(['routine', 'notable', 'major', 'career_defining']),
});
export const careerWeekSchema = z.object({
  id,
  seasonId: id,
  weekIndex: z.number().int().nonnegative(),
  startDate: z.string(),
  endDate: z.string(),
  phase: z.enum(['academy', 'preseason', 'regular_season', 'winter_break']),
  fixtureIds: z.array(id),
  scheduledEventIds: z.array(id),
  completedEventIds: z.array(id),
  summaryVariantKey: id.optional(),
  completed: z.boolean(),
});
export const monthlyCheckpointSchema = z.object({
  id,
  month: z.string(),
  appearances: z.number().int().nonnegative(),
  minutes: z.number().nonnegative(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  averageRating: z.number().optional(),
  form: z.enum(['excellent', 'good', 'steady', 'uneven', 'poor']),
  role: z.string(),
  highlightFactId: id.optional(),
});
export const careerCalendarSchema = z.object({
  seasonId: id,
  currentWeekIndex: z.number().int().nonnegative(),
  weeks: z.array(careerWeekSchema),
  fixtures: z.array(fixtureSchema),
  monthlyCheckpoints: z.array(monthlyCheckpointSchema),
  availableThrough: z.string(),
});
export const leagueClubProfileSchema = z.object({
  clubId: id,
  name: z.string(),
  strength: score,
  attackStrength: score,
  defenseStrength: score,
  form: z.number().min(-20).max(20),
});
export const leagueFixtureSchema = z.object({
  id,
  roundIndex: z.number().int().nonnegative(),
  date: z.string(),
  homeClubId: id,
  awayClubId: id,
  homeGoals: z.number().int().nonnegative().optional(),
  awayGoals: z.number().int().nonnegative().optional(),
  completed: z.boolean(),
  playerAppearanceMatchId: id.optional(),
});
export const leagueRoundSchema = z.object({
  index: z.number().int().nonnegative(),
  date: z.string(),
  fixtures: z.array(leagueFixtureSchema),
  completed: z.boolean(),
});
export const leagueSeasonSchema = z.object({
  id,
  name: z.string(),
  competition: z.object({
    id,
    name: z.string(),
    country: z.string(),
    category: z.enum(['youth', 'professional']),
    ageLevel: z.enum(['U17', 'U19', 'U21']).optional(),
    tier: z.number().int().positive().optional(),
  }),
  controlledClubId: id,
  startDate: z.string(),
  endDate: z.string(),
  clubIds: z.array(id).min(2).max(32),
  clubs: z.array(leagueClubProfileSchema).min(2).max(32),
  rounds: z.array(leagueRoundSchema).min(2).max(62),
  currentRound: z.number().int().min(0).max(62),
  completed: z.boolean(),
});
export const playerDecisionPointSchema = z.object({
  type: z.enum([
    'important_match',
    'off_field_event',
    'relationship_event',
    'development_event',
    'season_context',
    'checkpoint',
  ]),
  date: z.string(),
  sourceId: id,
});
export const fastForwardEntrySchema = z.object({
  id,
  date: z.string(),
  type: z.enum(['match', 'quiet_week', 'event']),
  summary: z.string(),
  fixtureId: id.optional(),
  appearanceMatchId: id.optional(),
});
export const careerEventCandidateSchema = z.object({
  eventDefinitionId: id,
  weight: z.number().positive(),
  phases: z.array(z.enum(['academy', 'preseason', 'regular_season', 'winter_break'])).min(1),
  requiredTags: z.array(z.string()).optional(),
  excludedTags: z.array(z.string()).optional(),
  requiredFacts: z.array(z.string()).optional(),
  excludedFacts: z.array(z.string()).optional(),
  requiredPositionGroups: z
    .array(z.enum(['goalkeeper', 'defender', 'midfielder', 'attacker', 'outfield']))
    .optional(),
  minWeek: z.number().int().nonnegative().optional(),
  maxWeek: z.number().int().nonnegative().optional(),
  oncePerCareer: z.boolean().optional(),
  conflictsWith: z.array(id).optional(),
  recallTags: z.array(z.string()),
  relationshipRole: z.enum(['peer', 'mentor', 'assistant_coach', 'physiotherapist']).optional(),
});
export const careerStateSchema = z.object({
  seed: z.string(),
  currentSeason: z.number().int(),
  careerSeasonNumber: z.number().int().positive(),
  player: playerSchema,
  currentClub: clubSchema,
  previousClubIds: z.array(id),
  significantPeople: z.array(personSchema),
  relationships: z.record(z.string(), relationshipScoresSchema),
  historyFacts: z.array(historyFactSchema),
  storyThreads: z.array(storyThreadSchema),
  statistics: z.record(z.string(), z.number()),
  activeEvent: eventInstanceSchema.optional(),
  careerCalendar: careerCalendarSchema.optional(),
  recentVariantKeys: z.array(z.string()).max(12).optional(),
  leagueSeason: leagueSeasonSchema.optional(),
  decisionPoint: playerDecisionPointSchema.optional(),
  fastForwardLog: z.array(fastForwardEntrySchema).max(16).optional(),
  seasonStartingAttributes: playerAttributesSchema.optional(),
  currentContract: contractSchema.optional(),
  professionalOffers: z.array(professionalOfferSchema).optional(),
  careerPhase: z
    .enum(['academy', 'preseason', 'regular_season', 'summer_window', 'offseason'])
    .optional(),
  currentDate: z.string().optional(),
  currentProfessionalClub: professionalClubSchema.optional(),
  currentSportingStatus: z
    .enum([
      'development_player',
      'rotation',
      'first_team_competition',
      'important_player',
      'star_player',
    ])
    .optional(),
  careerStatus: z.enum(['active', 'retired']).optional(),
  retirementDate: z.string().optional(),
  retirementAge: z.number().int().min(16).max(40).optional(),
  retirementReason: z.string().optional(),
  highestOVR: z.number().min(0).max(100).optional(),
  highestOVRDate: z.string().optional(),
  developmentProfile: z
    .object({
      developmentType: z.enum(['early_bloomer', 'normal', 'late_bloomer']),
      growthRate: z.number().positive(),
      peakAge: z.number().int(),
      declineStartAge: z.number().int(),
      softPotential: score,
      developmentVolatility: score,
      physicalPeakAge: z.number().int(),
      technicalPeakAge: z.number().int(),
      mentalPeakAge: z.number().int(),
    })
    .optional(),
  clubWorld: z.array(professionalClubSchema).optional(),
  completedSeasons: z
    .array(
      z.object({
        seasonId: id,
        seasonNumber: z.number().int().positive(),
        label: z.string(),
        age: z.number().int(),
        clubId: id,
        clubName: z.string(),
        leagueLevel: z.number().int().min(0).max(4),
        leagueName: z.string(),
        leagueTier: z.number().int().min(0).max(4).optional(),
        clubFinish: z.number().int(),
        clubPoints: z.number().int(),
        clubRecord: z.object({
          won: z.number().int(),
          drawn: z.number().int(),
          lost: z.number().int(),
        }),
        goalsFor: z.number().int(),
        goalsAgainst: z.number().int(),
        player: z.object({
          appearances: z.number(),
          starts: z.number(),
          minutes: z.number(),
          goals: z.number(),
          assists: z.number(),
          xG: z.number(),
          xA: z.number(),
          keyPasses: z.number(),
          defensiveActions: z.number(),
          averageRating: z.number(),
          yellowCards: z.number(),
          redCards: z.number(),
          missedBySuspension: z.number(),
          missedByInjury: z.number(),
        }),
        development: z.object({
          seasonStartAttributes: playerAttributesSchema,
          seasonEndAttributes: playerAttributesSchema,
          seasonStartOVR: z.number(),
          seasonEndOVR: z.number(),
        }),
        fixtures: z.array(z.any()),
        milestones: z.array(id),
        seasonResult: z.enum(['promoted', 'relegated', 'stayed', 'champion']).optional(),
      }),
    )
    .optional(),
  seasonParticipation: z
    .array(
      z.object({
        fixtureId: id,
        date: z.string(),
        opponentId: id,
        venue: z.enum(['home', 'away']),
        competition: z.string(),
        status: z.enum([
          'starter',
          'substitute',
          'unused_bench',
          'not_selected',
          'injured',
          'suspended',
          'unfit',
          'unavailable',
        ]),
        plannedMinutes: z.number().int().nonnegative(),
        minutes: z.number().int().nonnegative(),
        started: z.boolean(),
        appearanceMatchId: z.string().optional(),
        goals: z.number().int().nonnegative(),
        assists: z.number().int().nonnegative(),
        xG: z.number().nonnegative(),
        xA: z.number().nonnegative(),
        rating: z.number().optional(),
        seasonId: z.string().optional(),
        competitionId: z.string().optional(),
        homeClubId: z.string().optional(),
        awayClubId: z.string().optional(),
        fixtureStatus: z.enum(['scheduled', 'completed', 'postponed']).optional(),
        score: z
          .object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() })
          .optional(),
        keyPasses: z.number().int().nonnegative().optional(),
        defensiveActions: z.number().int().nonnegative().optional(),
        yellowCards: z.number().int().nonnegative().optional(),
        redCard: z.enum(['second_yellow', 'direct']).optional(),
        goalkeeperStats: z
          .object({
            goalsConceded: z.number().int().nonnegative(),
            shotsOnTargetFaced: z.number().int().nonnegative(),
            saves: z.number().int().nonnegative(),
            savePercentage: z.number().min(0).max(100),
            cleanSheet: z.boolean(),
            xGA: z.number().nonnegative(),
            errorsLeadingToGoal: z.number().int().nonnegative(),
            rating: z.number(),
            crossesClaimed: z.number().int().nonnegative().optional(),
            sweeperActions: z.number().int().nonnegative().optional(),
            distributionCompleted: z.number().int().nonnegative().optional(),
            distributionAttempted: z.number().int().nonnegative().optional(),
            detailsAvailable: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  trainingApproach: z.enum(['recovery', 'balanced', 'extra_work']).optional(),
  selectionStanding: score.optional(),
  seasonOutcome: z
    .object({
      finalPosition: z.number().int().min(1).max(32),
      champion: z.boolean(),
      competitionType: z.enum(['academy', 'professional']),
      promoted: z.boolean().optional(),
      relegated: z.boolean().optional(),
      previousLeagueTier: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
        .optional(),
      nextLeagueTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
      leagueOutcome: z.enum(['promoted', 'relegated', 'stayed', 'champion']).optional(),
    })
    .optional(),
  playerAvailability: z
    .object({
      injuries: z.array(
        z.object({
          id,
          startDate: z.string(),
          severity: z.enum(['knock', 'minor', 'moderate', 'major']),
          matchesRemaining: z.number().int().nonnegative(),
          source: z.enum(['match', 'training', 'overload']),
          status: z.enum(['active', 'recovered']),
          bodyArea: z.string().optional(),
        }),
      ),
      suspensionMatchesRemaining: z.number().int().nonnegative(),
      leagueYellowCards: z.number().int().nonnegative(),
      matchesMissedThroughSuspension: z.number().int().nonnegative(),
      matchesMissedThroughInjury: z.number().int().nonnegative(),
    })
    .optional(),
  finances: z
    .array(
      z.object({
        id,
        date: z.string(),
        amount: z.number(),
        category: z.enum([
          'stipend',
          'side_job',
          'development',
          'recovery',
          'education',
          'lifestyle',
          'salary',
          'signing_bonus',
        ]),
        sourceFactId: id.optional(),
      }),
    )
    .optional(),
  developmentProgress: z
    .array(
      z.object({
        attribute: z.enum([
          'technique',
          'vision',
          'pace',
          'stamina',
          'finishing',
          'defending',
          'leadership',
          'composure',
          'spatialAwareness',
          'determination',
          'ambition',
          'professionalism',
        ]),
        progress: z.number().min(0),
      }),
    )
    .optional(),
  augustPlanning: z
    .object({
      currentWeek: z.number().int().min(1).max(4),
      startedFitness: score,
      startedMorale: score,
      completed: z.boolean(),
      results: z.array(
        z.object({
          week: z.number().int(),
          date: z.string(),
          activityId: z.enum([
            'extra_individual_training',
            'hire_personal_coach',
            'nutrition_consultation',
            'education_session',
            'food_delivery_shift',
            'prioritize_recovery',
          ]),
          fitnessDelta: z.number(),
          moraleDelta: z.number(),
          development: z.number(),
          overloaded: z.boolean(),
          narrative: z.string(),
          interlude: z.string().optional(),
        }),
      ),
    })
    .optional(),
  matchHistory: z
    .array(
      z.object({
        matchId: id,
        date: z.string(),
        opponentId: id,
        teamLevel: z.enum(['senior', 'academy']),
        started: z.boolean(),
        minutes: z.number(),
        goals: z.number(),
        assists: z.number(),
        xG: z.number(),
        xA: z.number(),
        keyPasses: z.number(),
        defensiveActions: z.number(),
        saves: z.number(),
        personalImpact: z.number(),
        rating: z.number().min(3).max(10).optional(),
        yellowCards: z.number().int().min(0).max(2).optional(),
        redCard: z.enum(['second_yellow', 'direct']).optional(),
        dismissedMinute: z.number().int().min(1).max(120).optional(),
        injuryId: id.optional(),
      }),
    )
    .optional(),
  september: z
    .object({
      fixtureIndex: z.number().int().min(0).max(4),
      opponents: z.array(
        z.object({
          id,
          name: z.string(),
          strength: score,
          style: z.string(),
          strengths: z.array(z.string()),
          weaknesses: z.array(z.string()),
        }),
      ),
      availability: z.array(
        z.object({
          unit: z.enum(['goalkeeper', 'defense', 'midfield', 'attack']),
          severity: z.enum(['full', 'one_absence', 'several_absences']),
          reason: z.enum(['minor_injury', 'major_injury', 'suspension', 'fatigue', 'none']),
        }),
      ),
      completed: z.boolean(),
    })
    .optional(),
  activeMatch: z
    .object({
      id,
      fixtureIndex: z.number().int(),
      date: z.string(),
      competition: z.string(),
      teamLevel: z.enum(['senior', 'academy']),
      opponent: z.object({
        id,
        name: z.string(),
        strength: score,
        style: z.string(),
        strengths: z.array(z.string()),
        weaknesses: z.array(z.string()),
      }),
      venue: z.enum(['home', 'away']),
      squadStatus: z.enum([
        'senior_starter',
        'senior_bench',
        'senior_out',
        'academy_starter',
        'academy_bench',
        'no_match',
      ]),
      currentMinute: z.number(),
      homeGoals: z.number(),
      awayGoals: z.number(),
      playerMinutes: z.number(),
      plannedMinutes: z.number(),
      moments: z.array(
        z.object({
          definitionId: id,
          minute: z.number(),
          scoreFor: z.number(),
          scoreAgainst: z.number(),
          description: z.string(),
        }),
      ),
      currentMoment: z
        .object({
          definitionId: id,
          minute: z.number(),
          scoreFor: z.number(),
          scoreAgainst: z.number(),
          description: z.string(),
        })
        .optional(),
      resolvedMoments: z.array(
        z.object({
          moment: z.object({
            definitionId: id,
            minute: z.number(),
            scoreFor: z.number(),
            scoreAgainst: z.number(),
            description: z.string(),
          }),
          decisionId: id,
          tier: z.enum(['excellent', 'good', 'mixed', 'poor', 'costly']),
          personalImpact: z.number(),
          teamImpact: z.number(),
          coachImpact: z.number(),
          narrative: z.string(),
          goals: z.number(),
          assists: z.number(),
          xG: z.number(),
          xA: z.number(),
          keyPasses: z.number(),
          defensiveActions: z.number(),
          saves: z.number(),
          behaviorTags: z
            .array(
              z.enum([
                'progressive_pass',
                'defensive_read',
                'pressure_resistance',
                'late_box_run',
                'long_shot',
                'one_on_one_finish',
                'pressing_action',
                'goalkeeper_distribution',
              ]),
            )
            .optional(),
          ratingBefore: z.number().min(3).max(10).optional(),
          ratingAfter: z.number().min(3).max(10).optional(),
          ratingExplanation: z.string().optional(),
        }),
      ),
      teamStats: z
        .object({
          home: z.object({
            possession: z.number().min(0).max(100),
            shots: z.number().nonnegative(),
            shotsOnTarget: z.number().nonnegative(),
            xG: z.number().nonnegative(),
            dangerousActions: z.number().nonnegative(),
          }),
          away: z.object({
            possession: z.number().min(0).max(100),
            shots: z.number().nonnegative(),
            shotsOnTarget: z.number().nonnegative(),
            xG: z.number().nonnegative(),
            dangerousActions: z.number().nonnegative(),
          }),
        })
        .optional(),
      momentum: z
        .array(
          z.object({
            minute: z.number().min(0).max(90),
            homeThreat: score,
            awayThreat: score,
            event: z.enum(['goal', 'big_chance', 'substitution', 'red_card']).optional(),
            scoringSide: z.enum(['home', 'away']).optional(),
          }),
        )
        .optional(),
      goalEvents: z
        .array(
          z.object({
            id,
            minute: z.number().min(0).max(120),
            scoringSide: z.enum(['home', 'away']),
            source: z.enum(['background', 'player']),
          }),
        )
        .optional(),
      liveRating: z.number().min(3).max(10).optional(),
      completed: z.boolean(),
    })
    .optional(),
});

export const archetypeSchema = z.object({
  id,
  nameKey: z.string(),
  descriptionKey: z.string(),
  attributeBias: playerAttributesSchema.partial(),
  tags: z.array(z.string()),
});
export const careerPremiseSchema = z.object({
  id,
  nameKey: z.string(),
  descriptionKey: z.string(),
  startingAge: z.number().int(),
  startingReputation: score,
  tags: z.array(z.string()),
});
