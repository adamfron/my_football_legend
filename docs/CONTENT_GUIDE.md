# Poradnik treści

- Każde wydarzenie musi mieć wyraźny kontekst.
- Każda decyzja powinna mieć zalety i koszty.
- Nie każda opcja musi być testem.
- Trudność testów jest ukryta.
- Gracz powinien otrzymać informacje pozwalające dokonać świadomego wyboru.
- Porażka powinna w miarę możliwości otwierać dalszy wątek.
- Wydarzenia powinny tworzyć kanoniczne fakty.
- Późniejsze wydarzenia mogą odwoływać się do dawnych faktów i postaci.

## Checklista autora wydarzenia

- Zdefiniuj wydarzenie deklaratywnie: id, obsadę, widoczne informacje, decyzje, korzyści i ryzyka.
- Nie ujawniaj trudności, procentów ani technicznych modyfikatorów.
- Każda decyzja musi mieć potencjalne zalety i koszty oraz prowadzić dalej także po porażce.
- Resolver powinien tworzyć obiektywny rezultat, osobne interpretacje społeczne, `HistoryFact` i ewentualny `StoryThread`.
- Wszystkie teksty dodaj do plików lokalizacji i sprawdź testem obecność kluczy.

## Zasada języka świata

Żaden tekst widoczny dla gracza nie może opisywać ukrytej mechaniki jako mechaniki. Nie pisz o teście, trudności, resolverze ani poziomie sukcesu. Przekaż tę samą informację przez obserwacje postaci i kontekst świata.

## Checklista publikacji treści

- Czy wszystkie klucze są przetłumaczone?
- Czy nie widać identyfikatorów?
- Czy obsada sceny jest prawidłowa?
- Czy korzyści i ryzyka są zrozumiałe?
- Czy rezultat ma wersję narracyjną?
- Czy fakt ma prezentację w historii?
- Czy może zostać użyty w późniejszym callbacku?

## Treści drugiego tygodnia akademii

Teksty wydarzeń drugiego tygodnia są lokalizowane po polsku i opisują świat gry, nie mechanikę. Nie wolno ujawniać `selectionOutcome`, `resolutionTier`, identyfikatorów decyzji, wartości punktowych ani technicznych nazw pól. Warianty bramkarza muszą używać języka rozpoczęcia gry, organizowania obrony i reakcji na ustawienie rywali; nie mogą wspominać o dryblingu, skrzydle ani wejściu w pole karne.

Nowe prezentacje historii powinny odczytywać fakty `academy_training_focus`, `academy_rival_preparation`, `academy_final_assessment`, `academy_selection_result`, `academy_selection_response` i `academy_second_week_completed` oraz budować opis z danych i relacji.

## Semantyczne zestawy wariantów

Semantyczny zestaw opisuje jeden zamiar narracyjny (np. wejście do szatni), a nie numer ścieżki domenowej. Każdy wariant wskazuje klucz lokalizacji. `scope` powinien nazywać miejsce użycia: `scene`, `result`, `history`, `week_summary`, `relationship`, albo część składanego podsumowania. Nie należy używać jednego scope do dwóch funkcji tekstu.

Fragmenty są pełnymi, krótkimi zdaniami i muszą pasować gramatycznie do obu sąsiadów. Trzeba pilnować interpunkcji, podmiotu i unikać powtórzenia tej samej informacji. `requiredTags` stosujemy wyłącznie, gdy tekst wymaga danego kontekstu; `excludedTags`, gdy byłby z nim sprzeczny. Zawsze powinien istnieć wariant ogólny.

Dobre warianty zmieniają perspektywę lub istotny szczegół sceny, nie tylko jeden synonim. Przed dodaniem tekstu należy sprawdzić, czy nie wymienia progów, poziomu rozstrzygnięcia, seeda, identyfikatora decyzji ani nazwy wariantu. Audit wymaga dwóch różnych tekstów, istniejących kluczy i braku technicznych identyfikatorów.

## Teksty meczowe

Opisuj wyłącznie wiedzę dostępną zawodnikowi: ustawienie, zmęczenie, zachowanie rywala i wynik. Nie ujawniaj trudności, szansy, rolla ani wartości wpływu. Każda decyzja musi mieć konkretną piłkarską korzyść i koszt. `auditRepeatedPlayerFacingText()` raportuje dłuższe polskie duplikaty bez blokowania CI.

## Konkret decyzji i feedbacku

Każda opcja decyzji powinna mieć konkretne i sytuacyjne: `description`, possible benefit oraz possible risk. Nie wolno zastępować ich uniwersalnymi placeholderami. Feedback opisuje zdarzenie na boisku, nie ujawnia rolla, difficulty, `personalImpact` ani liczbowego modyfikatora atutu. Najczęstsze komunikaty powinny mieć kilka znacząco różnych `NarrativeVariant`, dobieranych deterministycznie.

## Academy Event Pool

Wydarzenie akademii jest niezależnym klockiem, a nie „wydarzeniem numer 3”. Każdy kandydat musi deklarować:

- powód i fazy, w których może się pojawić (`phases`, zakres tygodni, waga);
- dozwolone grupy pozycji;
- wymagane i wykluczone fakty/tagi;
- rolę relacji lub postaci, jeżeli jej potrzebuje; postać tworzymy dopiero przy użyciu wydarzenia;
- fakty i semantyczne `recallTags`, które pozostawia;
- `oncePerCareer`, jeśli nie jest powtarzalne;
- `conflictsWith`, jeżeli nie może współistnieć z innym klockiem.

Treść powinna mieć warianty wejścia i rezultatu zależne od formy lub roli. Kotwice (przyjazd, trener, pierwsza ocena, znacząca osoba i decyzja o roli) gwarantują spójność, natomiast 4–6 scen między nimi jest dobieranych z puli deterministycznie.

## Uwaga gracza

**Interactive match moment must earn the player's attention. Do not stop the game for a choice that has no meaningful trade-off.** Rutynowa kolejka nie potrzebuje pozornej decyzji. Ważna scena powinna oferować kontekstowe opcje z odmiennym zyskiem, ryzykiem i interpretacją społeczną.
