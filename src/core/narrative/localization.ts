import common from '../../content/localization/pl/common.json';
import clubs from '../../content/localization/pl/clubs.json';
import matchEvents from '../../content/localization/pl/events.match.json';
import history from '../../content/localization/pl/history.json';
import academyEvents from '../../content/localization/pl/events.academy.json';
import relationships from '../../content/localization/pl/relationships.json';

type Locale = 'pl';
type Params = Record<string, string | number>;
export const missingLocalizationKeys = new Set<string>();
const fallbackText = 'Opis wydarzenia jest chwilowo niedostępny';
const dictionaries: Record<Locale, Record<string, string>> = { pl: { ...common, ...clubs, ...matchEvents, ...history, ...academyEvents, ...relationships } };

export const translate = (key: string, params: Params = {}, locale: Locale = 'pl'): string => {
  const template = dictionaries[locale][key];
  if (!template) {
    missingLocalizationKeys.add(key);
    if (import.meta.env.DEV) console.warn(`Brak klucza lokalizacji: ${key}`);
    return import.meta.env.DEV ? `⟦${key}⟧` : fallbackText;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
};
