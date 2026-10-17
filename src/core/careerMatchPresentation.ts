import { z } from 'zod';

/** Small durable evidence. Times are canonical match-clock seconds, never estimated minutes. */
export const participationEvidenceSchema = z.object({
  substitutions: z
    .array(
      z.object({
        outgoingId: z.string(),
        incomingId: z.string(),
        outgoingName: z.string().optional(),
        incomingName: z.string().optional(),
        requestedAt: z.number().nonnegative(),
        leftAt: z.number().nonnegative(),
        enteredAt: z.number().nonnegative(),
        reason: z.enum(['injury', 'fatigue', 'tactical']),
      }),
    )
    .max(2),
  injury: z.object({ recoveryDays: z.number().nonnegative(), status: z.string() }).optional(),
  decisions: z
    .object({
      resolved: z.number().int().nonnegative(),
      retained: z.number().int().nonnegative(),
      turnovers: z.number().int().nonnegative(),
    })
    .optional(),
});
export type ParticipationEvidence = z.infer<typeof participationEvidenceSchema>;

export const ratingProvenanceSchema = z.object({
  model: z.literal('canonical_v1'),
  source: z.enum(['canonical', 'canonical_plus_summary']),
  unavailable: z
    .enum(['partial_actions', 'short_appearance', 'missing_evidence', 'abandoned'])
    .optional(),
});
export type RatingProvenance = z.infer<typeof ratingProvenanceSchema>;

const counter = z.number().nonnegative();
export const canonicalRatingInputSchema = z.object({
  position: z.string(),
  source: z.enum(['canonical', 'canonical_plus_summary']),
  abandoned: z.boolean().optional(),
  stats: z
    .object({
      minutesPlayed: counter,
      goals: counter,
      assists: counter,
      yellowCards: counter,
      redCards: counter,
      passesAttempted: counter,
      passesCompleted: counter,
      shots: counter,
      shotsOnTarget: counter,
      tacklesWon: counter,
      interceptions: counter,
      saves: counter,
      goalsConceded: counter,
      possessionLost: counter.optional(),
      blocks: counter.optional(),
    })
    .optional(),
});

/** A descriptive score, not another sporting simulation. No RNG, role promises or outcome bonus.
 * Hybrid actions cover only a prefix: never extrapolate them over the continuation. */
export const evaluateCanonicalRating = (input: z.input<typeof canonicalRatingInputSchema>) => {
  const parsed = canonicalRatingInputSchema.safeParse(input);
  const provenance: RatingProvenance = { model: 'canonical_v1', source: input.source };
  const unavailable: RatingProvenance['unavailable'] = input.abandoned
    ? 'abandoned'
    : input.source === 'canonical_plus_summary'
      ? 'partial_actions'
      : !parsed.success || !parsed.data.stats
        ? 'missing_evidence'
        : parsed.data.stats.minutesPlayed < 10
          ? 'short_appearance'
          : undefined;
  if (unavailable)
    return { value: undefined, provenance: { ...provenance, unavailable }, terms: [] };
  const s = parsed.data!.stats!;
  const keeper = input.position === 'goalkeeper';
  const defensive = /back|defensive_midfielder/.test(input.position);
  const attacking = /striker|winger|attacking_midfielder/.test(input.position);
  const exposure = Math.min(1, s.minutesPlayed / 60);
  const terms = [
    { label: 'Baza', value: 6 },
    // Passing volume is capped: a harmless 150/150 is worth at most 0.35.
    {
      label: 'Podania',
      value:
        Math.min(0.35, s.passesCompleted * 0.006) -
        Math.min(0.8, Math.max(0, s.passesAttempted - s.passesCompleted) * 0.035),
    },
    {
      label: 'Bramki i asysty',
      value: Math.min(3.5, s.goals * (attacking ? 1 : 1.2) + s.assists * 0.7),
    },
    {
      label: 'Strzały',
      value: keeper
        ? 0
        : Math.min(0.5, s.shotsOnTarget * 0.12) -
          Math.min(0.4, Math.max(0, s.shots - s.shotsOnTarget) * 0.035),
    },
    {
      label: 'Obrona',
      value: keeper
        ? 0
        : Math.min(
            2.2,
            (s.tacklesWon * 0.19 + s.interceptions * 0.17 + (s.blocks ?? 0) * 0.13) *
              (defensive ? 1.25 : 1),
          ),
    },
    {
      label: 'Bramkarz',
      value: keeper ? Math.min(2.6, s.saves * 0.32) - Math.min(1.8, s.goalsConceded * 0.3) : 0,
    },
    {
      label: 'Straty i kartki',
      value:
        -Math.min(0.75, (s.possessionLost ?? 0) * 0.04) - s.yellowCards * 0.18 - s.redCards * 1.4,
    },
  ];
  const value =
    Math.round(
      Math.max(
        3,
        Math.min(10, 6 + terms.slice(1).reduce((sum, t) => sum + t.value, 0) * exposure),
      ) * 10,
    ) / 10;
  return { value, provenance, terms };
};

export const ratingUnavailableLabel = (provenance?: RatingProvenance) => {
  if (!provenance?.unavailable) return 'Brak zachowanej oceny';
  return {
    partial_actions: 'Brak pełnych akcji indywidualnych po symulacji końcówki',
    short_appearance: 'Występ krótszy niż 10 minut',
    missing_evidence: 'Niepełne dane indywidualne',
    abandoned: 'Mecz przerwany',
  }[provenance.unavailable];
};
