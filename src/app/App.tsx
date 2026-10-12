import { lazy, Suspense, useEffect, useState } from 'react';
import { StartScreen } from './StartScreen';
import { careerStorage } from '../persistence/careerStorage';
import {
  buildMatchLabUrl,
  isMatchSandboxEnabled,
  isDevToolsEnabled,
  navigateApp,
} from './devTools';
import './App.css';

const CareerScreen = lazy(() =>
  import('./CareerApp').then((module) => ({ default: module.CareerScreen })),
);
const TacticalMatchSandbox = lazy(() =>
  import('./match/TacticalMatchSandbox').then((module) => ({
    default: module.TacticalMatchSandbox,
  })),
);
const VisualGallery = lazy(() =>
  import('./appearance/VisualGallery').then((module) => ({ default: module.VisualGallery })),
);
const isVisualGalleryEnabled = () =>
  isDevToolsEnabled() &&
  new URLSearchParams(globalThis.location?.search ?? '').get('visualGallery') === '1';

export const App = () => {
  const [lab, setLab] = useState(isMatchSandboxEnabled);
  const [gallery, setGallery] = useState(isVisualGalleryEnabled);
  const [careerAction, setCareerAction] = useState<'new' | 'resume'>();
  const [careerVisible, setCareerVisible] = useState(false);
  const [careerInstance, setCareerInstance] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [status, setStatus] = useState<string | undefined>('Sprawdzanie zapisu kariery…');
  const [notice, setNotice] = useState<string | undefined>(
    'Kariera jest zapisywana w pamięci tej przeglądarki.',
  );
  useEffect(() => {
    let active = true;
    const route = () => {
      setLab(isMatchSandboxEnabled());
      setGallery(isVisualGalleryEnabled());
      setCareerVisible(false);
      void careerStorage
        .exists()
        .then(setCanContinue)
        .catch(() => setStatus('Nie można odczytać zapisu kariery.'));
    };
    globalThis.addEventListener('popstate', route);
    void careerStorage
      .load()
      .then((result) => {
        if (!active) return;
        setCanContinue(result.ok);
        setStatus(
          !result.ok && result.reason !== 'missing'
            ? 'Nie można odczytać zapisu kariery.'
            : undefined,
        );
      })
      .catch(() => {
        if (active) setStatus('Nie można odczytać pamięci przeglądarki.');
      });
    return () => {
      active = false;
      globalThis.removeEventListener('popstate', route);
    };
  }, []);
  return (
    <Suspense
      fallback={
        <main className="shell">
          <p role="status">Wczytywanie…</p>
        </main>
      }
    >
      {gallery && <VisualGallery />}
      {lab && !gallery && <TacticalMatchSandbox />}
      {careerAction && (
        <div hidden={gallery || lab || !careerVisible}>
          <CareerScreen key={careerInstance} initialAction={careerAction} />
        </div>
      )}
      {!gallery && !lab && !careerVisible && (
        <StartScreen
          canContinue={canContinue}
          status={status}
          notice={notice}
          onDismissNotice={() => setNotice(undefined)}
          onNewCareer={() => {
            setCareerInstance((i) => i + 1);
            setCareerAction('new');
            setCareerVisible(true);
          }}
          onContinue={() => {
            if (!careerAction) setCareerAction('resume');
            setCareerVisible(true);
          }}
          onOpenMatchLab={() => navigateApp(buildMatchLabUrl(globalThis.location.href))}
        />
      )}
    </Suspense>
  );
};
