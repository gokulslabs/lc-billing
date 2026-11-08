import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ fallback = "/dashboard" }: { fallback?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-full"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign(fallback);
      }}
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );
}
