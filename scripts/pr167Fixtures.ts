import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { advanceCareerFlow } from '../src/core/careerFlow';
import { acceptProfessionalOffer } from '../src/core/careerSeasons';
import { advanceCareerWeek, getCurrentFixture } from '../src/core/careerWeeks';
import { startFixtureMatch } from '../src/core/matchEngine';
import type { PlayerPosition } from '../src/types/domain';

export const pr167World = createCanonicalWorldDatabase();
export const createPr167Career = (
  professional = false,
  seed = 'pr167-career',
  position: PlayerPosition = 'left_winger',
) => {
  let career = createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Testowy',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position,
        heightCm: 178,
        weightKg: 70,
        seed,
      },
      seed,
      0,
    ),
    seed,
    pr167World,
  );
  career = advanceCareerFlow(
    professional
      ? {
          ...career,
          seasonOutcome: { finalPosition: 6, champion: false, competitionType: 'academy' },
        }
      : career,
  );
  if (professional) {
    const offer = career.professionalOffers?.[0];
    if (!offer) throw new Error('Professional offer required');
    career = acceptProfessionalOffer(career, offer.id);
    for (let i = 0; i < 50 && !getCurrentFixture(career); i++) career = advanceCareerWeek(career);
  }
  if (!career.activeMatch) career = startFixtureMatch(career, getCurrentFixture(career)!);
  return career;
};
