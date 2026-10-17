import type { ProfessionalOffer } from '../types/domain';

export const MAX_EXTERNAL_OFFERS = 6;
/** Also normalizes old pending windows without repricing contracts or discarding renewals. */
export const limitProfessionalOffers = (offers: ProfessionalOffer[], currentClubId?: string) => {
  let externalCount = 0;
  return offers.filter(
    (offer) =>
      offer.offerType === 'renewal' ||
      (offer.club.id !== currentClubId && externalCount++ < MAX_EXTERNAL_OFFERS),
  );
};
