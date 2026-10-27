import { z } from "zod";

export const NEW_COUNTER_FROM = "2026-10-26";

export const PAYMENT_MODES = ["CASH", "UPI", "CARD"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export type InvoiceLine = {
  id: string;
  inventoryNo: string;
  productCode: string;
  groupName: string;
  productName: string;
  quantity: number;
  rate: number;
  discount: number;
  amount: number;
  status: string;
};

export type InvoicePayment = {
  id: string;
  amount: number;
  paidOn: string;
  mode: PaymentMode | null;
  showroom: string | null;
};

export type InvoiceSummary = {
  id: string;
  billNo: string;
  customerId: string;
  customerName: string;
  billedOn: string;
  status: string;
  remarks: string | null;
  gross: number;
  discount: number;
  total: number;
  collected: number;
  balance: number;
};

export const BILL_SORTS = ["date", "bill", "customer", "gross", "discount", "net", "collected", "balance"] as const;
export type BillSort = (typeof BILL_SORTS)[number];
export const BILL_PAYS = ["all", "unpaid", "paid"] as const;
export type BillPay = (typeof BILL_PAYS)[number];

export function selectBills(
  rows: readonly InvoiceSummary[],
  pay: BillPay,
  sort: BillSort,
  direction: "asc" | "desc",
): InvoiceSummary[] {
  const filtered = rows.filter((row) => {
    if (pay === "all") return true;
    if (row.status === "cancelled") return false;
    const unpaid = row.balance > 0.001;
    return pay === "unpaid" ? unpaid : !unpaid;
  });
  const sign = direction === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => compareBills(a, b, sort) * sign || a.billNo.localeCompare(b.billNo, undefined, { numeric: true }));
}

function compareBills(a: InvoiceSummary, b: InvoiceSummary, sort: BillSort): number {
  if (sort === "date") return a.billedOn.localeCompare(b.billedOn) || a.billNo.localeCompare(b.billNo, undefined, { numeric: true });
  if (sort === "bill") return a.billNo.localeCompare(b.billNo, undefined, { numeric: true });
  if (sort === "customer") return a.customerName.localeCompare(b.customerName);
  if (sort === "gross") return a.gross - b.gross;
  if (sort === "discount") return a.discount - b.discount;
  if (sort === "collected") return a.collected - b.collected;
  if (sort === "balance") return a.balance - b.balance;
  return a.total - b.total;
}

export type InvoiceDetail = InvoiceSummary & {
  lines: InvoiceLine[];
  payments: InvoicePayment[];
};

export type InvoiceItem = {
  id: string;
  billNo: string;
  billedOn: string;
  customerName: string;
  inventoryNo: string;
  productCode: string;
  groupName: string;
  productName: string;
  quantity: number;
  rate: number;
  amount: number;
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid("Choose a customer."),
});

export const invoiceLineSchema = z.object({
  inventoryNo: z.string().trim().min(1, "Enter an inventory number.").max(40, "Inventory number is too long."),
  quantity: z.number().positive("Enter a quantity.").max(999_999, "Quantity is too large."),
  rate: z.number().min(0, "Rate cannot be negative.").max(9_999_999, "Rate is too large.").optional(),
  extraOff: z.number().min(0, "Extra off cannot be negative.").max(9_999_999, "Extra off is too large.").optional(),
});

export const returnLineSchema = z.object({
  quantity: z.number().positive("Enter a quantity.").max(999_999, "Quantity is too large."),
});

export const removePaymentSchema = z.object({
  reason: z.string().trim().min(1, "Enter a reason.").max(300, "Reason is too long."),
});

export const cancelInvoiceSchema = z.object({
  remarks: z.string().trim().min(1, "Enter a reason.").max(300, "Reason is too long."),
});

export const paymentSchema = z.object({
  amount: z.number().positive("Enter an amount.").max(9_999_999, "Amount is too large."),
  paidOn: day,
  mode: z.enum(PAYMENT_MODES, { message: "Choose cash, UPI, or card." }),
  showroom: z.string().trim().max(80, "Showroom is too long."),
});

export function nextBillNo(existing: readonly string[]): string {
  let max = 0;
  for (const value of existing) {
    if (!/^\d+$/.test(value)) continue;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) max = Math.max(max, parsed);
  }
  return String(max + 1);
}

export function lineAmount(quantity: number, rate: number): number {
  const paise = Math.round((Math.round(quantity * 1000) * Math.round(rate * 100)) / 1000);
  return paise / 100;
}

export function priceLine(
  quantity: number,
  catalogueRate: number,
  groupPercent: number,
  typedRate?: number,
  extraOff?: number,
): { rate: number; amount: number } {
  const rate = typedRate == null ? catalogueRate : typedRate;
  const priced = applyGroupDiscount(quantity, rate, groupPercent);
  const extra = extraOff == null || extraOff <= 0 ? 0 : Math.min(priced.amount, Math.round(extraOff * 100) / 100);
  return { rate, amount: Math.round((priced.amount - extra) * 100) / 100 };
}

export function returnQuantity(
  lineQty: number,
  lineAmountValue: number,
  giveBack: number,
): { quantity: number; amount: number } | string {
  if (!(giveBack > 0)) return "Enter a quantity to return.";
  if (giveBack > lineQty + 0.0001) return "That is more than this line.";
  if (giveBack >= lineQty - 0.0001) return { quantity: 0, amount: 0 };
  const quantity = Math.round((lineQty - giveBack) * 1000) / 1000;
  const amount = lineQty === 0 ? 0 : Math.round(((lineAmountValue * quantity) / lineQty) * 100) / 100;
  return { quantity, amount };
}

export function applyGroupDiscount(quantity: number, rate: number, percent: number): { gross: number; discount: number; amount: number } {
  const gross = lineAmount(quantity, rate);
  const share = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const discount = Math.round(gross * share) / 100;
  return { gross, discount, amount: Math.round((gross - discount) * 100) / 100 };
}

export function collectionProblem(balance: number, amount: number): string | null {
  if (amount > Math.round(balance * 100) / 100 + 0.001) return "Amount is more than the balance.";
  return null;
}

export function shopToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
