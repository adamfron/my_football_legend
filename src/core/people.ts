import type { CareerState, Person } from '../types/domain';

/** Stable identity upsert: id wins, with a conservative legacy name/role fallback. */
export const upsertPerson = (career: CareerState, person: Person): CareerState => {
  const index = career.significantPeople.findIndex(existing => existing.id === person.id ||
    (existing.firstName === person.firstName && existing.lastName === person.lastName && existing.role === person.role));
  const people = [...career.significantPeople];
  if (index < 0) people.push(person); else people[index] = { ...people[index]!, ...person, id: people[index]!.id };
  const id = index < 0 ? person.id : people[index]!.id;
  return { ...career, significantPeople: people, relationships: {
    ...career.relationships, [id]: career.relationships[id] ?? person.relationshipParameters,
  }};
};

export const dedupePeople = (people: Person[]): Person[] => {
  const seen = new Set<string>();
  return people.filter(person => { const key = `${person.id}|${person.firstName}|${person.lastName}|${person.role}`; if (seen.has(key)) return false; seen.add(key); return true; });
};
