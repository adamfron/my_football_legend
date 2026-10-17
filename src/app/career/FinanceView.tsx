import { useMemo, useState } from 'react';
import type { CareerState } from '../../types/domain';
import { squadRoleLabel } from '../../core/careerPresentation';
import { formatPLN, projectFinances } from './financePresentation';

export const FinanceView = ({ career }: { career: CareerState }) => {
  const overview = useMemo(() => projectFinances(career), [career]);
  const [all, setAll] = useState(false);
  const contract = career.currentContract;
  const rows = all ? overview.rows : overview.rows.slice(-10);
  return (
    <div className="finance-view">
      <h2>Kontrakt i finanse</h2>
      <dl className="finance-totals">
        <div>
          <dt>Dostępne środki</dt>
          <dd>{formatPLN(overview.balance)}</dd>
        </div>
        <div>
          <dt>Pensja / miesiąc</dt>
          <dd>{contract ? formatPLN(contract.monthlySalary) : 'Brak kontraktu'}</dd>
        </div>
        <div>
          <dt>Zapisane przychody</dt>
          <dd>+{formatPLN(overview.income)}</dd>
        </div>
        <div>
          <dt>Zapisane wydatki</dt>
          <dd>−{formatPLN(overview.expenditure)}</dd>
        </div>
      </dl>
      {contract ? (
        <p>
          Umowa od {contract.startDate} do {contract.endDate} · {squadRoleLabel(contract.squadRole)}
          . Premia w umowie: {formatPLN(contract.signingBonus)}.
        </p>
      ) : (
        <p>Nie masz obecnie kontraktu.</p>
      )}
      <p className="finance-note">
        Kwoty obejmują wyłącznie zapisaną księgę transakcji. Premia w umowie nie jest dodatkowo
        doliczana do salda.
      </p>
      <details className="finance-categories">
        <summary>Przychody i wydatki według kategorii</summary>
        <dl>
          {overview.categories.map((category) => (
            <div key={category.label}>
              <dt>{category.label}</dt>
              <dd>
                +{formatPLN(category.income)} / −{formatPLN(category.expenditure)}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <h3>Ostatnie transakcje</h3>
      {rows.length ? (
        <>
          <div
            className="finance-table-scroll"
            tabIndex={0}
            aria-label="Historia transakcji — przewijanie"
          >
            <table className="finance-table">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Kategoria / źródło</th>
                  <th scope="col">Kwota</th>
                  <th scope="col">Saldo po zapisie</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <time>{row.date}</time>
                    </td>
                    <td>
                      {row.category}
                      <small>{row.source !== row.category ? row.source : 'Zapis księgi'}</small>
                    </td>
                    <td>
                      {row.amount > 0 ? '+' : row.amount < 0 ? '−' : ''}
                      {formatPLN(Math.abs(row.amount))}
                      <small>
                        {row.amount > 0 ? 'Przychód' : row.amount < 0 ? 'Wydatek' : 'Bez zmiany'}
                      </small>
                    </td>
                    <td>{formatPLN(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overview.rows.length > 10 && (
            <button type="button" aria-expanded={all} onClick={() => setAll((value) => !value)}>
              {all ? 'Pokaż ostatnie 10' : `Cała historia (${overview.rows.length})`}
            </button>
          )}
        </>
      ) : (
        <p>Brak zapisanych transakcji.</p>
      )}
    </div>
  );
};
