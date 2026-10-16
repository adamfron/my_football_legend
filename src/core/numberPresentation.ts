/** Presentation only: aggregate canonical precision before calling these helpers. */
const integer = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0, useGrouping: true });
export const formatCareerInteger = (value: number | undefined | null): string =>
  value == null || !Number.isFinite(value)
    ? '—'
    : integer.format(Math.round(value)).replace(/\u00a0|\u202f/g, ' ');
export const formatCareerRating = (value: number | undefined | null): string =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(1);
