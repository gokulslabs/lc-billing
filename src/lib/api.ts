import { supabase } from "@/integrations/supabase/client";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body != null) headers.set("content-type", "application/json");

  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "Something went wrong.";
    throw new Error(message);
  }
  return payload as T;
}
