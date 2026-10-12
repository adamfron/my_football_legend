import { createVisualIdentity, deriveAppearance } from '../../core/visualIdentity';
const young = {
  id: 'gallery-main',
  dateOfBirth: '2010-04-14',
  heightCm: 180,
  weightKg: 75,
  visualIdentity: createVisualIdentity('gallery-main', undefined, {
    hairstyle: 'side_part',
    hairColor: 0.35,
    facialHair: 'none',
  }),
};
export const visualGalleryEntries = () => [
  {
    title: 'Debiut · 16 lat',
    note: 'Ta sama twarz: gallery-main',
    appearance: deriveAppearance(young, '2026-07-01'),
  },
  {
    title: 'Profesjonalista · 26 lat',
    note: 'Ta sama twarz, ta sama fryzura',
    appearance: deriveAppearance(young, '2036-07-01'),
  },
  {
    title: 'Dojrzały zawodnik · 39 lat',
    note: 'Stopniowa ewolucja rysów',
    appearance: deriveAppearance(young, '2049-07-01'),
  },
  {
    title: 'Weteran · 63 lata',
    note: 'Siwienie i subtelne linie',
    appearance: deriveAppearance(young, '2073-07-01'),
  },
  {
    title: 'Nowa fryzura',
    note: 'gallery-main · 26 lat · bez zmiany rysów',
    appearance: deriveAppearance(young, '2036-07-01', { hairstyle: 'curly' }),
  },
  {
    title: 'NPC · niezależna tożsamość A',
    note: 'gallery-npc-a · 27 lat',
    appearance: deriveAppearance({ id: 'gallery-npc-a', dateOfBirth: '1999-02-01' }, '2026-07-01'),
  },
  {
    title: 'NPC · niezależna tożsamość B',
    note: 'gallery-npc-b · 31 lat',
    appearance: deriveAppearance({ id: 'gallery-npc-b', dateOfBirth: '1995-06-01' }, '2026-07-01'),
  },
  {
    title: 'Drobniejsza sylwetka',
    note: 'gallery-main · 163 cm / 57 kg',
    appearance: deriveAppearance({ ...young, heightCm: 163, weightKg: 57 }, '2036-07-01'),
  },
  {
    title: 'Większa sylwetka',
    note: 'gallery-main · 197 cm / 94 kg',
    appearance: deriveAppearance({ ...young, heightCm: 197, weightKg: 94 }, '2036-07-01'),
  },
  {
    title: 'Prezentacja męska',
    note: 'Ten sam szkielet i wymiary',
    appearance: deriveAppearance(young, '2036-07-01', {
      presentation: 'masculine',
      facialHair: 'beard',
    }),
  },
  {
    title: 'Prezentacja kobieca',
    note: 'Ten sam szkielet i wymiary',
    appearance: deriveAppearance(young, '2036-07-01', {
      presentation: 'feminine',
      hairstyle: 'long',
    }),
  },
  {
    title: 'Prezentacja neutralna',
    note: 'Te same rysy · opaska',
    appearance: deriveAppearance(young, '2036-07-01', {
      presentation: 'neutral',
      hairstyle: 'cropped',
      accessories: 'headband',
    }),
  },
];
