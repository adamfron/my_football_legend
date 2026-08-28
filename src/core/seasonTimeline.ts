import type {
  CareerState,
  ScheduledCalendarEvent,
  SeasonParticipationRecord,
} from '../types/domain';
import { getRegularEventTimelinePresentation } from './events/regularSeasonEvents';

export type SeasonTimelineEntry =
  | {
      kind: 'fixture';
      date: string;
      sourceId: string;
      fixtureId: string;
      status: 'scheduled' | 'completed' | 'postponed';
      participation?: SeasonParticipationRecord;
    }
  | {
      kind: 'event';
      date: string;
      sourceId: string;
      eventId: string;
      status: 'scheduled' | 'completed';
      label: string;
      factId?: string;
    };

const priority: Record<SeasonTimelineEntry['kind'], number> = { event: 0, fixture: 1 };

/** Player-facing schedule projection; canonical facts remain in career history. */
export const buildSeasonTimeline = (career: CareerState): SeasonTimelineEntry[] => {
  const calendar = career.careerCalendar;
  if (!calendar) return [];
  const fixtureEntries: SeasonTimelineEntry[] = calendar.fixtures.map((fixture) => {
    const participation = career.seasonParticipation?.find((row) => row.fixtureId === fixture.id);
    return {
      kind: 'fixture',
      date: fixture.date,
      sourceId: fixture.id,
      fixtureId: fixture.id,
      status: participation?.fixtureStatus ?? 'scheduled',
      ...(participation ? { participation } : {}),
    };
  });
  const eventEntries: SeasonTimelineEntry[] = calendar.scheduledEvents.map(
    (event: ScheduledCalendarEvent) => {
      const presentation = getRegularEventTimelinePresentation(event.eventDefinitionId);
      const title = presentation?.title ?? event.eventDefinitionId.replaceAll('_', ' ');
      return {
        kind: 'event',
        date: event.date,
        sourceId: event.id,
        eventId: event.eventDefinitionId,
        status: event.status,
        label:
          event.status === 'completed'
            ? (presentation?.resolved ?? title)
            : (presentation?.scheduled ?? title),
        ...(event.factId ? { factId: event.factId } : {}),
      };
    },
  );
  return [...fixtureEntries, ...eventEntries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      priority[a.kind] - priority[b.kind] ||
      a.sourceId.localeCompare(b.sourceId),
  );
};
