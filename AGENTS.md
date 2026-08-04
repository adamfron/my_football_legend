# Instrukcje dla Codexa

- Gra jest narracyjna, nie menedżerska.
- Podstawowa wersja nie ma backendu, kont, zewnętrznych API ani generatywnej AI.
- Logika gry w `src/core` nie może zależeć od Reacta.
- Treści mają być deklaratywne i walidowane schematami Zod.
- Wszystkie losowania mają korzystać z deterministycznego generatora.
- Historia ma być przechowywana jako fakty, wątki i interpretacje, nie tylko gotowe teksty.
- Nie wolno dodawać ciężkich zależności bez uzasadnienia.
- Przed zakończeniem zadania należy uruchomić testy, lint i build.
- Nowe typy danych muszą mieć schematy walidacyjne.
- Językiem produktu jest polski, a językiem kodu angielski.
