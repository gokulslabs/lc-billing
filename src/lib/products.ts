import { z } from "zod";

export const UNITS = ["NO", "MT"] as const;
export type Unit = (typeof UNITS)[number];

export type ProductGroup = {
  id: string;
  name: string;
  code: string;
  discountPercent: number;
  productCount: number;
};

export type Product = {
  id: string;
  groupId: string;
  groupName: string;
  groupCode: string;
  discountPercent: number;
  code: string;
  name: string;
  unit: Unit;
  price: number;
};

const groupCode = z
  .string()
  .trim()
  .min(1, "Enter a group code.")
  .max(12, "Group code is too long.")
  .transform((value) => value.toUpperCase());

export const productGroupSchema = z.object({
  name: z.string().trim().min(1, "Enter a group name.").max(80, "Group name is too long."),
  code: groupCode,
  discountPercent: z.number().min(0, "Discount cannot be negative.").max(100, "Discount cannot pass 100."),
});

export const productSchema = z.object({
  groupId: z.string().uuid("Choose a product group."),
  name: z.string().trim().min(1, "Enter a product name.").max(120, "Product name is too long."),
  code: z
    .string()
    .trim()
    .max(40, "Product code is too long.")
    .transform((value) => value.toUpperCase()),
  unit: z.enum(UNITS, { message: "Choose pieces or metres." }),
  price: z.number().min(0, "Price cannot be negative.").max(9_999_999, "Price is too large."),
});

export type ProductGroupInput = z.infer<typeof productGroupSchema>;
export type ProductInput = z.infer<typeof productSchema>;

export function unitLabel(unit: string): string {
  if (unit === "NO") return "Piece";
  if (unit === "MT") return "Metre";
  return unit;
}

export function formatRupees(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

export function nextProductCode(groupCode: string, existingCodes: readonly string[]): string {
  const prefix = groupCode.trim().toUpperCase();
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  let max = 0;
  for (const code of existingCodes) {
    const match = pattern.exec(code.trim().toUpperCase());
    const serial = match?.[1] ? Number(match[1]) : 0;
    if (Number.isFinite(serial)) max = Math.max(max, serial);
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
