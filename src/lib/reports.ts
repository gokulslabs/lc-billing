export type InvoiceReportRow = {
  billNo: string;
  billedOn: string;
  customerName: string;
  gross: number;
  discount: number;
  net: number;
};

export type PendingRow = {
  billNo: string;
  billedOn: string;
  showroom: string | null;
  invoiced: number;
  paid: number;
  balance: number;
};

export type MismatchRow = {
  inventoryNo: string;
  productCode: string;
  productName: string;
  received: number;
  billed: number;
  onHand: number;
  difference: number;
};

const day = /^\d{4}-\d{2}-\d{2}$/;

export function monthStart(value: string): string {
  return `${value.slice(0, 8)}01`;
}

export function rangeProblem(from: string, to: string): string | null {
  if (!day.test(from) || !day.test(to)) return "Enter a valid date.";
  if (from > to) return "From date is after to date.";
  return null;
}

export function billTotals(amounts: readonly number[]): { gross: number; discount: number; net: number } {
  const gross = amounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100;
  return { gross, discount: 0, net: gross };
}

export function moneyBalance(invoiced: number, paid: number): number {
  return (Math.round(invoiced * 100) - Math.round(paid * 100)) / 100;
}

export function stockGap(received: number, onHand: number, billed: number): number {
  const expected = Math.round((received - billed) * 1000) / 1000;
  return Math.round((onHand - expected) * 1000) / 1000;
}
