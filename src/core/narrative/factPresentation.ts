import type { CareerState, HistoryFact } from '../../types/domain';
import { PLAY_STYLE_PRESENTATION, playStyleIdSchema } from '../playStyles';

export interface FactPresentation {
  title: string;
  summary: string;
  toneLabel: string;
  participantNames: string[];
  clubName?: string;
}
const tones: Record<HistoryFact['emotionalTone'], string> = {
  positive: 'Pozytywny',
  negative: 'Trudny',
  neutral: 'Neutralny',
  bittersweet: 'Niejednoznaczny',
};
const copy: Record<string, [string, string]> = {
  career_started: ['Początek kariery', 'Pierwszy sezon w klubie: {club}.'],
  academy_debut: ['Debiut w akademii', 'Pierwszy zapisany występ w rozgrywkach akademii.'],
  senior_debut: ['Debiut seniorski', 'Pierwszy zapisany występ w rozgrywkach seniorskich.'],
  first_senior_start: [
    'Pierwszy skład seniorów',
    'Pierwszy seniorski mecz rozpoczęty w podstawowym składzie.',
  ],
  first_senior_goal: ['Pierwszy gol seniorski', 'Pierwsza bramka w rozgrywkach seniorskich.'],
  first_senior_assist: ['Pierwsza asysta seniorska', 'Pierwsza asysta w rozgrywkach seniorskich.'],
  first_academy_goal: ['Pierwszy gol w akademii', 'Pierwsza bramka w rozgrywkach akademii.'],
  first_academy_assist: ['Pierwsza asysta w akademii', 'Pierwsza asysta w rozgrywkach akademii.'],
  first_professional_contract: [
    'Pierwszy profesjonalny kontrakt',
    'Pierwsza umowa zawodowa: {club}.',
  ],
  contract_renewed: ['Przedłużenie kontraktu', 'Podpisano przedłużenie umowy. {club}.'],
  contract_renegotiated: ['Nowe warunki kontraktu', 'Przyjęto wynegocjowane warunki umowy.'],
  contract_negotiation_rejected: [
    'Odrzucone negocjacje',
    'Klub odrzucił prośbę o zmianę warunków umowy.',
  ],
  season_completed: ['Podsumowanie sezonu', 'Zakończono sezon w klubie: {club}.'],
  attribute_changed: ['Rozwój zawodnika', 'Odnotowano zmianę umiejętności zawodnika.'],
  play_style_unlocked: ['Nowy styl gry', 'Odnotowano zdobycie stylu gry.'],
  canonical_match_result: ['Mecz ligowy', 'Zachowany wynik spotkania ligowego.'],
  match_played: ['Występ ligowy', 'Zapisany udział w spotkaniu ligowym.'],
  interactive_match: ['Mecz ligowy', 'Zapisany udział w spotkaniu ligowym.'],
  retired: ['Zakończenie kariery', 'Koniec kariery. Ostatni klub: {club}.'],
  transfer_completed: ['Transfer', 'Zapisana zmiana klubu.'],
  club_left: ['Pożegnanie z klubem', 'Koniec pobytu w dotychczasowym klubie.'],
  club_joined: ['Nowy klub', 'Początek pobytu w klubie: {club}.'],
  joined_professional_club: ['Nowy klub zawodowy', 'Początek pobytu w klubie: {club}.'],
  academy_graduated: ['Koniec szkolenia w akademii', 'Zakończono etap szkolenia w akademii.'],
  top_tier_champion: ['Mistrzostwo', '{club} — mistrzostwo najwyższej ligi.'],
  division_winner: ['Zwycięstwo w lidze', '{club} — pierwsze miejsce w swojej lidze.'],
  club_promoted: ['Awans', 'Awans: {club}.'],
  club_relegated: ['Spadek', 'Spadek: {club}.'],
  head_coach_changed: ['Zmiana trenera', '{club}: nowy trener ponownie ocenia skład.'],
  player_injured: ['Kontuzja', 'Uraz odnotowany w trakcie kariery.'],
  injury_started: ['Kontuzja', 'Uraz odnotowany w trakcie kariery.'],
  injury_recovered: [
    'Powrót po urazie',
    'Zakończył się odnotowany okres niedostępności z powodu urazu.',
  ],
  role_promise_broken: [
    'Ograniczone szanse na grę',
    'Zapisany udział w grze był niższy od oczekiwania kontraktowego.',
  ],
  academy_selection_result: ['Ocena w akademii', 'Zapisano ocenę miejsca zawodnika w zespole.'],
  opening_month_role_assigned: ['Rola w zespole', 'Zapisano ocenę miejsca zawodnika w zespole.'],
  career_stat_milestone: ['Kamień milowy', 'Osiągnięto próg statystyczny w karierze klubowej.'],
  career_longevity: ['Jubileusz kariery', 'Kolejny etap kariery klubowej.'],
};
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
export const historicalClubName = (
  career: CareerState,
  id: string | undefined,
): string | undefined => {
  if (!id) return undefined;
  return (
    career.completedSeasons?.find((s) => s.clubId === id)?.clubName ??
    career.clubWorld?.find((c) => c.id === id)?.name ??
    career.leagueSeason?.clubs.find((c) => c.clubId === id)?.name ??
    (career.currentClub.id === id ? career.currentClub.name : undefined)
  );
};
export const getFactPresentation = (career: CareerState, fact: HistoryFact): FactPresentation => {
  const d = fact.data;
  const participantNames = [...new Set([...fact.actors, ...fact.targets])].flatMap((id) => {
    if (id === career.player.id) return [`${career.player.firstName} ${career.player.lastName}`];
    const p = career.significantPeople.find((p) => p.id === id);
    return p ? [`${p.firstName} ${p.lastName}`] : [];
  });
  const clubName =
    text(d.clubName) ??
    text(d.toClubName) ??
    (fact.factType === 'career_started' ? text(d.club) : undefined) ??
    historicalClubName(career, fact.clubs[0]);
  const [title, template] = copy[fact.factType] ?? [
    'Wydarzenie kariery',
    'Zachowany wpis z historii kariery.',
  ];
  let summary = template.replaceAll('{club}', clubName ?? 'Klub z historycznego zapisu');
  const style = playStyleIdSchema.safeParse(d.playStyleId);
  const match = d.summary as
    | {
        teamNames?: { home: string; away: string };
        score?: { home: number; away: number };
        status?: string;
      }
    | undefined;
  if (fact.factType === 'play_style_unlocked' && style.success)
    summary = `${PLAY_STYLE_PRESENTATION[style.data].name}. ${PLAY_STYLE_PRESENTATION[style.data].effect}`;
  if (fact.factType === 'canonical_match_result' && match?.score)
    summary = `${match.teamNames?.home ?? 'Gospodarze'} ${match.score.home}:${match.score.away} ${match.teamNames?.away ?? 'Goście'}${match.status === 'abandoned' ? ' · mecz przerwany' : ''}.`;
  if (fact.factType === 'transfer_completed') {
    const from = text(d.fromClubName) ?? historicalClubName(career, text(d.fromClubId));
    const to = text(d.toClubName) ?? historicalClubName(career, text(d.toClubId)) ?? clubName;
    const movement =
      typeof d.fromTier === 'number' && typeof d.toTier === 'number'
        ? d.toTier < d.fromTier
          ? ' Wyższy poziom ligowy.'
          : d.toTier > d.fromTier
            ? ' Niższy poziom ligowy.'
            : ' Ten sam poziom ligowy.'
        : '';
    summary = `${from ?? 'Poprzedni klub'} → ${to ?? 'Nowy klub'}.${movement}`;
  }
  if (fact.factType === 'club_left')
    summary = `Koniec pobytu: ${text(d.fromClubName) ?? historicalClubName(career, text(d.fromClubId)) ?? 'poprzedni klub'}.`;
  if (fact.factType === 'season_completed' && typeof d.finalPosition === 'number')
    summary += ` ${d.finalPosition}. miejsce${text(d.competition) ? ` · ${d.competition}` : ''}.`;
  if (
    fact.factType === 'attribute_changed' &&
    typeof d.before === 'number' &&
    typeof d.after === 'number'
  )
    summary = `Zmiana umiejętności: ${d.before} → ${d.after}.`;
  if (fact.factType === 'head_coach_changed') {
    const p = career.significantPeople.find((p) => p.id === d.managerId);
    if (p)
      summary = `${clubName ?? 'Klub'}: ${p.firstName} ${p.lastName}${text(d.preferredFormation) ? ` · ustawienie ${d.preferredFormation}` : ''}.`;
  }
  if (fact.factType === 'player_injured' || fact.factType === 'injury_started') {
    const injury = d.injury as { severity?: string; matchesRemaining?: number } | undefined;
    const severity = text(d.severity) ?? injury?.severity;
    summary = `${severity === 'major' ? 'Poważny uraz' : severity === 'moderate' ? 'Umiarkowany uraz' : 'Uraz'} odnotowany w trakcie kariery.`;
  }
  if (fact.factType === 'career_stat_milestone' && typeof d.threshold === 'number')
    summary = `${d.threshold} ${({ appearances: 'występów', starts: 'meczów w pierwszym składzie', goals: 'goli', assists: 'asyst', cleanSheets: 'czystych kont' } as Record<string, string>)[String(d.metric)] ?? 'osiągnięć'} w zapisanej karierze klubowej.`;
  if (fact.factType === 'career_longevity' && typeof d.completedSeasons === 'number')
    summary = `Zakończono ${d.completedSeasons} sezonów kariery klubowej (z akademią).`;
  return {
    title,
    summary,
    toneLabel: tones[fact.emotionalTone],
    participantNames,
    ...(clubName ? { clubName } : {}),
  };
};
