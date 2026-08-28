# My Football Legend

Narracyjny, deterministyczny symulator całej kariery jednego piłkarza. **Rutynowy futbol jest symulowany, a znaczący futbol rozgrywany.** Świat piłkarski tworzy kanoniczne wyniki, występy i decyzje; narracja interpretuje zapisane fakty.

## Aktualny stan

Aplikacja działa lokalnie w przeglądarce, bez backendu, kont i zewnętrznych API. Po kreatorze zawodnik rozpoczyna pierwszy sezon młodzieżowy bez fabularnego prologu. Ten sam kalendarz tygodniowy obsługuje kolejne sezony, mecze, rozwój, dostępność, tabele ligowe i punkty decyzyjne. Po sezonie młodzieżowym generyczny cykl kariery obsługuje oferty profesjonalne, kontrakty i następne sezony aż do emerytury.

Stan historii składa się z faktów, relacji i wątków. Generyczne definicje oraz instancje wydarzeń pozostają rozszerzalną infrastrukturą, niezależną od Reacta. `ProfessionalClub.strengthRating` jest trwałym źródłem jakości pierwszego zespołu.

Zapisy prototypowe nie są kompatybilne: aktualna wersja zapisu celowo odrzuca starszą architekturę zamiast ją migrować.

## Uruchomienie

Wymagane są Node.js 20+ i npm.

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
