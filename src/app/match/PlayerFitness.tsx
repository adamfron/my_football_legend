import type { MatchPlayerState } from '../../core/matchSimulation/matchState';

const injuryLabels = {
  discomfort: 'Dyskomfort',
  playable: 'Uraz ogranicza ruch',
  unable: 'Nie może kontynuować',
  absence: 'Poza grą',
};

/** Both bars describe the same actual reserves used by controlled and CPU footballers. */
export const PlayerFitness = ({ player }: { player: MatchPlayerState }) => (
  <section
    className="player-fitness"
    aria-label={`Kondycja: ${player.profile.firstName} ${player.profile.lastName}`}
  >
    <strong>
      {player.profile.firstName} {player.profile.lastName}
    </strong>
    {player.fitness ? (
      <>
        <label>
          Rezerwa fizyczna{' '}
          <meter
            min={0}
            max={1}
            value={player.fitness.longTermCapacity}
            aria-label="Rezerwa fizyczna"
          />{' '}
          <span>{Math.round(player.fitness.longTermCapacity * 100)}%</span>
        </label>
        <label>
          Gotowość do zrywu{' '}
          <meter
            min={0}
            max={1}
            value={player.fitness.burstReadiness}
            aria-label="Gotowość do zrywu"
          />{' '}
          <span>{Math.round(player.fitness.burstReadiness * 100)}%</span>
        </label>
        <small>
          Krótki zryw zużywa gotowość, która wraca podczas spokojniejszej gry w granicach dostępnej
          rezerwy.
        </small>
      </>
    ) : (
      <span>Brak pomiaru kondycji.</span>
    )}
    {player.injury && <span role="status">{injuryLabels[player.injury.status]}</span>}
  </section>
);
