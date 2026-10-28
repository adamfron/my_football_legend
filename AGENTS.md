# Instrukcje dla Codexa

- Gra jest narracyjna, nie menedżerska.
- Podstawowa wersja nie ma backendu, kont, zewnętrznych API ani generatywnej AI.
- Logika gry w `src/core` nie może zależeć od Reacta.
- Treści mają być deklaratywne i walidowane schematami Zod.
- Wszystkie losowania mają korzystać z deterministycznego generatora.
- Historia ma być przechowywana jako fakty, wątki i interpretacje, nie tylko gotowe teksty.
- Nie wolno dodawać ciężkich zależności bez uzasadnienia.
- Przed zakończeniem zadania należy uruchomić npm run verify.
- PR nie może być opisany jako gotowy, jeżeli verify nie przeszło.
- Nowe typy danych muszą mieć schematy walidacyjne.
- Językiem produktu jest polski, a językiem kodu angielski.

## Ciągłość integracji MatchEngine od PR200

- Każdy istotny PR MatchEngine opisuje: research change, local result, integration effect, promotion decision i next dependency.
- Utrzymuj wykonywalny profil z `docs/match-engine/INTEGRATION_ARCHITECTURE.md`; jawnie określ zmianę albo pozostawienie kandydata bez zmian.
- Oddziel wybór mechanizmów od polityki, wyniki lokalne od pełnych meczów i lifecycle od I/F/E/T/M/C. Zachowuj wyniki negatywne oraz źródłowe replaye.
