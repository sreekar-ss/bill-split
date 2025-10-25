// Utility functions

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatSplitMethod(method: string): string {
  const labels: Record<string, string> = {
    equal: 'Split equally',
    percentage: 'Split by %',
    exact: 'Split by amount',
    itemized: 'Itemized',
  };
  return labels[method] || 'Split equally';
}

export function calculateBalances(expenses: any[], userId: string) {
  // Calculate who owes whom based on expenses
  const balances: Record<string, number> = {};

  expenses.forEach((expense) => {
    expense.splits.forEach((split: any) => {
      if (split.userId === userId) {
        // User owes money
        if (!split.settled) {
          balances[expense.createdById] = (balances[expense.createdById] || 0) + split.amount;
        }
      }
      if (expense.createdById === userId) {
        // User is owed money
        if (!split.settled && split.userId !== userId) {
          balances[split.userId] = (balances[split.userId] || 0) - split.amount;
        }
      }
    });
  });

  return balances;
}

// Simplify debts - minimize number of transactions
export function simplifyDebts(balances: Record<string, number>): Array<{ from: string; to: string; amount: number }> {
  const creditors: Array<{ id: string; amount: number }> = [];
  const debtors: Array<{ id: string; amount: number }> = [];

  // Separate creditors and debtors
  Object.entries(balances).forEach(([userId, balance]) => {
    if (balance > 0.01) {
      creditors.push({ id: userId, amount: balance });
    } else if (balance < -0.01) {
      debtors.push({ id: userId, amount: -balance });
    }
  });

  const transactions: Array<{ from: string; to: string; amount: number }> = [];

  // Match debtors with creditors
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debt = debtors[i].amount;
    const credit = creditors[j].amount;
    const settled = Math.min(debt, credit);

    transactions.push({
      from: debtors[i].id,
      to: creditors[j].id,
      amount: settled,
    });

    debtors[i].amount -= settled;
    creditors[j].amount -= settled;

    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return transactions;
}

