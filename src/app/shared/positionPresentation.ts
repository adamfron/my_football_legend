import type { PlayerPosition } from '../../types/domain';
import { translate } from '../../core/narrative/localization';

export const positionLabel = (position: PlayerPosition) => translate(`position.${position}`);

export const positionCode = (position: PlayerPosition) => positionLabel(position).split(' — ')[0]!;
