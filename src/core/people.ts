import type { CareerState, Person } from '../types/domain';

/** Stable identity upsert: id wins, with a conservative legacy name/role fallback. */
export const upsertPerson = (career: CareerState, person: Person): CareerState => {
  const index = career.significantPeople.findIndex(
    (existing) =>
      existing.id === person.id ||
      (existing.firstName === person.firstName && existing.lastName === person.lastName),
  );
  const people = [...career.significantPeople];
  if (index < 0) people.push(person);
  else people[index] = { ...people[index]!, ...person, id: people[index]!.id };
  const id = index < 0 ? person.id : people[index]!.id;
  return {
    ...career,
    significantPeople: people,
    relationships: {
      ...career.relationships,
      [id]: career.relationships[id] ?? person.relationshipParameters,
    },
  };
};

export const dedupePeople = (people: Person[]): Person[] => {
  const seen = new Set<string>();
  const identities = new Set<string>();
  return people.filter((person) => {
    const identity = `${person.firstName.trim().toLocaleLowerCase()}|${person.lastName.trim().toLocaleLowerCase()}`;
    if (seen.has(person.id) || identities.has(identity)) return false;
    seen.add(person.id);
    identities.add(identity);
    return true;
  });
};
