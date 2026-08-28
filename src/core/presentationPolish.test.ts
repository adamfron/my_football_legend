import { describe, expect, it } from 'vitest';
import { getParticipationStatusLabel } from './participationPresentation';
import { getRegularEventTimelinePresentation } from './events/regularSeasonEvents';

describe('career presentation semantics', () => {
  it.each([
    ['injured', 'kontuzja'],
    ['suspended', 'zawieszony'],
    ['unused_bench', 'niewykorzystany rezerwowy'],
    ['not_selected', 'poza kadrą'],
  ] as const)('presents %s participation canonically', (status, label) => {
    expect(getParticipationStatusLabel(status)).toBe(label);
  });

  it('uses event-specific scheduled and resolved labels', () => {
    expect(getRegularEventTimelinePresentation('dietitian_contact')).toEqual({
      title: 'Kontakt od dietetyka',
      scheduled: 'Kontakt od dietetyka',
      resolved: 'Kontakt od dietetyka',
    });
  });
});
