import { describe, expect, it } from 'vitest';
import academy from '../../content/localization/pl/events.academy.json';
import { academyEventDefinitions } from './eventRegistry';
describe('academy localization',()=>{ it('contains all event keys',()=>{ const dict=academy as Record<string,string>; for (const e of academyEventDefinitions) { expect(dict[e.localizationKeys.title]).toBeTruthy(); expect(dict[e.localizationKeys.summary]).toBeTruthy(); for (const k of e.playerInformationKeys) expect(dict[k]).toBeTruthy(); for (const d of e.decisions) { expect(dict[d.labelKey]).toBeTruthy(); expect(dict[d.descriptionKey]).toBeTruthy(); d.visiblePros.concat(d.visibleCons).forEach(k=>expect(dict[k]).toBeTruthy()); } } }); });
