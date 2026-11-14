import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NEW_COUNTER_FROM, shopToday } from "@/lib/sales";
import { requireShop } from "@/server/guard";

type Env = { Variables: { userId: string } };

const dashboard = new Hono<Env>();
dashboard.use("*", requireShop);

dashboard.get("/", async (c) => {
  const { data: stats, error } = await supabaseAdmin.rpc("shop_dashboard_summary", {
    p_day: shopToday(),
    p_new_counter_from: NEW_COUNTER_FROM,
  });
  if (error || !stats) return c.json({ error: "Could not load the dashboard." }, 500);
  return c.json({ stats });
});

export { dashboard as dashboardRoutes };
