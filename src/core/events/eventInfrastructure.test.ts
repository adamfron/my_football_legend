import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from '../playerCreator';
import { applyEventResolution, advanceActiveEvent } from './applyEventResolution';
import { getEventDefinition, registerEventDefinition } from './eventRegistry';
import { instantiateEvent } from './instantiateEvent';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'left_winger',
        heightCm: 175,
        weightKg: 68,
        seed: 'generic-event',
      },
      'generic-event',
      0,
    ),
    'generic-event',
  );

describe('generic event infrastructure', () => {
  it('instantiates and applies facts independently of academy content', () => {
    registerEventDefinition({
      id: 'context_event',
      version: 1,
      category: 'career',
      tags: ['context'],
      availabilityConditions: [],
      cast: [],
      playerInformationKeys: [],
      decisions: [],
      hiddenTests: [],
      consequences: [],
      nextEventIds: [],
      localizationKeys: { title: 'event.title', summary: 'event.summary' },
    });
    const instantiated = instantiateEvent(career(), 'context_event').career;
    const fact = {
      id: 'fact_context',
      factType: 'context_observed',
      season: 2026,
      date: '2026-08-01',
      actors: [instantiated.player.id],
      targets: [],
      clubs: [instantiated.currentClub.id],
      competitions: [],
      data: { decisionId: 'observe' },
      causes: [],
      tags: ['context'],
      visibility: 'partial' as const,
      narrativeImportance: 20,
      emotionalTone: 'neutral' as const,
    };
    const resolved = applyEventResolution(instantiated, {
      tier: 'success',
      objectiveOutcome: 'observed',
      moraleDelta: 1,
      fitnessDelta: 0,
      reputationDelta: 0,
      relationshipChanges: {},
      interpretations: [],
      fact,
    });
    expect(getEventDefinition('context_event').tags).toContain('context');
    expect(resolved.historyFacts).toContainEqual(fact);
    expect(advanceActiveEvent(resolved).activeEvent).toBeUndefined();
  });
});
