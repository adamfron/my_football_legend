import type { CareerState, PlayerPosition, SeasonParticipationRecord } from '../types/domain';
import { getProfileAge } from './age';
import { getPositionRelationship, POSITION_MASTERY_THRESHOLD } from './positionCompatibility';

export { POSITION_MASTERY_THRESHOLD };

/** Progress from one real appearance. Listed-but-unused players never learn a position. */
export const getPositionLearningGain = (
  career: Pick<CareerState, 'player' | 'currentDate'>,
  record: Pick<SeasonParticipationRecord, 'assignedPosition' | 'minutes'>,
  cooperationBonus = false,
): number => {
  const position = record.assignedPosition;
  if (!position || record.minutes <= 0) return 0;
  if (getPositionRelationship(career.player, position) !== 'adjacent') return 0;
  const age = getProfileAge(career.player, career.currentDate ?? '2026-07-01');
  const ageFactor = age <= 20 ? 1.2 : age <= 25 ? 1 : age <= 30 ? 0.8 : 0.6;
  const professionalism = 0.75 + career.player.attributes.professionalism / 200;
  const adaptability = 0.75 + career.player.hiddenProfile.adaptability / 200;
  return (
    (record.minutes / 9_000) *
    ageFactor *
    professionalism *
    adaptability *
    (cooperationBonus ? 1.5 : 1)
  );
};

export const applyPositionLearning = (
  career: CareerState,
  record: SeasonParticipationRecord,
  cooperationBonus = false,
): CareerState => {
  const position = record.assignedPosition;
  if (!position) return career;
  const gain = getPositionLearningGain(career, record, cooperationBonus);
  if (!gain) return career;
  const current = career.player.positionFamiliarity[position] ?? 0;
  return {
    ...career,
    player: {
      ...career.player,
      positionFamiliarity: {
        ...career.player.positionFamiliarity,
        [position]: Math.min(1, Number((current + gain).toFixed(4))),
      },
    },
  };
};

export const hasSustainedNewPositionUse = (
  records: readonly SeasonParticipationRecord[],
  position: PlayerPosition,
) => {
  const used = records.filter((row) => row.assignedPosition === position && row.minutes > 0);
  return (
    used.length >= 5 &&
    used.filter((row) => row.started).length >= 3 &&
    used.reduce((sum, row) => sum + row.minutes, 0) >= 360
  );
};
