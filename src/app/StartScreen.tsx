import type { ReactNode } from 'react';

export const StartScreen = ({
  canContinue,
  notice,
  onDismissNotice,
  onNewCareer,
  onContinue,
  developerAction,
  status,
}: {
  canContinue: boolean;
  notice?: string | undefined;
  onDismissNotice: () => void;
  onNewCareer: () => void;
  onContinue: () => void;
  developerAction?: ReactNode | undefined;
  status?: string | undefined;
}) => (
  <main className="start-screen">
    <header className="start-titlebar">
      <strong>MY FOOTBALL LEGEND</strong>
      <span>Narracyjna kariera piłkarska</span>
    </header>
    <section className="start-panel">
      <header>MENU GŁÓWNE</header>
      {notice && (
        <aside className="start-notice">
          <p>{notice}</p>
          <button onClick={onDismissNotice}>Rozumiem</button>
        </aside>
      )}
      {status && (
        <p className="career-error" role="alert">
          {status}
        </p>
      )}
      <nav className="start-actions">
        <button onClick={onNewCareer}>Nowa kariera</button>
        <button disabled={!canContinue} onClick={onContinue}>
          Kontynuuj
        </button>
        <a href="https://github.com/adamfron/my_football_legend">O projekcie</a>
        {developerAction}
      </nav>
    </section>
  </main>
);
