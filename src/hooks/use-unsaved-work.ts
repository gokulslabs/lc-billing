import { useEffect } from "react";
import { markUnsaved } from "@/lib/unsaved";

export function useUnsavedWork(id: string, dirty: boolean) {
  useEffect(() => {
    markUnsaved(id, dirty);
    return () => markUnsaved(id, false);
  }, [id, dirty]);
}
