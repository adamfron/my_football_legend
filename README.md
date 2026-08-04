# My Football Legend

Narracyjny symulator kariery piłkarza działający w przeglądarce.

## Status
Fundament techniczny: React, TypeScript strict, Vite, Vitest, ESLint, Prettier, Zod, deterministyczny RNG i przykładowa walidowana treść. Pełna rozgrywka nie jest jeszcze implementowana.

## Wymagania
Node.js 20+ i npm.

## Instalacja
```bash
npm install
```

## Komendy developerskie
- `npm run dev` — lokalny serwer Vite.
- `npm run lint` — ESLint.
- `npm run test` — testy Vitest.
- `npm run build` — produkcyjny build.
- `npm run format:check` — kontrola formatowania.

## Struktura repozytorium
- `src/app` i `src/components` — powłoka interfejsu.
- `src/core` — logika gry niezależna od Reacta.
- `src/content` — deklaratywne dane treści i lokalizacja.
- `src/schemas` — schematy Zod.
- `src/persistence` — przyszły zapis lokalny.
- `src/devtools` — narzędzia techniczne.
- `docs` — architektura, model narracji, poradnik treści i roadmapa.

## Lokalizacja i fleksja
Domyślnym językiem jest polski. Obecny system obsługuje klucze i proste parametry. Polska fleksja, odmiana nazwisk, płci i liczebników jest świadomie odłożona do osobnego modułu, aby gotowe teksty nie stały się źródłem prawdy o historii.
