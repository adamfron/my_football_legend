import type { FootballerProfile, Person } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const parts = (value: string) => {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    throw new Error(`Invalid ISO date: ${value}`);
  return { year, month, day };
};

/** Calendar-only age. A 29 February birthday turns a year older on 1 March in non-leap years. */
export const getAgeOnDate = (dateOfBirth: string, date: string): number => {
  const birth = parts(dateOfBirth);
  const current = parts(date);
  if (date < dateOfBirth) throw new Error('Age cannot be calculated before birth.');
  const birthdayOccurred =
    current.month > birth.month || (current.month === birth.month && current.day >= birth.day);
  return current.year - birth.year - (birthdayOccurred ? 0 : 1);
};

/** Deterministically supplies a canonical birthday for a legacy integer age. */
export const deriveDateOfBirth = (
  age: number,
  referenceDate: string,
  stableSeed: string,
): string => {
  const reference = parts(referenceDate);
  const rng = RandomGenerator.fromSeed(`date-of-birth:${stableSeed}`);
  const month = rng.int(1, 12);
  const maxDay = new Date(Date.UTC(2000, month, 0)).getUTCDate();
  const day = rng.int(1, maxDay);
  const occurred = month < reference.month || (month === reference.month && day <= reference.day);
  const year = reference.year - age - (occurred ? 0 : 1);
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
};

export const getProfileAge = (
  profile: Pick<FootballerProfile, 'id' | 'age' | 'dateOfBirth'>,
  date: string,
  legacyReferenceDate = date,
) =>
  getAgeOnDate(
    profile.dateOfBirth ?? deriveDateOfBirth(profile.age, legacyReferenceDate, profile.id),
    date,
  );

export const withCanonicalBirthDate = <T extends Pick<Person, 'id' | 'age' | 'dateOfBirth'>>(
  person: T,
  referenceDate: string,
): T & { dateOfBirth: string } => ({
  ...person,
  dateOfBirth: person.dateOfBirth ?? deriveDateOfBirth(person.age, referenceDate, person.id),
});
