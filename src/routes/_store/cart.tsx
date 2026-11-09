import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { cartLines, useCart } from "@/components/store/cart-state";
import { eyebrow, Quantity, wrap } from "@/components/store/catalog";
import { Button } from "@/components/ui/button";
import { formatRupees } from "@/lib/products";
import { salePrice, storeImage } from "@/lib/storefront";

export const Route = createFileRoute("/_store/cart")({
  head: () => ({ meta: [{ title: "Shopping bag | Ladies Collections" }] }),
  component: CartPage,
});

function CartPage() {
  const { cart, ready, setQuantity } = useCart();
  const lines = cartLines(cart);
  return (
    <div className={`${wrap} pt-8 sm:pt-12`}>
      <Link to="/shop" search={{}} className="store-editorial-link">
        <ArrowLeft size={16} /> Continue shopping
      </Link>
      <p className={`${eyebrow} mt-6`}>Your selection</p>
      <h1 className="mt-1 text-5xl font-semibold sm:text-6xl">Shopping bag</h1>
      {!ready ? (
        <p className="mt-6 text-muted-foreground" role="status">
          Loading your bag…
        </p>
      ) : lines.length === 0 ? (
        <div className="store-surface mt-6 py-12 text-center">
          <ShoppingBag className="mx-auto mb-3 text-primary" />
          <h2 className="text-3xl font-semibold">Your bag is empty</h2>
          <Button asChild className="store-action mt-5">
            <Link to="/shop" search={{}}>
              Explore the collection <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-5 md:grid-cols-[1fr_21rem]">
          <ul className="store-surface divide-y">
            {lines.map(({ product, quantity, amount }) => (
              <li
                key={product.id}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-4 sm:p-4"
              >
                <Link to="/shop/$slug" params={{ slug: product.id }} aria-label={product.name}>
                  <img
                    src={storeImage(product.category.image)}
                    alt=""
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                </Link>
                <div className="min-w-0">
                  <Link
                    to="/shop/$slug"
                    params={{ slug: product.id }}
                    className="font-display text-xl leading-tight font-semibold hover:text-primary sm:text-2xl"
                  >
                    {product.name}
                  </Link>
                  <p className="mb-2 text-sm text-muted-foreground">
                    {formatRupees(salePrice(product))}
                    {product.unit === "MT" ? " / metre" : " each"}
                  </p>
                  <Quantity
                    value={quantity}
                    onChange={(value) => setQuantity(product.id, value)}
                    label={`${product.name} quantity`}
                  />
                </div>
                <div className="col-start-2 flex items-center justify-between gap-3 sm:col-start-auto sm:flex-col sm:items-end">
                  <span className="font-semibold">{formatRupees(amount)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${product.name}`}
                    onClick={() => setQuantity(product.id, 0)}
                    className="inline-flex items-center gap-1.5 rounded-md p-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <aside className="store-surface store-summary p-5 sm:p-6">
            <h2 className="text-3xl font-semibold">Bag summary</h2>
            <div className="my-4 flex justify-between gap-2 border-y py-3">
              <span>Subtotal</span>
              <strong>{formatRupees(lines.reduce((sum, line) => sum + line.amount, 0))}</strong>
            </div>
            <Button asChild className="store-action w-full">
              <Link to="/checkout">
                Continue to checkout <ArrowRight />
              </Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Preview checkout for the sample collection.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
