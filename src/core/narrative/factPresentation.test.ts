import { describe, expect, it } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from '../playerCreator';
import { initializeAcademyArc } from '../events/academyArc';
import { getEventDefinition } from '../events/eventRegistry';
import { resolveEventChoice } from '../events/resolveEventChoice';
import { applyEventResolution, advanceActiveEvent } from '../events/applyEventResolution';
import { getFactPresentation } from './factPresentation';
import { buildFirstWeekSummary } from './weekSummary';
import { auditPlayerFacingText } from './playerFacingAudit';
const input: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Testowy',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  customSeed: '',
  position: 'winger',
  heightCm: 174,
  weightKg: 68,
  seed: 'audit',
};
const career = () =>
  initializeAcademyArc(
    createCareerState(generateStartingPlayerProfile(input, 'audit', 0), 'audit'),
  );
const choose = (c: ReturnType<typeof career>, id: string) =>
  applyEventResolution(
    c,
    resolveEventChoice(
      c,
      getEventDefinition(c.activeEvent!.definitionId).decisions.find((d) => d.id === id)!,
    ),
  );
describe('narrative presentation', () => {
  it('presents career_started and academy facts without snake case', () => {
    let c = career();
    expect(getFactPresentation(c, c.historyFacts[0]!).title).toBe('Początek kariery w akademii');
    c = choose(c, 'ask_team_needs');
    let fp = getFactPresentation(c, c.historyFacts.at(-1)!);
    expect(fp.summary).toContain('Marek Wrona');
    expect(fp.summary).not.toMatch(/[a-z]+_[a-z]/);
    c = advanceActiveEvent(c);
    c = choose(c, 'organize_team');
    fp = getFactPresentation(c, c.historyFacts.at(-1)!);
    expect(fp.title).toBe('Porządek zamiast popisu');
    expect(fp.summary).not.toMatch(/[a-z]+_[a-z]/);
  });
  it('builds deterministic first week summary', () => {
    let c = choose(career(), 'humble_learning');
    c = advanceActiveEvent(c);
    c = choose(c, 'play_rival');
    c = advanceActiveEvent(c);
    if (c.activeEvent) c = choose(c, 'share_credit');
    expect(buildFirstWeekSummary(c)).toEqual(buildFirstWeekSummary(c));
    expect(buildFirstWeekSummary(c).join('\n')).toContain('Polskiej Lidze U-17');
  });
  it('audits player-facing text', () => expect(auditPlayerFacingText()).toEqual([]));
});
