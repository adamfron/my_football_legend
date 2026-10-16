import type { CareerState } from '../types/domain';
import { z } from 'zod';
import { playStyleEvidenceSchema } from './playStyles';
import { compactMatchParticipant } from './careerMatchSummary';

// A lightweight projection: importing career persistence must never import the 3D engine.
const retainedResultSchema = z.object({
  completedMatchId: z.string().optional(),
  inputFingerprint: z.string().optional(),
  fixture: z.record(z.string(), z.union([z.string(), z.number()])),
  status: z.enum(['full_time', 'abandoned']),
  score: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
  participants: z.array(
    z.object({
      id: z.string(),
      team: z.enum(['home', 'away']),
      started: z.boolean(),
      stats: z
        .object({
          minutesPlayed: z.number(),
          goals: z.number(),
          assists: z.number(),
          yellowCards: z.number(),
          redCards: z.number(),
        })
        .passthrough(),
      condition: z.number(),
      position: z.string(),
      injury: z.unknown().optional(),
    }),
  ),
  controlledEvidence: z.object({ behaviour: z.array(playStyleEvidenceSchema).optional() }),
  narrativeFacts: z.array(z.unknown()),
  cards: z.array(z.unknown()).optional(),
  teamAccounting: z.unknown().optional(),
  substitutions: z.array(z.unknown()).optional(),
});

export const RETAINED_DETAILED_MATCHES = 3;

/** Receipts and compact football/progression facts are permanent; rich evidence is a rolling
 * three-fixture window in the active season. Older v7 full results are compacted on save. */
export const retainCareerMatchResults = (career: CareerState): CareerState => {
  const recent = new Set(
    career.historyFacts
      .filter((f) => f.factType === 'canonical_match_result' && f.season === career.currentSeason)
      .slice(-RETAINED_DETAILED_MATCHES)
      .map((f) => f.id),
  );
  let changed = false;
  const historyFacts = career.historyFacts.map((fact) => {
    if (fact.factType !== 'canonical_match_result' || !fact.data.result) return fact;
    const parsed = retainedResultSchema.safeParse(fact.data.result);
    // Preserve unknown/invalid historical evidence instead of deleting a duplicate guard.
    if (!parsed.success) return fact;
    const result = parsed.data;
    const summary = fact.data.summary ?? {
      retentionVersion: 1,
      completedMatchId: result.completedMatchId,
      inputFingerprint: result.inputFingerprint,
      fixture: result.fixture,
      status: result.status,
      score: result.score,
      teamAccounting: result.teamAccounting,
      playerStatistics: result.participants.find((p) => p.id === career.player.id)?.stats ?? null,
      participants: result.participants.map(compactMatchParticipant),
      styles: result.controlledEvidence.behaviour ?? [],
      narrativeFacts: result.narrativeFacts,
      cards: result.cards ?? [],
      substitutions: result.substitutions ?? [],
    };
    if (recent.has(fact.id) && fact.data.summary) return fact;
    changed = true;
    const { result: _rich, ...receipt } = fact.data;
    void _rich;
    return {
      ...fact,
      data: { ...receipt, summary, ...(recent.has(fact.id) ? { result: fact.data.result } : {}) },
    };
  });
  return changed ? { ...career, historyFacts } : career;
};
