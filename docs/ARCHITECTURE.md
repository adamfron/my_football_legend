# Architektura

## Warstwa prezentacji kariery

### Tożsamość wizualna klubu

Klub jest właścicielem kanonicznej, deterministycznej `ClubVisualIdentity` z kolorem
podstawowym i dodatkowym. Para jest metadanymi prezentacyjnymi, niezależnymi od siły
sportowej, i może być później współdzielona przez UI, herby oraz stroje. React korzysta
z zapisanej tożsamości (z deterministycznym fallbackiem dla starszego zapisu), zamiast
wyliczać własny kolor z ID. Biel pozostaje bielą w danych; obrys i krawędź zapewniające
kontrast są wyłącznie zachowaniem CSS.

### Semantyka osi sezonu

Etykiety zdarzeń osi pochodzą z metadanych/treści definicji wydarzenia. Stan kariery
przechowuje identyfikator, a nie wyrenderowaną polską frazę. Brak specjalnej etykiety
korzysta z tytułu wydarzenia, nigdy z ogólnego statusu implementacyjnego.

Przy braku występu oś prezentuje kanoniczny `SeasonParticipationRecord.status`, dzięki
czemu rozróżnia między innymi kontuzję, zawieszenie, ławkę i brak powołania.

### Prezentacja zawodnika

Radar ma jawne semantyki migawek: aktywny sezon porównuje kanoniczny początek z bieżącymi atrybutami, a podsumowanie — zamrożony początek z zamrożonym końcem z `CompletedSeasonSnapshot.development`. Etykiety są semantyką prezentacji, nie stanem kariery. Stała paleta radaru nie zależy od barw klubu.

Style gry oraz poziomy zaangażowania są projekcjami istniejących danych `Player` i
`CareerState`; panel zawodnika nie utrzymuje ich kopii ani nie dodaje drugiego systemu
cech. Opis zawodnika pozostaje tymczasowo powiązany z profilem startowym. W Player Model
2.0 powinien stać się opisem wyprowadzanym z aktualnych atrybutów, stylów, roli i etapu
kariery. Realizm zmian minut (w tym zmian gwiazd około 70–85 minuty) pozostaje zadaniem
przyszłego projektu selekcji/minut, a nie losową korektą zakresu w tej warstwie.

## Wspólna powłoka wizualna

Kreator i Career View korzystają z jednego zwartego języka aplikacji: prostokątnych paneli,
cienkich obramowań, oszczędnego akcentu klubowego, małej typografii i subtelnych krawędzi
wgłębionych/wypukłych. Inspiracja oprogramowaniem desktopowym końca lat 90. jest wyłącznie
warstwą prezentacji i nie zmienia architektury ani balansu rozgrywki.

Kroki kreatora są komponentami funkcji w `src/app/creator`, oddzielonymi od generowania gracza w
core. Opcjonalne moduły archetypu fizycznego lub zaawansowanego kreatora mogą zostać w przyszłości
dołączone do tej powłoki bez zmiany istniejących reguł generowania. Są to punkty rozszerzeń, a nie
zaimplementowane mechaniki.

## Career View

Stały widok sezonu jest podstawową powierzchnią rozgrywki aktywnej kariery. Tabela ligi i
wyprowadzona z danych kanonicznych Oś sezonu są widoczne jednocześnie i aktualizują się wraz z
postępem kariery; nie zapisujemy osobnego modelu osi w save.

Karty zawodnika, klubu, kontraktu/finansów i historii pokazują zwarte podsumowania. Ich szczegóły
rozwijają się nad tym samym widokiem, zamiast przenosić gracza do osobnych ekranów. Na wąskim
ekranie karty przewijają się poziomo, a tabela i oś układają się w jednej kolumnie.
Jednocześnie otwarta jest najwyżej jedna współdzielona powierzchnia szczegółów; jej otwarcie nie
odmontowuje stałego obszaru tabeli i Osi sezonu. Ponowne wybranie aktywnej karty lub przycisk `×`
zamyka szczegóły.

Okna pierwszego planu są dopasowane do treści pod wspólną kotwicą workspace; po osiągnięciu maksymalnej wysokości przewijają się wewnątrz. Herb jest jednym statycznym komponentem zasilanym `ClubVisualIdentity`; warianty zmieniają tylko rozmiar.

## Playback i autopauza

Play/Pause jest wyłącznie stanem prezentacji i nigdy nie jest zapisywany. React odpowiada za
tempo (jeden krok co 1000 ms), natomiast `advanceSimulationStep` w core pozostaje jedynym źródłem
reguł pojedynczego, deterministycznego kroku. Szybkie przejście także korzysta z tego prymitywu.

Każda decyzja gracza zatrzymuje czas: wydarzenie, ważny mecz, aktywny mecz lub event, decyzja
transferowa/kontraktowa, koniec sezonu, emerytura oraz błąd progresji. Zwykłe wydarzenie wznawia odtwarzanie tylko, gdy to odtwarzanie spowodowało pauzę i nie pozostał blocker. Ręczna pauza, ważny mecz i koniec sezonu nie uruchamiają czasu automatycznie.

## Jedna pętla kariery

Kariera ma jeden cykl życia: utworzenie zawodnika, inicjalizacja generycznego sezonu, tygodnie kalendarza, zamknięcie sezonu, okno decyzji zawodowych i inicjalizacja następnego sezonu. Pierwszy sezon jest rozgrywką młodzieżową z powodów sportowych, a nie osobnym silnikiem fabularnym. `advanceCareerFlow` wykonuje wyłącznie bezdecyzyjne, idempotentne przejścia.

