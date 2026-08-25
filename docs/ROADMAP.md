# Roadmapa

## Stabilny pierwszy sezon

- [x] Autorytatywne, idempotentne rozliczanie sześciu spotkań każdej kolejki.
- [x] Osobne występy akademii oraz deterministyczne kartki, zawieszenia i urazy.
- [x] Ograniczony budżet interakcji, kontekstowe wydarzenia i podsumowanie sezonu.
- [ ] Kontrakty, transfery i generowanie następnego sezonu — osobny etap przejścia kariery.

1. Fundament techniczny.
2. Pierwsza pętla rozgrywki.
3. Pamięć i narracja.
4. Świat klubów.
5. Postacie i relacje.
6. Archetypy oraz przekwalifikowania.
7. Rozbudowa treści.
8. Interfejs mobilny.
9. Opcjonalne funkcje społecznościowe.

## Etap 2 — pierwszy grywalny wycinek

Zrealizowany przepływ obejmuje: start gry, nową karierę, kreator tożsamości i profilu, trzy deterministyczne losowania atrybutów, kartę zawodnika z własnym wykresem SVG, utworzenie `CareerState`, zapis w `localStorage` i ekran „Lipiec 2026 — pierwszy dzień w akademii”.

Na później pozostają: właściwa pętla rozgrywki, treningi, decyzje, wydarzenia meczowe, sezon, transfery, generator klubów, zaawansowane relacje, pełny portret, wersja mobilna oraz przyszły system budowy ciała, kondycji, treningu i zmiany masy podczas kariery.

## Aktualny etap: pierwszy tydzień akademii

Zrealizowany kolejny kamień milowy to pierwszy grywalny łuk narracyjny akademii Vistula Nova oraz minimalny deklaratywny silnik wydarzeń. Poza zakresem nadal pozostają pełny sezon, liga, transfery, symulacja spotkań i backend.

## Ukończone w etapie prezentacji

- Przebudowa kart decyzji na czytelne karty z osobnym przyciskiem akcji.
- Warstwa prezentacji faktów oraz deterministyczne podsumowanie pierwszego tygodnia.
- Pierwszy profil klubu Vistula Nova bez tabel ligowych i generatora klubów.
- Deterministyczne awatary SVG v1 dla relacji i trenera w profilu klubu.

## Aktualny zakres po drugim tygodniu akademii

Zaimplementowany łuk kończy się decyzją o najbliższej ścieżce: trening seniorów, wspólna szansa z konkurentem, indywidualny plan albo dodatkowy sprawdzian akademii. Właściwy trening seniorów, dodatkowy mecz akademii, pełny system rozwoju, liga, transfery i backend pozostają poza zakresem kolejnych scen bazowej wersji.

Balans selekcji można sprawdzać w devtools przez symulację naboru do seniorów. Symulator uruchamia deterministyczne serie seedów dla kilku strategii i raportuje rozkład wyników, tierów sprawdzianu oraz średnią kondycję przed oceną.

### Zrealizowane: ścieżki po decyzji akademii

- deterministyczne warianty i składane podsumowania;
- trzy rozgałęzione ciągi wydarzeń dla czterech wyników selekcji;
- wspólny jakościowy status roli na początek sezonu 2026/27;
- symulator rozkładu ścieżek. Pełny sezon, terminarz, tabela i transfery pozostają poza tym etapem.

# Economy v2

- zawodowe kontrakty, pensje, premie i agent;
- regularne koszty życia, mieszkanie i samochody;
- sponsorzy, inwestycje i wsparcie rodziny.

# Lifestyle events

- imprezy, alkohol, luksusowe wydatki i relacje romantyczne;
- ryzykowne znajomości oraz szemrane lub nielegalne propozycje jako abstrakcyjne wydarzenia z ryzykiem sportowym, prawnym i reputacyjnym.

# Development v2

- trenerzy personalni jako postacie, dietetyk, fizjoterapeuta i psycholog;
- nauka języków, formalna edukacja i wiedza o finansach;
- zmiana masy, budowa mięśni i zaawansowany trening pozycyjny.

## Dostępny etap: wrzesień 2026

- cztery kolejki (5, 12, 19 i 26 września);
- rywalizacja o seniorów i akademię bez pełnych składów;
- wejścia z ławki, ważne momenty, statystyki i debiut seniorski;
- bez tabeli ligowej, transferów i symulacji całego sezonu.

## Season simulation layer

- tabela i wyniki pozostałych klubów;
- klasyfikacje strzelców i asyst, clean sheets, nagrody oraz cele klubu.

## Contextual season races

- walka o króla strzelców, króla asyst i młodzieżowca;
- rekordy, mistrzostwo, utrzymanie i awans;
- decyzje zmieniają parametry zachowania (`shotShare`, `boxPresence`, `creativeRisk`, `defensiveContribution`), nigdy widoczny procent szansy na gola.

## Dynamic club strength

- transfery przychodzące i wychodzące;
- rozwój starszych i młodych graczy, spadki formy i kontuzje;
- głębia składu, zmiana trenera i polityki wobec młodzieży.

## Regular-season life planning

- **Preseason:** decyzje pozaboiskowe mogą występować prawie co tydzień.
- **Regular season:** jedna większa decyzja o rozwoju, regeneracji, edukacji, finansach lub życiu prywatnym mniej więcej raz na 3–4 tygodnie.
- **Match weeks:** bez automatycznego formularza trening/praca/odpoczynek po każdej kolejce.
- **Special events:** dodatkowe decyzje wynikają z historii (konflikt, trener, kontrakt, seria, przemęczenie, nagroda, transfer, relacja, kontuzja).
- **Winter break:** ponownie większa częstotliwość decyzji treningowo-życiowych.

Docelowy sezon powinien oferować orientacyjnie 8–12 większych strategicznych decyzji pozaboiskowych, obok decyzji meczowych i fabularnych; jest to wskazówka, nie twardy limit.

## Następne etapy

1. **Lightweight league simulation:** tabela, wyniki innych drużyn i klasyfikacje indywidualne.
2. **Contextual season goals:** król strzelców/asyst, walka o skład, awans lub utrzymanie i nagrody.
3. **Dynamic squad world:** kontuzje, transfery, siła formacji, wypożyczenia i zmiana trenera.
4. **Visual polish:** avatar generator v2, poprawa match momentum, layout, animacje i responsive UI.
5. **Narrative polish:** większe pule wariantów, kontrola powtórzeń i polska fleksja imion oraz nazwisk.

## Individual league context

- klasyfikacja strzelców i asyst;
- clean sheets i nagrody;
- `SeasonContextOpportunity`.

## Dynamic squad world

- transfery, kontuzje i wypożyczenia;
- zmiany trenerów;
- zmiana strength formacji.

## Career seasons

- przerwa letnia i następny sezon;
- kontrakty i okna transferowe;
- starszy wiek zawodnika.
