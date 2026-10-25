import { Hono } from "hono";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { passwordProblem } from "@/lib/password";
import { customerRoutes } from "@/server/customers";
import { dashboardRoutes } from "@/server/dashboard";
import { inventoryRoutes } from "@/server/inventory";
import { salesRoutes } from "@/server/sales";
import { reportRoutes } from "@/server/reports";
import { settingsRoutes } from "@/server/settings";
import { stitchingRoutes } from "@/server/stitching";
import { productGroupRoutes, productRoutes } from "@/server/products";
import { readAll } from "@/server/read-all";
import {
  blankToNull,
  isDepartment,
  createEmployeeSchema,
  setPasswordSchema,
  updateEmployeeSchema,
  wouldRemoveLastAdmin,
  zodMessage,
  type AppRole,
  type Employee,
} from "@/lib/employees";

type Variables = { userId: string };

type EmployeeRow = {
  id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  department: string;
  gender: string | null;
  address: string | null;
  created_at: string;
};

const api = new Hono<{ Variables: Variables }>();

api.use("/api/*", async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return c.json({ error: "Sign in required." }, 401);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return c.json({ error: "Sign in required." }, 401);

  c.set("userId", data.user.id);
  return next();
});

const employees = new Hono<{ Variables: Variables }>();

employees.use("*", async (c, next) => {
  const userId = c.get("userId");
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (error) return c.json({ error: "Could not check access." }, 500);
  if (!data?.some((row) => row.role === "admin")) {
    return c.json({ error: "Only an admin can manage employees." }, 403);
  }
  return next();
});

employees.get("/", async (c) => {
  const loaded = await readAll<EmployeeRow>((from, to) =>
    supabaseAdmin
      .from("employees")
      .select("id, full_name, email, mobile, department, gender, address, created_at")
      .order("full_name")
      .order("id")
      .range(from, to),
  );
  if (!loaded) return c.json({ error: "Could not load employees." }, 500);

  const roles = await loadRoles();
  if (!roles) return c.json({ error: "Could not load access." }, 500);

  const rows = loaded.rows;
  return c.json({ employees: rows.map((row) => toEmployee(row, roles.get(row.id) ?? "staff")) });
});

employees.post("/", async (c) => {
  const parsed = createEmployeeSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);

  const input = parsed.data;
  const problem = passwordProblem(input.password, input.email);
  if (problem) return c.json({ error: problem }, 400);

  const email = input.email.toLowerCase();
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (createError || !created.user) {
    const message = /already|registered|exists/i.test(createError?.message ?? "")
      ? "An account with that email already exists."
      : "Could not create the account.";
    return c.json({ error: message }, 400);
  }

  const user = created.user;
  const saved = await saveEmployee(user, {
    fullName: input.fullName,
    email,
    mobile: blankToNull(input.mobile),
    department: input.department,
    gender: blankToNull(input.gender),
    address: blankToNull(input.address),
    role: input.role,
  });
  if ("error" in saved) {
    await supabaseAdmin.auth.admin.deleteUser(user.id);
    return c.json({ error: saved.error }, 500);
  }
  return c.json({ employee: saved.employee }, 201);
});

employees.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = updateEmployeeSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);

  const existing = await findEmployee(id);
  if (!existing) return c.json({ error: "Employee not found." }, 404);

  const input = parsed.data;
  if (!isDepartment(input.department) && input.department !== existing.department) {
    return c.json({ error: "Choose a department." }, 400);
  }
  const roleChange = await setRole(id, input.role);
  if (roleChange) return c.json({ error: roleChange }, 400);

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ full_name: input.fullName })
    .eq("id", id);
  if (profileError) return c.json({ error: "Could not update the profile." }, 500);

  const { error } = await supabaseAdmin
    .from("employees")
    .update({
      full_name: input.fullName,
      mobile: blankToNull(input.mobile),
      department: input.department,
      gender: blankToNull(input.gender),
      address: blankToNull(input.address),
    })
    .eq("id", id);
  if (error) return c.json({ error: "Could not update the employee." }, 500);

  const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(id, {
    user_metadata: { full_name: input.fullName },
  });
  if (metaError) return c.json({ error: "Could not update the account." }, 500);

  return c.json({
    employee: toEmployee(
      {
        ...existing,
        full_name: input.fullName,
        mobile: blankToNull(input.mobile),
        department: input.department,
        gender: blankToNull(input.gender),
        address: blankToNull(input.address),
      },
      input.role,
    ),
  });
});

employees.post("/:id/password", async (c) => {
  const id = c.req.param("id");
  const parsed = setPasswordSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);

  const existing = await findEmployee(id);
  if (!existing) return c.json({ error: "Employee not found." }, 404);

  const problem = passwordProblem(parsed.data.password, existing.email);
  if (problem) return c.json({ error: problem }, 400);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password: parsed.data.password });
  if (error) return c.json({ error: "Could not update the password." }, 500);
  return c.json({ ok: true });
});

api.route("/api/dashboard", dashboardRoutes);
api.route("/api/employees", employees);
api.route("/api/product-groups", productGroupRoutes);
api.route("/api/products", productRoutes);
api.route("/api/customers", customerRoutes);
api.route("/api/inventory", inventoryRoutes);
api.route("/api/invoices", salesRoutes);
api.route("/api/reports", reportRoutes);
api.route("/api/stitching-orders", stitchingRoutes);
api.route("/api/settings", settingsRoutes);

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

async function loadRoles(): Promise<Map<string, AppRole> | null> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("user_id, role");
  if (error) return null;
  const roles = new Map<string, AppRole>();
  for (const row of data ?? []) {
    const current = roles.get(row.user_id);
    if (row.role === "admin" || !current) roles.set(row.user_id, row.role);
  }
  return roles;
}

async function adminIds(): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  if (error) return null;
  return (data ?? []).map((row) => row.user_id);
}

async function setRole(userId: string, role: AppRole): Promise<string | null> {
  const admins = await adminIds();
  if (!admins) return "Could not check access.";
  if (wouldRemoveLastAdmin(admins, userId, role)) return "The shop needs at least one admin.";

  const { error: deleteError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  if (deleteError) return "Could not update access.";
  const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
  if (error) return "Could not update access.";
  return null;
}

async function findEmployee(id: string): Promise<EmployeeRow | null> {
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("id, full_name, email, mobile, department, gender, address, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as EmployeeRow;
}

async function saveEmployee(
  user: User,
  input: {
    fullName: string;
    email: string;
    mobile: string | null;
    department: string;
    gender: string | null;
    address: string | null;
    role: AppRole;
  },
): Promise<{ employee: Employee } | { error: string }> {
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ full_name: input.fullName })
    .eq("id", user.id);
  if (profileError) return { error: "Could not save the profile." };

  const { error: insertError } = await supabaseAdmin.from("employees").insert({
    id: user.id,
    full_name: input.fullName,
    email: input.email,
    mobile: input.mobile,
    department: input.department,
    gender: input.gender,
    address: input.address,
  });
  if (insertError) return { error: "Could not save the employee." };

  const roleError = await setRole(user.id, input.role);
  if (roleError) return { error: roleError };

  return {
    employee: toEmployee(
      {
        id: user.id,
        full_name: input.fullName,
        email: input.email,
        mobile: input.mobile,
        department: input.department,
        gender: input.gender,
        address: input.address,
        created_at: new Date().toISOString(),
      },
      input.role,
    ),
  };
}

function toEmployee(row: EmployeeRow, role: AppRole): Employee {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    mobile: row.mobile,
    department: row.department,
    gender: row.gender,
    address: row.address,
    role,
  };
}

export { api };
