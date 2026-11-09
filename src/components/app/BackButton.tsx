import { ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-full"
      onClick={() => {
        if (router.history.canGoBack()) router.history.back();
        else void router.navigate({ to: "/dashboard", replace: true });
      }}
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );
}
