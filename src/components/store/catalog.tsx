import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Minus, Plus, Star } from "lucide-react";
import { formatRupees } from "@/lib/products";
import { MAX_QUANTITY, salePrice, storeImage, type StoreProduct } from "@/lib/storefront";

export const wrap = "mx-auto w-full max-w-[100rem] px-4 sm:px-8";
export const eyebrow = "store-editorial-label text-primary";
export const field =
  "store-field w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function Price({ product }: { product: StoreProduct }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-semibold">{formatRupees(salePrice(product))}</span>
      {product.discountPercent > 0 && (
        <del className="text-sm text-muted-foreground">{formatRupees(product.price)}</del>
      )}
      {product.unit === "MT" && <span className="text-xs text-muted-foreground">/ metre</span>}
    </div>
  );
}

export function Rating({ product }: { product: StoreProduct }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      aria-label={`Sample rating ${product.rating} out of 5`}
    >
      <Star size={13} className="fill-primary text-primary" /> {product.rating.toFixed(1)}
    </span>
  );
}

export function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <article className="group store-product min-w-0">
      <Link
        to="/shop/$slug"
        params={{ slug: product.id }}
        className="block focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="store-image store-product-photo">
          <img
            src={storeImage(product.category.image)}
            alt={product.name}
            loading="lazy"
            decoding="async"
          />
          {product.discountPercent > 0 && (
            <span className="store-product-badge">{product.discountPercent}% off</span>
          )}
          <span className="store-product-arrow">
            <ArrowUpRight size={17} />
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
            {product.category.label}
          </span>
          <Rating product={product} />
        </div>
        <h3 className="mt-1 text-[1.35rem] leading-tight font-semibold transition-colors group-hover:text-primary sm:text-[1.75rem]">
          {product.name}
        </h3>
        <div className="mt-1.5 text-sm">
          <Price product={product} />
        </div>
      </Link>
    </article>
  );
}

export function Quantity({
  value,
  onChange,
  label = "Quantity",
  max = MAX_QUANTITY,
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  max?: number;
}) {
  return (
    <div
      className="inline-flex w-fit items-center rounded-full border bg-card"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="grid size-10 place-items-center rounded-full hover:bg-accent disabled:opacity-30"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
      >
        <Minus size={15} />
      </button>
      <output aria-live="polite" className="min-w-7 text-center text-sm tabular-nums">
        {value}
      </output>
      <button
        type="button"
        className="grid size-10 place-items-center rounded-full hover:bg-accent disabled:opacity-30"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
