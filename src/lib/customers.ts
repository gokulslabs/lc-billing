import { z } from "zod";

export type Customer = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  bookNo: string | null;
};

export type CustomerBillLine = {
  inventoryNo: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type CustomerPayment = {
  paidOn: string;
  amount: number;
  mode: string | null;
};

export type CustomerBill = {
  id: string;
  billNo: string;
  billedOn: string;
  status: string;
  total: number;
  collected: number;
  balance: number;
  lines: CustomerBillLine[];
  payments: CustomerPayment[];
};

export type CustomerOrder = {
  id: string;
  orderNo: string;
  garment: string;
  bagNo: string | null;
  orderedOn: string;
  deliveryOn: string | null;
  status: string;
  amount: number;
};

export type CustomerHistory = {
  customer: Customer;
  bills: CustomerBill[];
  billTotal: number;
  billPage: number;
  billed: number;
  collected: number;
  orders: CustomerOrder[];
  orderTotal: number;
  orderPage: number;
};

const optionalText = (max: number) => z.string().trim().max(max);

export const UNRECORDED_NAME = "NOT RECORDED";
export const UNRECORDED_BILL_ERROR = "Choose a customer, or type a walk-in name. NOT RECORDED cannot take a bill.";

export function isUnrecordedName(name: string): boolean {
  return name.trim().toUpperCase() === UNRECORDED_NAME;
}

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(120, "Name is too long.")
    .refine((name) => !isUnrecordedName(name), UNRECORDED_BILL_ERROR),
  address: optionalText(300),
  phone: optionalText(20),
  bookNo: optionalText(40),
  confirmDuplicate: z.boolean().optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
