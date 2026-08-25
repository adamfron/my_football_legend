import { academyEventDefinitions } from '../events/eventRegistry';
import { translate } from './localization';
const forbidden = [
  /\[\[/,
  /\]\]/,
  /\b[a-z]+_[a-z0-9_]+\b/,
  /undefined/,
  /\[object Object\]/,
  /trudność ukryta/i,
  /test umiejętności/i,
  /resolver/i,
  /outcome/i,
];
export const auditPlayerFacingText = (): string[] => {
  const texts: string[] = [];
  for (const event of academyEventDefinitions) {
    texts.push(translate(event.localizationKeys.title), translate(event.localizationKeys.summary));
    event.playerInformationKeys.forEach((k) =>
      texts.push(
        translate(k, {
          rivalFirstName: 'Adam',
          rivalFullName: 'Adam Nowak',
          coachFullName: 'Marek Wrona',
          clubName: 'Vistula Nova',
        }),
      ),
    );
    event.decisions.forEach((d) => {
      texts.push(translate(d.labelKey), translate(d.descriptionKey));
      d.visiblePros.concat(d.visibleCons).forEach((k) => texts.push(translate(k)));
    });
  }
  return texts.flatMap((text) =>
    forbidden.filter((rx) => rx.test(text)).map((rx) => `${rx}: ${text}`),
  );
};

export interface RepeatedPlayerFacingText {
  text: string;
  count: number;
  localizationKeys: string[];
}
const normalizeFacingText = (value: string) =>
  value
    .toLocaleLowerCase('pl')
    .replace(/[.,!?;:„”"'–—-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export const auditRepeatedPlayerFacingText = (): RepeatedPlayerFacingText[] => {
  const modules = import.meta.glob('../../content/localization/pl/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, Record<string, string>>;
  const ignored = new Set(['dalej', 'wybierz', 'możesz zyskać', 'ryzykujesz', 'rezultat']);
  const occurrences = new Map<string, { text: string; keys: string[] }>();
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      const normalized = normalizeFacingText(value);
      if (normalized.length >= 24 && !ignored.has(normalized)) {
        const item = occurrences.get(normalized) ?? { text: value, keys: [] };
        item.keys.push(key);
        occurrences.set(normalized, item);
      }
    } else if (value && typeof value === 'object')
      Object.entries(value).forEach(([child, nested]) => walk(nested, `${key}.${child}`));
  };
  Object.entries(modules).forEach(([file, content]) => walk(content, file));
  return [...occurrences.values()]
    .filter((item) => item.keys.length >= 3)
    .map((item) => ({ text: item.text, count: item.keys.length, localizationKeys: item.keys }));
};
