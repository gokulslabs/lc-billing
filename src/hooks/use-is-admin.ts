import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const { data: roles } = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [];
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return data.map((row) => row.role);
    },
  });
  return roles?.includes("admin") ?? false;
}
