import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CircleCheck, ShoppingBag } from "lucide-react";
import { useState, type FormEvent } from "react";
import { cartLines, useCart } from "@/components/store/cart-state";
import { eyebrow, field, wrap } from "@/components/store/catalog";
import { Button } from "@/components/ui/button";
import { formatRupees } from "@/lib/products";

export const Route = createFileRoute("/_store/checkout")({
  head: () => ({ meta: [{ title: "Checkout | Ladies Collections" }] }),
  component: Checkout,
});

function Checkout() {
  const { cart, ready, clear } = useCart();
  const lines = cartLines(cart);
  const [receipt, setReceipt] = useState<{
    reference: string;
    lines: ReturnType<typeof cartLines>;
  }>();
  const summary = receipt?.lines ?? lines;
  const subtotal = summary.reduce((sum, line) => sum + line.amount, 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length || receipt) return;
    const reference = crypto
      .getRandomValues(new Uint32Array(1))[0]!
      .toString(16)
      .padStart(8, "0")
      .toUpperCase();
    setReceipt({ reference: `LC-DEMO-${reference}`, lines });
    clear();
    window.scrollTo({ top: 0 });
  }

  return (
    <div className={`${wrap} pt-8 sm:pt-12`}>
      <Link to="/cart" className="store-editorial-link">
        <ArrowLeft size={16} /> Back to bag
      </Link>
      <p className={`${eyebrow} mt-6`}>Preview checkout</p>
      <h1 className="mt-1 text-5xl font-semibold sm:text-6xl">
        {receipt ? "Sample order complete" : "Checkout"}
      </h1>
      {!ready ? (
        <p className="mt-6 text-muted-foreground" role="status">
          Loading your bag…
        </p>
      ) : !summary.length ? (
        <div className="store-surface mt-6 py-12 text-center">
          <ShoppingBag className="mx-auto mb-3 text-primary" />
          <h2 className="text-3xl font-semibold">Your bag is empty</h2>
          <Button asChild className="store-action mt-5">
            <Link to="/shop" search={{}}>
              Explore the collection
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-5 md:grid-cols-[1fr_22rem]">
          {receipt ? (
            <div role="status" className="store-surface p-6">
              <CircleCheck className="mb-3 text-primary" />
              <h2 className="text-3xl font-semibold">Thank you for trying the boutique</h2>
              <p className="mt-2 text-muted-foreground">
                Preview reference <strong>{receipt.reference}</strong>
              </p>
              <p className="mt-2 text-muted-foreground">
                Your sample checkout is complete. The boutique has not received a purchase or
                payment.
              </p>
              <Button asChild className="store-action mt-5">
                <Link to="/shop" search={{}}>
                  Continue shopping <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : (
            <form
              id="store-checkout"
              onSubmit={submit}
              className="store-surface grid gap-4 p-4 sm:grid-cols-2 sm:p-6"
            >
              <div className="sm:col-span-2">
                <h2 className="text-3xl font-semibold">Contact and delivery</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use sample details to try checkout. This preview does not take payments or submit
                  your details.
                </p>
              </div>
              <CheckoutField label="Full name" name="name" autoComplete="name" maxLength={100} />
              <CheckoutField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={160}
              />
              <CheckoutField
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                pattern={"\\+?[0-9][0-9 ]{5,17}[0-9]"}
                maxLength={20}
              />
              <CheckoutField
                label="Postal code"
                name="postal"
                autoComplete="postal-code"
                maxLength={12}
              />
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                Street address
                <textarea
                  name="address"
                  autoComplete="street-address"
                  className={field}
                  required
                  rows={2}
                  maxLength={250}
                />
              </label>
              <CheckoutField
                label="City"
                name="city"
                autoComplete="address-level2"
                maxLength={80}
              />
              <CheckoutField
                label="State"
                name="state"
                autoComplete="address-level1"
                maxLength={80}
              />
              <Button type="submit" className="store-action mt-2 w-fit sm:col-span-2">
                Place sample order <ArrowRight />
              </Button>
            </form>
          )}
          <aside className="store-surface store-summary p-5 sm:p-6">
            <h2 className="text-3xl font-semibold">Order summary</h2>
            <ul className="my-3 divide-y">
              {summary.map(({ product, quantity, amount }) => (
                <li key={product.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    {product.name}{" "}
                    <span className="text-muted-foreground">
                      × {quantity}
                      {product.unit === "MT" ? " m" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">{formatRupees(amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-3 border-t pt-3">
              <span>Subtotal</span>
              <strong>{formatRupees(subtotal)}</strong>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function CheckoutField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <input {...props} required className={field} />
    </label>
  );
}
