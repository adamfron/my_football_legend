import { z } from 'zod';

export const identityHistorySchema = z.array(z.string());
// Canonical histories are immutable arrays. A shared index remembers candidate positions from
// append-only branches; the array itself remains the authority for membership. In particular an
// ID appended at a different position in a sibling can never poison an older snapshot's lookup.
const indexes = new WeakMap<readonly string[], Map<string, number[]>>();
const indexFor = (ids: readonly string[]) => {
  let index = indexes.get(ids);
  if (!index) {
    index = new Map<string, number[]>();
    let position = 0;
    for (const id of ids) {
      const positions = index!.get(id);
      if (positions) positions.push(position);
      else index!.set(id, [position]);
      position++;
    }
    indexes.set(ids, index);
  }
  return index;
};

export const containsIdentity = (ids: readonly string[], id: string) =>
  indexFor(ids).get(id)?.some((position) => position < ids.length && ids[position] === id) ?? false;

/** Preserve the exact serialized array and insertion order. Only derived, external lookup data is
 * reused. Building a complete new Set after every physical event made long histories quadratic. */
export const appendIdentityHistory = (ids: readonly string[], id: string): string[] => {
  const index = indexFor(ids), next = [...ids, id];
  const positions = index.get(id);
  if (!positions) index.set(id, [ids.length]);
  else if (!positions.includes(ids.length)) positions.push(ids.length);
  indexes.set(next, index);
  return next;
};
