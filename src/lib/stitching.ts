import { z } from "zod";

export const STITCHING_STATUSES = ["PENDING", "READY", "DELIVERED"] as const;
export type StitchingStatus = (typeof STITCHING_STATUSES)[number];

export type StitchingMeasurement = {
  label: string;
  value: string;
};

export type StitchingField = {
  id: string;
  label: string;
  sortOrder: number;
};

export type StitchingProduct = {
  id: string;
  name: string;
  measurements: StitchingField[];
};

export type StitchingOrder = {
  id: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  bagNo: string | null;
  orderedOn: string;
  deliveryOn: string | null;
  status: StitchingStatus;
  amount: number;
  measurements: StitchingMeasurement[];
};

const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

export const measurementSchema = z.object({
  label: z.string().trim().max(40, "Measurement name is too long."),
  value: z.string().trim().max(40, "Measurement is too long."),
});

export const stitchingOrderSchema = z.object({
  customerId: z.string().uuid("Choose a customer."),
  productId: z.string().uuid("Choose a garment."),
  bagNo: z.string().trim().max(40, "Bag number is too long."),
  orderedOn: day,
  deliveryOn: z.string().trim(),
  status: z.enum(STITCHING_STATUSES, { message: "Choose a status." }),
  amount: z.number().min(0, "Amount cannot be negative.").max(9_999_999, "Amount is too large."),
  measurements: z.array(measurementSchema).max(40, "Too many measurements."),
});

export type StitchingOrderInput = z.infer<typeof stitchingOrderSchema>;

export function nextOrderNo(existing: readonly string[]): string {
  let max = 0;
  for (const value of existing) {
    if (!/^\d+$/.test(value)) continue;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) max = Math.max(max, parsed);
  }
  return String(max + 1);
}

export function cleanMeasurements(rows: readonly StitchingMeasurement[]): StitchingMeasurement[] | string {
  const kept: StitchingMeasurement[] = [];
  for (const row of rows) {
    const label = row.label.trim();
    const value = row.value.trim();
    if (!label && !value) continue;
    if (!label) return "Enter a measurement name.";
    if (!value) return "Enter a measurement value.";
    kept.push({ label: label.toUpperCase(), value });
  }
  return kept;
}

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
