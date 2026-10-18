import { createPr171Fixture, type PR171_COHORT } from './pr171Fixtures';
import { createPr167Career, pr167World } from './pr167Fixtures';
import { createCareerMatchInput } from '../src/core/careerMatchContract';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { FORMATIONS, selectBestXI, type FormationId } from '../src/core/footballerWorld';
import { TACTICAL_PREFERENCE_DEFAULTS } from '../src/core/matchSimulation/tacticalPreferences';

/** Reserved before full-match validation. Four new seeds, different clubs/XIs, career player,
 * and formation/style pairings; reversed fixtures remain dependent mirrors. */
export const createPr174HeldOutFixture = (
  family: (typeof PR171_COHORT)[number],
  reversed: boolean,
) => {
  const seed = `pr174-independent-20261017:${family}`;
  const original = createPr171Fixture(family, false, 'held-out-174');
  const clubs =
    family === 'strong_weak'
      ? ['pro_5', 'pro_54']
      : family === 'press_low'
        ? ['pro_31', 'pro_40']
        : ['pro_24', 'pro_25'];
  const session =
    family === 'youth_native'
      ? structuredClone(
          createCareerMatchInput(
            createPr167Career(false, 'pr174-new-youth', 'right_back'),
            pr167World,
            seed,
            true,
          ).session,
        )
      : createSingleMatchSession(pr167World, {
          homeClubId: clubs[0]!,
          awayClubId: clubs[1]!,
          seed,
          control: { mode: 'spectator' },
        });
  session.setup.seed = seed;
  session.setup.control = { mode: 'spectator' };
  const formations: [FormationId, FormationId] =
    family === 'press_low' ? ['4-4-2', '3-5-2'] : ['3-4-2-1', '4-2-3-1'];
  if (family !== 'youth_native')
    for (const [index, side] of (['home', 'away'] as const).entries()) {
      const team = session[side],
        formation = formations[index]!;
      const selection = selectBestXI(
        { footballerWorld: pr167World.footballers },
        team.club,
        formation,
      );
      if (selection.assignments.length !== 11) throw new Error('Incomplete held-out XI');
      team.formation = formation;
      team.strength = selection.assignments.reduce((n, p) => n + p.effectiveOverall, 0) / 11;
      team.players = selection.assignments.map((p) => {
        const slot = FORMATIONS[formation][p.slotIndex]!;
        return {
          footballerId: p.footballerId,
          profile: structuredClone(pr167World.footballers[p.footballerId]!.profile),
          condition: 100,
          slotIndex: p.slotIndex,
          slot,
          x: (1 - slot.y / 100) * 105,
          y: (slot.x / 100) * 68,
        };
      });
      const starters = new Set(team.players.map((p) => p.footballerId));
      team.bench = team.bench?.filter((p) => !starters.has(p.footballerId)) ?? [];
    }
  if (reversed) [session.home, session.away] = [session.away, session.home];
  session.setup.homeClubId = session.home.club.id;
  session.setup.awayClubId = session.away.club.id;
  const state = createTacticalMatch(session);
  state.playerAgencyEnabled = false;
  const styles =
    family === 'press_low'
      ? (['pressing', 'counter_attacking'] as const)
      : (['direct', 'possession'] as const);
  for (const [index, side] of (['home', 'away'] as const).entries()) {
    const style = styles[reversed ? 1 - index : index]!;
    state.teams[side].style = style;
    state.teams[side].tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS[style] };
  }
  return { ...original, session, state, seed, reversed };
};
