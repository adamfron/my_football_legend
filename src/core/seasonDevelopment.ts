import type { PlayerAttributes } from '../types/domain';

export const aggregateDevelopment = (start: PlayerAttributes, end: PlayerAttributes) =>
  (Object.keys(start) as (keyof PlayerAttributes)[]).flatMap((attribute) => {
    const delta = end[attribute] - start[attribute];
    return delta === 0
      ? []
      : [{ attribute, before: start[attribute], after: end[attribute], delta }];
  });
