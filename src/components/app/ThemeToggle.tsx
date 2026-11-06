import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyShopTheme, storedShopTheme, type ShopTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const [theme, setTheme] = useState<ShopTheme>("light");

  useEffect(() => {
    setTheme(storedShopTheme());
  }, []);

  const dark = theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "rounded-full",
        iconOnly ? "h-8 w-8 px-0" : "w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0",
        className,
      )}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next: ShopTheme = dark ? "light" : "dark";
        applyShopTheme(next);
        setTheme(next);
      }}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {iconOnly ? null : <span className="group-data-[collapsible=icon]:hidden">{dark ? "Light mode" : "Dark mode"}</span>}
    </Button>
  );
}