`CareerCalendarState` jest kanonicznym, widocznym dla zawodnika terminarzem sezonu. Przechowuje spotkania, datowane wydarzenia kontekstowe i bieżącą datę symulacji. `LeagueSeason` pozostaje tymczasowo autorytetem tabeli i wyników rozgrywek, a operacje domeny kalendarza atomowo synchronizują jego przyszłe daty z terminarzem i rejestrem udziału zawodnika.

### Operacyjne tygodnie i dynamiczna przyszłość

`CareerWeek` jest wyłącznie operacyjnym koszykiem dla systemów działających w rytmie tygodniowym. Nie jest właścicielem dat spotkań ani wydarzeń: jego identyfikatory są przebudowywane z kanonicznego kalendarza. Przyszłe spotkania i wydarzenia mogą być dodawane, przekładane lub odraczane wyłącznie przez jawne operacje domenowe. Wykrywają one konflikty, ale nie narzucają priorytetu rozgrywek.

### Niezmienna przeszłość i projekcja osi

Zakończone wyniki, decyzje i fakty są niezmienne i nie są ponownie losowane po zmianie przyszłego terminarza. Przełożenie zachowuje identyfikator spotkania i powiązanie z rejestrem udziału oraz zapisuje semantyczny `HistoryFact`, a nie gotową narrację.

`SeasonTimeline` jest czystą, deterministycznie sortowaną projekcją kalendarza, udziału zawodnika, wydarzeń i historii. Nie jest zapisywana ani nie kopiuje statystyk meczu; wpis spotkania wskazuje jego kanoniczny `SeasonParticipationRecord`. Przyszłe systemy pucharów krajowych, europejskich i reprezentacji skorzystają z tego samego API planowania zamiast tworzyć własne kalendarze. Te rozgrywki nie są jeszcze zaimplementowane.

## Kanoniczny świat futbolu

Liga rozstrzyga pełne kolejki i przechowuje tabelę oraz wyniki jako fakty świata. `ProfessionalClub.strengthRating` jest trwałym źródłem jakości pierwszego zespołu; oceny meczowe są z niego wyprowadzane. Infrastruktura klubu, historia udziału w sezonach i archiwum sezonów nie są alternatywnymi źródłami siły.

Kontrakty, oferty profesjonalne, transfer do pierwszego klubu, kolejne okna transferowe, renegocjacje i preferencje agenta są już częścią generycznego cyklu. Przejście akademia–profesjonalny futbol wynika z wyniku sezonu i decyzji zawodowej, nie ze specjalnego faktu fabularnego.

## Narracja i wydarzenia

`HistoryFact` zapisuje kanoniczne zdarzenia, `RelationshipScores` relacje, a `StoryThread` długotrwałe interpretacyjne konteksty. Tekst lokalizowany jest prezentacją tych danych. `EventDefinition`, `EventInstance`, rejestr, deterministyczna instancjalizacja, resolver i aplikowanie rezultatu pozostają ogólną infrastrukturą dla przyszłych wydarzeń kontekstowych; nie sterują osobnym prologiem.

Cała logika `src/core` pozostaje niezależna od Reacta. Losowania przechodzą przez deterministyczny `RandomGenerator`, a dane domenowe są walidowane schematami Zod.

## Warstwa aplikacji React

`src/app/App.tsx` jest powłoką aplikacji: wybiera ekran startowy, kreator lub karierę oraz zarządza wczytaniem, zapisem i resetem kariery. Komponenty funkcjonalne w `src/app/career`, `src/app/match` i `src/app/shared` odpowiadają za prezentację poszczególnych obszarów interfejsu.

Zależności biegną od Reacta do `src/core`. Ekrany wyświetlają stan i wywołują istniejące operacje domenowe, ale nie implementują reguł rozgrywki; `src/core` nie importuje warstwy React/UI.

## Trwałość danych

Projekt jest wewnętrznym prototypem. Kompatybilność starych zapisów nie jest obecnie ograniczeniem projektowym. Zmiana architektury może podnieść wersję zapisu i czysto odrzucić wcześniejsze dane zamiast utrzymywać migracje oraz pola zapasowe.

## Dalszy kierunek

Planowane osobno są: ujednolicone rozgrywki i kalendarz, rosnąca oś sezonu, responsywny pojedynczy widok kariery oraz przyszły interaktywny silnik migawkowych momentów meczu. Nie są one jeszcze zaimplementowane w obecnej architekturze.

## Tabela ofert na koniec sezonu

Bieżący kontrakt jest stanem referencyjnym, a `ProfessionalOffer` jedynym pojęciem aktywnej oferty. Propozycja obecnego klubu pozwala ją przyjąć albo podjąć jedną próbę negocjacji; wynikowa kontroferta pozwala już tylko na przyjęcie. Oferty zewnętrzne również mają wyłącznie akcję przyjęcia. Oglądanie lub negocjowanie propozycji nie odrzuca pozostałych ofert.

Przyjęcie dowolnej oferty atomowo instaluje dokładnie jej kontrakt, zamyka wszystkie konkurencyjne oferty i renegocjację oraz dokładnie raz przechodzi granicę sezonu. Kontynuacja niezmienionej umowy jest ścieżką awaryjną tylko wtedy, gdy umowa obejmuje 1 lipca nowego sezonu i nie ma propozycji obecnego klubu. Gdy umowa wygasa, przygotowanie rynku gwarantuje co najmniej jedną deterministyczną ofertę od prawdziwego klubu z bieżącego świata. Profesjonalny sezon nie może rozpocząć się na wygasłym kontrakcie.

Nazwy encji mogą w przyszłości prezentować zwarte podglądy oparte na danych kanonicznych, bez osobnej bazy UI: dla klubu herb, ligę, siłę, reputację, pozycję i infrastrukturę, a dla osoby portret, wiek, pozycję lub rolę, znany OVR, obecny klub i istotną relację.
