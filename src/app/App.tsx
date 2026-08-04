import { useMemo, useState } from 'react';
import { previewRandomSequence } from '../devtools/randomPreview';
import { validateSampleContent } from '../schemas/validateContent';
import { translate } from '../core/narrative/localization';
import './App.css';

const tabs = [
  ['game', 'nav.game', 'Techniczne miejsce na przyszłą pętlę decyzji i konsekwencji.'],
  ['player', 'nav.player', 'Planowany moduł tożsamości, atrybutów, ról i kondycji zawodnika.'],
  ['club', 'nav.club', 'Przyszły widok aktualnego klubu, jego DNA i sytuacji sezonowej.'],
  ['relationships', 'nav.relationships', 'Miejsce na trwałe relacje ze znaczącymi postaciami.'],
  ['history', 'nav.history', 'Przyszły dziennik faktów, wątków i interpretacji kariery.'],
  ['devtools', 'nav.devtools', 'Kontrolny panel deterministyczności i walidacji treści.'],
] as const;

export const App = () => {
  const [active, setActive] = useState<(typeof tabs)[number][0]>('game');
  const [run, setRun] = useState(0);
  const seed = 'mfl-sample-career-2026';
  const randomPreview = useMemo(() => previewRandomSequence(`${seed}:${run}`), [run]);
  const validation = useMemo(() => validateSampleContent(), []);
  const activeTab = tabs.find(([id]) => id === active) ?? tabs[0];

  return <main className="shell"><header className="hero"><p>Fundament projektu</p><h1>{translate('app.title')}</h1><span>Narracyjny symulator kariery piłkarza działający w przeglądarce.</span></header><nav className="tabs">{tabs.map(([id, label]) => <button className={active === id ? 'active' : ''} key={id} onClick={() => setActive(id)}>{translate(label)}</button>)}</nav><section className="panel"><h2>{translate(activeTab[1])}</h2><p>{activeTab[2]}</p>{active === 'devtools' && <div className="devgrid"><div><strong>Seed</strong><code>{seed}:{run}</code></div><div><strong>Losowania</strong><pre>{JSON.stringify(randomPreview, null, 2)}</pre></div><div><strong>Walidacja treści</strong><p>OK: {validation.events.length} wydarzenie, {validation.clubs.length} klub, {validation.people.length} postać.</p></div><button onClick={() => setRun((value) => value + 1)}>Uruchom ponownie sekwencję</button></div>}</section></main>;
};
