import { academyEventDefinitions } from '../events/eventRegistry';
import { translate } from './localization';
const forbidden = [/\[\[/, /\]\]/, /\b[a-z]+_[a-z0-9_]+\b/, /undefined/, /\[object Object\]/, /trudność ukryta/i, /test umiejętności/i, /resolver/i, /outcome/i];
export const auditPlayerFacingText = (): string[] => {
  const texts: string[] = [];
  for (const event of academyEventDefinitions) {
    texts.push(translate(event.localizationKeys.title), translate(event.localizationKeys.summary));
    event.playerInformationKeys.forEach((k) => texts.push(translate(k, { rivalFirstName: 'Adam', rivalFullName: 'Adam Nowak', coachFullName: 'Marek Wrona', clubName: 'Vistula Nova' })));
    event.decisions.forEach((d) => { texts.push(translate(d.labelKey), translate(d.descriptionKey)); d.visiblePros.concat(d.visibleCons).forEach((k) => texts.push(translate(k))); });
  }
  return texts.flatMap((text) => forbidden.filter((rx) => rx.test(text)).map((rx) => `${rx}: ${text}`));
};
