import { z } from "zod";
import type { Unit } from "@/lib/products";

export type InventoryItem = {
  id: string;
  inventoryNo: string;
  productId: string;
  productCode: string;
  productName: string;
  groupName: string;
  unit: Unit;
  price: number;
  quantity: number;
  status: string;
};

const quantity = z.number().positive("Enter a quantity.").max(999_999, "Quantity is too large.");

export const inventorySchema = z.object({
  productId: z.string().uuid("Choose a product."),
  inventoryNo: z.string().trim().max(40, "Inventory number is too long."),
  quantity,
});

const supplierName = z.string().trim().max(80, "Supplier name is too long.");
const supplierBillNo = z.string().trim().max(40, "Supplier bill number is too long.");
const cost = z.number().min(0, "Cost cannot be negative.").max(9_999_999, "Cost is too large.");

export const stockReceiptSchema = inventorySchema.extend({
  supplierName: supplierName.min(1, "Enter the supplier."),
  supplierBillNo: supplierBillNo.min(1, "Enter the supplier bill number."),
  cost,
});

export const inventoryUpdateSchema = inventorySchema.extend({
  quantity: z.number().min(0, "Quantity cannot be negative.").max(999_999, "Quantity is too large."),
  supplierName,
  supplierBillNo,
  cost: cost.optional(),
});

export const barcodeSchema = z.object({
  starting: z
    .string()
    .trim()
    .min(1, "Enter a starting number.")
    .max(40, "Starting number is too long.")
    .regex(/^(\D*)(\d+)$/, "Enter an inventory number such as IN0021288."),
  quantity: z.number().int("Label count must be a whole number.").min(1, "Print at least one label.").max(200, "Print at most 200 labels."),
});

export type InventoryInput = z.infer<typeof inventorySchema>;

export function quantityForUnit(unit: Unit, value: number): string | null {
  if (unit === "NO" && !Number.isInteger(value)) return "Pieces must be a whole number.";
  const decimals = value.toString().split(".")[1]?.length ?? 0;
  if (decimals > 3) return "Quantity can have at most 3 decimal places.";
  return null;
}

export function nextInventoryNo(existing: readonly string[]): string {
  let max = 0;
  let prefix = "";
  let width = 0;
  for (const value of existing) {
    const match = /^(\D*)(\d+)$/.exec(value.trim());
    if (!match?.[2]) continue;
    const parsed = Number(match[2]);
    const nextPrefix = match[1] ?? "";
    if (!Number.isSafeInteger(parsed)) continue;
    if (parsed < max) continue;
    if (parsed === max && prefix && !nextPrefix) continue;
    max = parsed;
    prefix = nextPrefix;
    width = match[2].length;
  }
  const next = String(max + 1);
  if (!prefix) return next;
  return prefix + next.padStart(Math.max(width, next.length), "0");
}

export type PurchaseLine = {
  date: string;
  productId: string;
  productCode: string;
  groupName: string;
  productName: string;
  unit: Unit;
  quantity: number;
  inventoryNos: string[];
  supplierName: string;
  supplierBillNo: string;
  cost: number | null;
};

export type PurchaseRow = {
  createdAt: string;
  inventoryNo: string;
  productId: string;
  quantity: number;
  supplierName: string;
  supplierBillNo: string;
  cost: number | null;
};

const day = /^\d{4}-\d{2}-\d{2}$/;

export function shopDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function kolkataBounds(from: string, to: string): { start: string; end: string } | null {
  if (!day.test(from) || !day.test(to) || from > to) return null;
  return { start: `${from}T00:00:00+05:30`, end: `${nextCalendarDay(to)}T00:00:00+05:30` };
}

export function groupPurchases(
  rows: readonly PurchaseRow[],
  products: ReadonlyMap<string, { code: string; name: string; groupName: string; unit: Unit }>,
): PurchaseLine[] {
  const grouped = new Map<string, PurchaseLine>();
  for (const row of rows) {
    const product = products.get(row.productId);
    if (!product) continue;
    const date = shopDate(row.createdAt);
    const supplierName = row.supplierName.trim();
    const supplierBillNo = row.supplierBillNo.trim();
    const key = `${date}\u0000${row.productId}\u0000${supplierName}\u0000${supplierBillNo}`;
    const current = grouped.get(key);
    const lineCost = row.cost == null ? null : Math.round(row.quantity * row.cost * 100) / 100;
    if (current) {
      current.quantity = Math.round((current.quantity + row.quantity) * 1000) / 1000;
      current.inventoryNos.push(row.inventoryNo);
      if (lineCost != null) current.cost = Math.round(((current.cost ?? 0) + lineCost) * 100) / 100;
    } else {
      grouped.set(key, {
        date,
        productId: row.productId,
        productCode: product.code,
        groupName: product.groupName,
        productName: product.name,
        unit: product.unit,
        quantity: row.quantity,
        inventoryNos: [row.inventoryNo],
        supplierName,
        supplierBillNo,
        cost: lineCost,
      });
    }
  }
  return [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date) || a.productCode.localeCompare(b.productCode));
}

export function formatPurchaseNumbers(numbers: readonly string[]): string {
  if (numbers.length === 0) return "—";
  const only = numbers[0];
  if (numbers.length === 1) return only ?? "—";
  const parsed = numbers.flatMap((value) => {
    const match = /^(\D*)(\d+)$/.exec(value.trim());
    if (!match?.[2]) return [];
    const n = Number(match[2]);
    if (!Number.isSafeInteger(n)) return [];
    return [{ prefix: match[1] ?? "", n, raw: value.trim() }];
  });
  if (parsed.length !== numbers.length) return `${numbers.length} numbers`;
  const sorted = [...parsed].sort((a, b) => a.n - b.n);
  const prefix = sorted[0]?.prefix;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last || sorted.some((item) => item.prefix !== prefix)) return `${numbers.length} numbers`;
  const unique = new Set(sorted.map((item) => item.n));
  if (unique.size === numbers.length && last.n - first.n + 1 === numbers.length) {
    return first.n === last.n ? first.raw : `${first.raw} – ${last.raw}`;
  }
  return `${numbers.length} numbers`;
}

function nextCalendarDay(value: string): string {
  const [year, month, date] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function barcodeNumbers(starting: string, count: number): string[] {
  const match = /^(\D*)(\d+)$/.exec(starting.trim());
  if (!match?.[2]) return [];
  const origin = Number(match[2]);
  if (!Number.isSafeInteger(origin) || !Number.isSafeInteger(origin + count - 1)) return [];
  const prefix = match[1] ?? "";
  const width = match[2].length;
  const numbers: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const next = String(origin + offset);
    numbers.push(prefix + next.padStart(Math.max(width, next.length), "0"));
  }
  return numbers;
}

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
