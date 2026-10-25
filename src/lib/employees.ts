import { z } from "zod";

export const DEPARTMENTS = ["ADMIN", "SALES", "STORES", "TAILORING", "MASTERS", "HO"] as const;
export const GENDERS = ["MALE", "FEMALE"] as const;
export const APP_ROLES = ["admin", "staff"] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type Gender = (typeof GENDERS)[number];
export type AppRole = (typeof APP_ROLES)[number];

export type Employee = {
  id: string;
  fullName: string;
  email: string;
  mobile: string | null;
  department: string;
  gender: string | null;
  address: string | null;
  role: AppRole;
};

const DEPARTMENT_LABELS: Record<Department, string> = {
  ADMIN: "Admin",
  SALES: "Sales",
  STORES: "Stores",
  TAILORING: "Tailoring",
  MASTERS: "Masters",
  HO: "Head office",
};

const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
};

export function isDepartment(value: string): value is Department {
  return (DEPARTMENTS as readonly string[]).includes(value);
}

export function departmentLabel(code: string): string {
  return DEPARTMENT_LABELS[code as Department] ?? code;
}

export function genderLabel(code: string | null): string {
  if (!code) return "—";
  return GENDER_LABELS[code as Gender] ?? code;
}

export function roleLabel(role: AppRole): string {
  return role === "admin" ? "Admin" : "Staff";
}

const optionalText = (max: number) => z.string().trim().max(max);

export const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name.").max(80, "Name is too long."),
  email: z.string().trim().email("Enter a valid email.").max(200),
  password: z.string().min(1, "Enter a password."),
  mobile: optionalText(20),
  department: z.enum(DEPARTMENTS, { message: "Choose a department." }),
  gender: z.union([z.enum(GENDERS), z.literal("")]),
  address: optionalText(300),
  role: z.enum(APP_ROLES, { message: "Choose access." }),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name.").max(80, "Name is too long."),
  mobile: optionalText(20),
  department: z.string().trim().min(1, "Choose a department.").max(40),
  gender: z.union([z.enum(GENDERS), z.literal("")]),
  address: optionalText(300),
  role: z.enum(APP_ROLES, { message: "Choose access." }),
});

export const setPasswordSchema = z.object({
  password: z.string().min(1, "Enter a password."),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function wouldRemoveLastAdmin(adminIds: readonly string[], userId: string, nextRole: AppRole): boolean {
  return nextRole !== "admin" && adminIds.length === 1 && adminIds.includes(userId);
}

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
