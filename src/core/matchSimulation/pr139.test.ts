import { describe, expect, it } from 'vitest';
import {
  MATCH_PRESENTATION_POLICIES,
  shouldSurfaceMatchMoment,
  type MatchMomentCandidate,
} from '.';

const candidate = (overrides: Partial<MatchMomentCandidate> = {}): MatchMomentCandidate => ({
  kind: 'player_decision',
  importance: 0.58,
  actorIds: ['player'],
  reasons: [],
  controlledPlayerInvolved: true,
  requiresHumanDecision: true,
  detectedAt: 10,
  suggestedLeadInSeconds: 1,
  ...overrides,
});

describe('PR139 key-player semantic overrides', () => {
  it('surfaces a credible multi-choice shooting opportunity below the scalar threshold', () => {
    expect(
      shouldSurfaceMatchMoment(
        candidate({ reasons: ['situation:shooting_opportunity', 'choices:5'] }),
        MATCH_PRESENTATION_POLICIES.key_player,
      ),
    ).toBe(true);
  });

  it('keeps routine and non-credible choices sparse', () => {
    expect(
      shouldSurfaceMatchMoment(
        candidate({ importance: 0.4, reasons: ['situation:routine_possession', 'choices:5'] }),
        MATCH_PRESENTATION_POLICIES.key_player,
      ),
    ).toBe(false);
    expect(
      shouldSurfaceMatchMoment(
        candidate({ importance: 0.58, reasons: ['situation:shooting_opportunity', 'choices:1'] }),
        MATCH_PRESENTATION_POLICIES.key_player,
      ),
    ).toBe(false);
  });

  it('does not change full-match behavior', () => {
    expect(
      shouldSurfaceMatchMoment(
        candidate({ controlledPlayerInvolved: false, requiresHumanDecision: false, importance: 0 }),
        MATCH_PRESENTATION_POLICIES.full_match,
      ),
    ).toBe(true);
  });
});
