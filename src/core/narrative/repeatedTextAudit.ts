export interface RepeatedTextFinding {
  text: string;
  count: number;
  localizationKeys: string[];
}
const ignored = new Set([
  'dalej',
  'wybierz',
  'możesz zyskać',
  'ryzykujesz',
  'rezultat',
  'gra',
  'zawodnik',
  'klub',
  'relacje',
  'historia',
]);
const normalize = (text: string) =>
  text
    .toLocaleLowerCase('pl')
    .replace(/[.,!?;:„”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export const auditRepeatedPlayerFacingText = (
  localizations: Record<string, string>,
  minimum = 3,
): RepeatedTextFinding[] => {
  const groups = new Map<string, { text: string; keys: string[] }>();
  for (const [key, text] of Object.entries(localizations)) {
    const normalized = normalize(text);
    if (normalized.length < 24 || ignored.has(normalized)) continue;
    const group = groups.get(normalized) ?? { text, keys: [] };
    group.keys.push(key);
    groups.set(normalized, group);
  }
  return [...groups.values()]
    .filter((g) => g.keys.length >= minimum)
    .map((g) => ({ text: g.text, count: g.keys.length, localizationKeys: g.keys }))
    .sort((a, b) => b.count - a.count);
};
