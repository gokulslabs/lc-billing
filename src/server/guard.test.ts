import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, setRoleRows } = vi.hoisted(() => {
  let roleRows: { data: { role: string }[] | null; error: null } = { data: [], error: null };
  let filters: [string, string][] = [];
  const builder = {
    select: vi.fn(() => {
      filters = [];
      return builder;
    }),
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return builder;
    }),
    then: (resolve: (value: typeof roleRows) => unknown, reject?: (reason: unknown) => unknown) => {
      const data =
        roleRows.data?.filter((row) =>
          filters.every(([column, value]) => column !== "role" || row.role === value),
        ) ?? null;
      return Promise.resolve({ ...roleRows, data }).then(resolve, reject);
    },
  };
  const from = vi.fn(() => builder);
  const setRoleRows = (rows: { role: string }[]) => {
    roleRows = { data: rows, error: null };
  };
  return { from, setRoleRows };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from },
}));

import { denyUnlessAdmin, requireShop } from "./guard";

function shopApp() {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", async (c, next) => {
    c.set("userId", "test-user");
    await next();
  });
  app.get("/shop", requireShop, (c) => c.text("shop data"));
  app.get("/admin-export", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
    return c.text("export data");
  });
  return app;
}

describe("shop role guards", () => {
  beforeEach(() => {
    from.mockClear();
    setRoleRows([]);
  });

  it("blocks an authenticated account without a shop role", async () => {
    const response = await shopApp().request("/shop");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You do not have access to the shop.",
    });
  });

  it("allows a staff role into shop routes but blocks admin-only exports", async () => {
    setRoleRows([{ role: "staff" }]);
    const app = shopApp();

    expect((await app.request("/shop")).status).toBe(200);
    const exportResponse = await app.request("/admin-export");
    expect(exportResponse.status).toBe(403);
    await expect(exportResponse.json()).resolves.toEqual({ error: "Only an admin can export." });
  });

  it("allows an admin role to use shop routes and admin-only exports", async () => {
    setRoleRows([{ role: "admin" }]);
    const app = shopApp();

    expect((await app.request("/shop")).status).toBe(200);
    expect((await app.request("/admin-export")).status).toBe(200);
  });
});
