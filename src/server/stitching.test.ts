import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from },
}));

vi.mock("@/server/guard", () => ({
  requireShop: async (_context: unknown, next: () => Promise<void>) => next(),
  denyUnlessAdmin: vi.fn(),
}));

import { stitchingRoutes } from "./stitching";

function query(result: { data: unknown[]; error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "in"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("stitching garment options API", () => {
  beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => {
      if (table === "stitching_products") {
        return query({ data: [{ id: "garment-1", name: "BLOUSE", sort_order: 1 }], error: null });
      }
      if (table === "stitching_measurement_fields") return query({ data: [], error: null });
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("serves garment options at the path used by the stitching editor", async () => {
    const response = await stitchingRoutes.request("/products");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [{ id: "garment-1", name: "BLOUSE", measurements: [] }],
    });
  });
});
