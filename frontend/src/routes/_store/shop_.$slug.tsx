import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/components/store/cart-state";
import { eyebrow, Price, Quantity, Rating, wrap } from "@/components/store/catalog";
import { Button } from "@/components/ui/button";
import { trialOutfits } from "@/lib/trial-room";
import { MAX_QUANTITY, productById, storeImage, type StoreProduct } from "@/lib/storefront";

export const Route = createFileRoute("/_store/shop_/$slug")({
  loader: ({ params }) => {
    const product = productById.get(params.slug);
    if (!product) throw notFound();
    return product;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "Product"} | Ladies Collections` }],
  }),
  component: () => {
    const product = Route.useLoaderData();
    return <ProductDetail key={product.id} product={product} />;
  },
});

function ProductDetail({ product }: { product: StoreProduct }) {
  const { cart, add, ready } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [detail, setDetail] = useState(false);
  const remaining = MAX_QUANTITY - (cart[product.id] ?? 0);
  const selected = Math.min(quantity, Math.max(1, remaining));
  const photo = storeImage(product.category.image);
  return (
    <div className={`${wrap} pt-6 sm:pt-10`}>
      <Link
        to="/shop"
        search={{ category: product.category.id }}
        className="store-editorial-link mb-6"
      >
        <ArrowLeft size={16} /> Back to {product.category.label}
      </Link>
      <div className="grid gap-7 md:grid-cols-2 md:gap-12">
        <div>
          <div className="store-gallery aspect-[1.12] overflow-hidden bg-secondary">
            <img
              src={photo}
              alt={detail ? `${product.name}, close-up` : product.name}
              className={`size-full object-cover motion-safe:transition-transform motion-safe:duration-500 ${detail ? "scale-150" : ""}`}
            />
          </div>
          <div className="mt-3 flex gap-2" role="group" aria-label="Product gallery">
            {[false, true].map((isDetail) => (
              <button
                key={String(isDetail)}
                type="button"
                aria-label={isDetail ? "View close-up" : "View full photo"}
                aria-pressed={detail === isDetail}
                onClick={() => setDetail(isDetail)}
                className="size-16 overflow-hidden rounded-md border-2 border-transparent aria-pressed:border-primary"
              >
                <img
                  src={photo}
                  alt=""
                  className={`size-full object-cover ${isDetail ? "scale-150" : ""}`}
                />
              </button>
            ))}
          </div>
        </div>
        <section className="flex flex-col items-start justify-center md:px-4">
          <p className={eyebrow}>{product.category.label}</p>
          <h1 className="mt-2 text-5xl leading-[.94] font-semibold sm:text-7xl">{product.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Rating product={product} />
            {product.discountPercent > 0 && (
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                {product.discountPercent}% off
              </span>
            )}
          </div>
          <div className="mt-5 border-y py-3 text-xl">
            <Price product={product} />
          </div>
          <p className="mt-4 max-w-lg text-base text-muted-foreground">{product.description}</p>
          {trialOutfits.some((outfit) => outfit.id === product.id) && (
            <Link
              to="/trial-room"
              search={{ outfit: product.id }}
              className="store-editorial-link mt-5"
            >
              <Sparkles size={15} /> Try this on
            </Link>
          )}
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">
              {product.unit === "MT" ? "Metres" : "Quantity"}
            </p>
            <Quantity value={selected} onChange={setQuantity} max={remaining} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="lg"
              className="store-action"
              disabled={!ready || remaining <= 0}
              onClick={() => {
                add(product.id, selected);
                toast.success("Added to your bag", { description: product.name });
              }}
            >
              <ShoppingBag /> {remaining > 0 ? "Add to bag" : "Bag limit reached"}
            </Button>
            {(cart[product.id] ?? 0) > 0 && (
              <Button asChild variant="outline" size="lg" className="store-action">
                <Link to="/cart">View bag</Link>
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
