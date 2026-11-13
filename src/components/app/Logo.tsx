export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-white shadow-[var(--shadow-soft)] ${
          big ? "h-14 w-14" : "h-10 w-10"
        }`}
      >
        <img src="/lc-logo.png?v=20261113-admin" alt="" className="h-full w-full rounded-full object-contain" />
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
