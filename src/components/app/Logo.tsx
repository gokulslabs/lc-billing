import { Flower2 } from "lucide-react";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)] ${
          big ? "h-14 w-14" : "h-10 w-10"
        }`}
      >
        <Flower2 className={big ? "h-7 w-7" : "h-5 w-5"} />
      </div>
      <div className="leading-none">
        <div className={`font-display font-semibold text-foreground ${big ? "text-3xl" : "text-xl"}`}>
          Ladies Collections
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Boutique Manager
        </div>
      </div>
    </div>
  );
}
