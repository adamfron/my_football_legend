import { z } from 'zod';
import type { CareerState, FinancialCategory } from '../../types/domain';
import { getFactPresentation } from '../../core/narrative/factPresentation';

export const FINANCE_CATEGORIES: Record<FinancialCategory, string> = {
  stipend: 'Stypendium',
  side_job: 'Praca dodatkowa',
  development: 'Rozwój i trening',
  recovery: 'Leczenie i regeneracja',
  education: 'Edukacja',
  lifestyle: 'Życie codzienne',
  salary: 'Wynagrodzenie',
  signing_bonus: 'Premia za podpis',
};
export const formatPLN = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} PLN`;
export const financeOverviewSchema = z.object({
  balance: z.number().finite().optional(),
  income: z.number().nonnegative(),
  expenditure: z.number().nonnegative(),
  rows: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      category: z.string(),
      amount: z.number().finite(),
      balance: z.number().finite(),
      source: z.string(),
    }),
  ),
  categories: z.array(z.object({ label: z.string(), income: z.number(), expenditure: z.number() })),
});
/** The existing ledger starts at zero. No hypothetical wages or opening balance are added. */
export const projectFinances = (career: CareerState): z.infer<typeof financeOverviewSchema> => {
  let balance = 0,
    income = 0,
    expenditure = 0;
  const categories = new Map<
    FinancialCategory,
    { label: string; income: number; expenditure: number }
  >();
  const facts = new Map(career.historyFacts.map((fact) => [fact.id, fact]));
  const rows = [...(career.finances ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((transaction) => {
      balance += transaction.amount;
      income += Math.max(0, transaction.amount);
      expenditure += Math.max(0, -transaction.amount);
      const category = categories.get(transaction.category) ?? {
        label: FINANCE_CATEGORIES[transaction.category],
        income: 0,
        expenditure: 0,
      };
      category.income += Math.max(0, transaction.amount);
      category.expenditure += Math.max(0, -transaction.amount);
      categories.set(transaction.category, category);
      const fact = transaction.sourceFactId ? facts.get(transaction.sourceFactId) : undefined;
      return {
        id: transaction.id,
        date: transaction.date,
        category: category.label,
        amount: transaction.amount,
        balance,
        source: fact ? getFactPresentation(career, fact).title : category.label,
      };
    });
  return {
    balance: career.finances === undefined ? undefined : balance,
    income,
    expenditure,
    rows,
    categories: [...categories.values()],
  };
};
