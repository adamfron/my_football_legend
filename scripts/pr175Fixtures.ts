import { z } from 'zod';
import { createPr167Career, pr167World } from './pr167Fixtures';
import { createCareerMatchInput } from '../src/core/careerMatchContract';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { FORMATIONS, selectBestXI, selectMatchBench, type FormationId } from '../src/core/footballerWorld';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { TACTICAL_PREFERENCE_DEFAULTS } from '../src/core/matchSimulation/tacticalPreferences';

const style = z.enum(['balanced', 'possession', 'direct', 'pressing', 'counter_attacking']);
export const pr175DesignSchema = z.object({
  id: z.string(), split: z.enum(['development', 'validation']), seed: z.string(),
  youth: z.boolean(), clubs: z.tuple([z.string(), z.string()]),
  formations: z.tuple([z.string(), z.string()]), styles: z.tuple([style, style]),
  attributes: z.enum(['native', 'fast-v-slow', 'keeper-strong-v-weak', 'technical-v-physical']),
});
// Predeclared independent seeds/designs. No orientation mirrors or repeated-seed samples.
// Validation outcomes must remain unread until the final candidate is frozen.
export const PR175_DESIGNS = pr175DesignSchema.array().parse([
  ['dev-youth', true, ['academy_0', 'academy_1'], ['4-3-3', '4-4-2'], ['possession', 'pressing'], 'native'],
  ['dev-balanced', false, ['pro_14', 'pro_15'], ['4-3-3', '4-2-3-1'], ['balanced', 'balanced'], 'native'],
  ['dev-strength', false, ['pro_3', 'pro_57'], ['4-4-2', '3-5-2'], ['direct', 'counter_attacking'], 'native'],
  ['dev-central', false, ['pro_19', 'pro_22'], ['3-5-2', '4-3-3'], ['possession', 'pressing'], 'technical-v-physical'],
  ['dev-wide', false, ['pro_28', 'pro_29'], ['4-2-3-1', '4-4-2'], ['direct', 'possession'], 'fast-v-slow'],
  ['dev-keepers', false, ['pro_35', 'pro_36'], ['3-4-2-1', '4-2-3-1'], ['pressing', 'counter_attacking'], 'keeper-strong-v-weak'],
  ['val-youth', true, ['academy_0', 'academy_1'], ['4-2-3-1', '3-5-2'], ['direct', 'balanced'], 'native'],
  ['val-balanced', false, ['pro_17', 'pro_18'], ['4-4-2', '4-3-3'], ['balanced', 'balanced'], 'native'],
  ['val-strength', false, ['pro_7', 'pro_51'], ['4-2-3-1', '3-4-2-1'], ['possession', 'counter_attacking'], 'native'],
  ['val-central', false, ['pro_26', 'pro_27'], ['4-3-3', '3-5-2'], ['pressing', 'possession'], 'technical-v-physical'],
  ['val-wide', false, ['pro_42', 'pro_43'], ['4-4-2', '4-2-3-1'], ['direct', 'pressing'], 'fast-v-slow'],
  ['val-keepers', false, ['pro_46', 'pro_47'], ['3-5-2', '3-4-2-1'], ['counter_attacking', 'possession'], 'keeper-strong-v-weak'],
].map(([id, youth, clubs, formations, styles, attributes]) => ({
  id, split: String(id).startsWith('dev-') ? 'development' : 'validation',
  seed: `pr175-fresh-20261018:${id}:v1`, youth, clubs, formations, styles, attributes,
})));

export const createPr175Fixture = (id: string) => {
  const design = PR175_DESIGNS.find((d) => d.id === id);
  if (!design) throw new Error(`Unknown PR175 fixture ${id}`);
  const { seed } = design;
  const session = design.youth
    ? structuredClone(createCareerMatchInput(createPr167Career(false, seed,
        design.split === 'development' ? 'central_midfielder' : 'striker'), pr167World, seed, true).session)
    : createSingleMatchSession(pr167World, { homeClubId: design.clubs[0], awayClubId: design.clubs[1], seed, control: { mode: 'spectator' } });
  session.setup.seed = seed;
  session.setup.control = { mode: 'spectator' };
  for (const [index, side] of (['home', 'away'] as const).entries()) {
    const team = session[side], formation = design.formations[index] as FormationId;
    const world = { footballerWorld: pr167World.footballers };
    const selected = selectBestXI(world, team.club, formation);
    if (selected.assignments.length !== 11) throw new Error(`Incomplete XI ${id}:${side}`);
    team.formation = formation;
    team.strength = selected.assignments.reduce((n, p) => n + p.effectiveOverall, 0) / 11;
    team.players = selected.assignments.map((p) => {
      const slot = FORMATIONS[formation][p.slotIndex]!;
      return { footballerId: p.footballerId, profile: structuredClone(pr167World.footballers[p.footballerId]!.profile),
        condition: 100, slotIndex: p.slotIndex, slot, x: (1 - slot.y / 100) * 105, y: slot.x / 100 * 68 };
    });
    team.bench = selectMatchBench(world, team.club, selected.assignments, 7).map((p) => ({ footballerId: p.footballerId,
      profile: structuredClone(pr167World.footballers[p.footballerId]!.profile), condition: 100 }));
    for (const p of [...team.players, ...team.bench]) {
      const a = p.profile.attributes;
      if (design.attributes === 'fast-v-slow') a.pace = index === 0 ? 88 : 43;
      if (design.attributes === 'keeper-strong-v-weak')
        for (const key of ['reflexes', 'handling', 'oneOnOnes'] as const) a[key] = index === 0 ? 88 : 38;
      if (design.attributes === 'technical-v-physical')
        for (const key of ['passing', 'firstTouch', 'technique', 'gameReading'] as const) a[key] = index === 0 ? 84 : 48;
    }
  }
  const state = createTacticalMatch(session);
  state.playerAgencyEnabled = false;
  for (const [index, side] of (['home', 'away'] as const).entries()) {
    const s = design.styles[index]!;
    state.teams[side].style = s;
    state.teams[side].tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS[s] };
  }
  return { design, session, state, seed };
};
