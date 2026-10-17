import { createPr167Career, pr167World } from './pr167Fixtures';
import { createCareerMatchInput } from '../src/core/careerMatchContract';
import { createSingleMatchSession, type SingleMatchSession } from '../src/core/singleMatch';
import {
  FORMATIONS,
  selectBestXI,
  selectMatchBench,
  type FormationId,
} from '../src/core/footballerWorld';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { TACTICAL_PREFERENCE_DEFAULTS } from '../src/core/matchSimulation/tacticalPreferences';
import type { TacticalStyle } from '../src/core/matchSimulation/matchState';

export const PR171_COHORT = [
  'youth_native',
  'senior_balanced',
  'strong_weak',
  'central_possession',
  'wide_direct',
  'press_low',
] as const;
export const createPr171Fixture = (
  family: (typeof PR171_COHORT)[number],
  reversed: boolean,
  replicate?: string,
) => {
  const seed = replicate
    ? `pr171-${replicate}:${family}`
    : `pr171-${PR171_COHORT.indexOf(family) % 2 ? 'b' : 'a'}:${family}`;
  let session: SingleMatchSession;
  if (family === 'youth_native') {
    const career = createPr167Career(false, 'pr171-youth', 'central_midfielder');
    session = structuredClone(createCareerMatchInput(career, pr167World, seed, true).session);
    session.setup.seed = seed;
    session.setup.control = { mode: 'spectator' };
  } else {
    session = createSingleMatchSession(pr167World, {
      homeClubId: family === 'strong_weak' ? 'pro_0' : 'pro_9',
      awayClubId: family === 'strong_weak' ? 'pro_60' : 'pro_10',
      seed,
      control: { mode: 'spectator' },
    });
    const forms: Partial<Record<typeof family, [FormationId, FormationId]>> = {
      central_possession: ['3-5-2', '4-3-3'],
      wide_direct: ['4-2-3-1', '4-4-2'],
      press_low: ['3-4-2-1', '4-3-3'],
    };
    const formationPair = forms[family];
    if (formationPair)
      for (const [index, side] of (['home', 'away'] as const).entries()) {
        const team = session[side];
        const formation = formationPair[index]!;
        const selection = selectBestXI(
          { footballerWorld: pr167World.footballers },
          team.club,
          formation,
        );
        if (selection.assignments.length !== 11) throw new Error(`Incomplete XI ${family}`);
        team.formation = formation;
        team.strength = selection.assignments.reduce((n, p) => n + p.effectiveOverall, 0) / 11;
        team.players = selection.assignments.map((a) => {
          const slot = FORMATIONS[formation][a.slotIndex]!;
          const footballer = pr167World.footballers[a.footballerId]!;
          return {
            footballerId: a.footballerId,
            profile: structuredClone(footballer.profile),
            condition: footballer.fitness ?? 100,
            slotIndex: a.slotIndex,
            slot,
            x: (1 - slot.y / 100) * 105,
            y: (slot.x / 100) * 68,
          };
        });
        team.bench = selectMatchBench(
          { footballerWorld: pr167World.footballers },
          team.club,
          selection.assignments,
          7,
        ).map((a) => ({
          footballerId: a.footballerId,
          profile: structuredClone(pr167World.footballers[a.footballerId]!.profile),
          condition: 100,
        }));
      }
  }
  if (reversed) [session.home, session.away] = [session.away, session.home];
  session.setup.homeClubId = session.home.club.id;
  session.setup.awayClubId = session.away.club.id;
  const state = createTacticalMatch(session);
  state.playerAgencyEnabled = false;
  const stylePair: [TacticalStyle, TacticalStyle] | undefined =
    family === 'senior_balanced'
      ? ['balanced', 'balanced']
      : family === 'central_possession'
        ? ['possession', 'balanced']
        : family === 'wide_direct'
          ? ['direct', 'possession']
          : family === 'press_low'
            ? ['pressing', 'counter_attacking']
            : undefined;
  if (stylePair)
    for (const [index, side] of (['home', 'away'] as const).entries()) {
      const style = stylePair[reversed ? 1 - index : index]!;
      state.teams[side].style = style;
      state.teams[side].tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS[style] };
    }
  return { session, state, seed, family, reversed };
};
