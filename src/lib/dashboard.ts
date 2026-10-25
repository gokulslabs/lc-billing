export type DashboardStats = {
  salesAmount: number;
  salesQuantity: number;
  collections: number;
  bills: number;
  products: number;
  customers: number;
  employees: number;
  openStitching: number;
};

export function sumSales(lines: readonly { quantity: number; amount: number }[]): { amount: number; quantity: number } {
  let paise = 0;
  let thousandths = 0;
  for (const line of lines) {
    paise += Math.round(line.amount * 100);
    thousandths += Math.round(line.quantity * 1000);
  }
  return { amount: paise / 100, quantity: thousandths / 1000 };
}

export function sumMoney(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100;
}
