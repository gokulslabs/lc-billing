import type { Context, MiddlewareHandler } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ShopEnv = { Variables: { userId: string } };

export const requireShop: MiddlewareHandler<ShopEnv> = async (c, next) => {
  const userId = c.get("userId");
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (error) return c.json({ error: "Could not check access." }, 500);
  if (!data?.length) return c.json({ error: "You do not have access to the shop." }, 403);
  return next();
};

export async function denyUnlessAdmin(c: Context): Promise<Response | null> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", c.get("userId")).eq("role", "admin");
  if (error) return c.json({ error: "Could not check access." }, 500);
  if (!data?.length) return c.json({ error: "Only an admin can export." }, 403);
  return null;
}
