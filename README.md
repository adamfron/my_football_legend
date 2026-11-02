# My Football Legend

Narracyjny, deterministyczny symulator całej kariery jednego piłkarza. **Rutynowy futbol jest symulowany, a znaczący futbol rozgrywany.** Świat piłkarski tworzy kanoniczne wyniki, występy i decyzje; narracja interpretuje zapisane fakty.

## Aktualny stan

Aplikacja działa lokalnie w przeglądarce, bez backendu, kont i zewnętrznych API. Po kreatorze zawodnik rozpoczyna pierwszy sezon młodzieżowy bez fabularnego prologu. Ten sam kalendarz tygodniowy obsługuje kolejne sezony, mecze, rozwój, dostępność, tabele ligowe i punkty decyzyjne. Po sezonie młodzieżowym generyczny cykl kariery obsługuje oferty profesjonalne, kontrakty i następne sezony aż do emerytury.

Stan historii składa się z faktów, relacji i wątków. Generyczne definicje oraz instancje wydarzeń pozostają rozszerzalną infrastrukturą, niezależną od Reacta. `ProfessionalClub.strengthRating` jest trwałym źródłem jakości pierwszego zespołu.

Zapisy prototypowe nie są kompatybilne: aktualna wersja zapisu celowo odrzuca starszą architekturę zamiast ją migrować.

## Uruchomienie

### Jak uruchomić pojedynczy mecz z eksperymentalną fizyką

Użyj Node.js 24 i npm. W katalogu projektu wykonaj:

```bash
npm ci
npm run dev
```

Otwórz adres wypisany przez Vite. W menu wybierz **Pojedynczy mecz [DEV]**,
następnie gospodarzy, gości i seed. W polu **Fizyka meczu** wybierz
**Holistyczna (eksperymentalna)**. Domyślną opcją pozostaje **Dotychczasowa**;
wybór eksperymentu dotyczy tej sesji i nie zmienia kariery.

Wybierz **Obserwuj mecz** albo **Steruj piłkarzem**, drużynę, piłkarza i ewentualnie
**Wymuś w XI**. Polityka B to **state-value-v1** w polu **Polityka decyzji**.
Kliknij **Rozpocznij mecz**, a potem **Odtwórz**. **Pauza** zatrzymuje odtwarzanie;
**Restart — ten sam seed** przywraca wybrane składy, fizykę i seed. **Losuj seed**
rozpoczyna nową sesję z tą samą fizyką. Zmiana fizyki przez **Zmień ustawienia**
wymaga rozpoczęcia nowego meczu. HUD pokazuje konfigurację rzeczywiście wykonywaną.

**PR215 udostępnia tryb ograniczony, nie zatwierdzony pełny mecz holistyczny.**
Wspólna obsługa kontaktów obejmuje przygotowane niskie podania, stojące interwencje
i niską wolną piłkę poza strefą bramkarza. Prowadzenie i pozostałe rodziny akcji
zachowują jawne dotychczasowe ścieżki. Po wykryciu nierozstrzygniętego kontaktu
interfejs wstrzymuje mecz i pokazuje jego przyczynę. Dotyczy to m.in. kontynuacji
prowadzenia w reszcie kroku po przyjęciu wolnej piłki. Pełne 90 minut tego wariantu
nie zostało zatwierdzone; do zwykłego meczu wybierz **Dotychczasowa**.

Przy błędzie rozwiń **DEV · Diagnostyka, scenariusze i zapis meczu** i kliknij
**Eksportuj benchmark sesji**. Raport zawiera seed, tożsamość sesji, wybraną
i skuteczną recepturę oraz liczniki wykonania i nierozstrzygnięć. Zachowaj plik
i opisz ostatnią wykonaną czynność. Dotychczasowy zapis zdarzenia, powtórki
i pełna diagnostyka DEV pozostają dostępne. [Zakres, dowody i blokady PR215](docs/PR215_PLAYABLE_HOLISTIC_MATCH_INTEGRATION.md).

Wymagane są Node.js 24 i npm.

```bash
npm install
npm run dev
```

## Kontrola jakości

- `npm run lint` — ESLint;
- `npm run test` — Vitest;
- `npm run build` — TypeScript i build Vite;
- `npm run verify` — pełny zestaw powyższych kontroli.

## Struktura

- `src/core` — deterministyczna logika domenowa niezależna od Reacta;
- `src/types` i `src/schemas` — typy oraz walidacja Zod;
- `src/content` — deklaratywna treść i polska lokalizacja;
- `src/app` i `src/components` — interfejs;
- `docs` — opis architektury i kierunku rozwoju.
