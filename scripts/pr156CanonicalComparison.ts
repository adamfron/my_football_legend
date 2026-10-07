/** Exact recursive comparison of JSON-shaped canonical football data, with no field filter.
 * Shared references are equal; separate objects must compare all of their properties. */
export const findCanonicalDifference = (a: unknown, b: unknown, path = ''): string | null => {
  if (a === b) return null;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${path}.length`;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const result = findCanonicalDifference(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
    if (result !== null) return result;
  }
  return null;
};
