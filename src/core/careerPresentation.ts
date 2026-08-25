import type { CareerState, ClubArchetype, Person, SquadRole } from '../types/domain';
import { seasonLabelForYear } from './seasonProgress';

export const getCurrentHeadCoach = (career: CareerState): Person | undefined =>
  career.significantPeople.find(
    (person) => person.role === 'coach' && person.clubId === career.currentClub.id,
  );

export const getCareerHeader = (career: CareerState) =>
  `SEZON ${career.careerSeasonNumber} — ${seasonLabelForYear(career.currentSeason)}${career.careerSeasonNumber === 2 ? ' · PIERWSZY SEZON ZAWODOWY' : ''}`;

export const getCareerSubtitle = (career: CareerState) => {
  if (career.careerSeasonNumber === 1)
    return 'Rozwijasz się w akademii Vistula Nova i walczysz o pierwszą zawodową szansę.';
  if (career.careerSeasonNumber === 2)
    return `Rozpoczynasz pierwszy zawodowy sezon w ${career.currentClub.name}.`;
  return `Kontynuujesz zawodową karierę w ${career.currentClub.name}.`;
};

export const squadRoleLabel = (role: SquadRole) =>
  ({
    development_player: 'Zawodnik rozwojowy',
    rotation: 'Zawodnik rotacji',
    first_team_competition: 'Walczy o pierwszy skład',
    important_player: 'Ważny zawodnik zespołu',
  })[role];

export const clubArchetypeLabel = (archetype: ClubArchetype) =>
  ({
    YOUTH_TRADER: 'Klub rozwijający młodzież',
    RESULTS_FIRST: 'Klub nastawiony na wynik',
    LOCAL_DEVELOPMENT: 'Lokalny rozwój',
    TECHNICAL_ACADEMY: 'Akademia techniczna',
    UNDERDOG: 'Ambitny outsider',
    AMBITIOUS_CLIMBER: 'Ambitny klub na dorobku',
  })[archetype];
