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

export const inventoryUpdateSchema = inventorySchema.extend({
  quantity: z.number().min(0, "Quantity cannot be negative.").max(999_999, "Quantity is too large."),
});

export const barcodeSchema = z.object({
  starting: z.string().trim().min(1, "Enter a starting number.").max(12, "Starting number is too long."),
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
  for (const value of existing) {
    if (!/^\d+$/.test(value)) continue;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) max = Math.max(max, parsed);
  }
  return String(max + 1);
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
};

export type PurchaseRow = {
  createdAt: string;
  inventoryNo: string;
  productId: string;
  quantity: number;
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
    const key = `${date}\u0000${row.productId}`;
    const current = grouped.get(key);
    if (current) {
      current.quantity = Math.round((current.quantity + row.quantity) * 1000) / 1000;
      current.inventoryNos.push(row.inventoryNo);
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
  const width = starting.length;
  const origin = Number(starting);
  const numbers: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    numbers.push(String(origin + offset).padStart(width, "0"));
  }
  return numbers;
}

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
