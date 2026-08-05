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
