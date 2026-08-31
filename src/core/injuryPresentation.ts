import type { CareerState, PlayerInjury, SeasonParticipationRecord } from '../types/domain';

const TYPE_LABELS: Record<PlayerInjury['injuryType'], string> = {
  bruise: 'Stłuczenie',
  strain: 'Naciągnięcie',
  sprain: 'Skręcenie',
  muscle_overload: 'Przeciążenie mięśniowe',
  joint_injury: 'Uraz stawu',
  concussion: 'Wstrząśnienie mózgu',
};
const AREA_LABELS: Record<string, string> = {
  thigh: 'uda',
  udo: 'uda',
  knee: 'kolana',
  kolano: 'kolana',
  ankle: 'kostki',
  kostka: 'kostki',
  calf: 'łydki',
  hamstring: 'mięśnia dwugłowego',
  foot: 'stopy',
  back: 'pleców',
  plecy: 'pleców',
  head: 'głowy',
};
const SOURCE_LABELS: Record<PlayerInjury['source'], string> = {
  match: 'podczas meczu',
  training: 'trening',
  overload: 'kumulacja obciążeń',
};

/** Concise localization of canonical injury metadata; no localized diagnosis is stored in state. */
export const presentInjury = (injury: PlayerInjury): string => {
  const area =
    injury.injuryType === 'concussion' || injury.injuryType === 'muscle_overload'
      ? ''
      : AREA_LABELS[injury.bodyArea ?? ''];
  return `${TYPE_LABELS[injury.injuryType]}${area ? ` ${area}` : ''} · ${SOURCE_LABELS[injury.source]}`;
};

/** Resolves only a dated or exact appearance link, never an unrelated current injury. */
export const getTimelineInjury = (
  career: Pick<CareerState, 'playerAvailability' | 'matchHistory'>,
  participation: SeasonParticipationRecord,
): PlayerInjury | undefined => {
  const injuries = career.playerAvailability?.injuries ?? [];
  if (participation.minutes > 0 && participation.appearanceMatchId) {
    const injuryId = career.matchHistory?.find(
      (appearance) => appearance.matchId === participation.appearanceMatchId,
    )?.injuryId;
    return injuryId ? injuries.find((injury) => injury.id === injuryId) : undefined;
  }
  if (participation.status !== 'injured') return undefined;
  return injuries.find(
    (injury) =>
      injury.startDate <= participation.date &&
      (injury.recoveryDate === undefined || participation.date <= injury.recoveryDate),
  );
};
