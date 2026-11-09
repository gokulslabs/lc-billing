import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  ArrowUpRight,
  LogOut,
  Search,
  ShoppingBag,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CartContext, type Cart } from "@/components/store/cart-state";
import { categories, MAX_QUANTITY, productById } from "@/lib/storefront";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_store")({ component: StoreLayout });
const cartKey = "lc-store-cart-v1";

function Brand() {
  return (
    <Link to="/" className="store-brand" aria-label="Ladies Collections home">
      <span className="store-brand-seal">
        <img src="/lc-logo.png" alt="" className="h-full w-full rounded-full object-contain" />
      </span>
      <span className="leading-none">
        <span className="store-brand-name">Ladies Collections</span>
        <span className="store-brand-caption">The Boutique</span>
      </span>
    </Link>
  );
}

function StoreLayout() {
  const [cart, setCart] = useState<Cart>({});
  const [ready, setReady] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(cartKey) ?? "{}");
      if (stored && typeof stored === "object") {
        setCart(
          Object.fromEntries(
            Object.entries(stored).filter(
              ([id, quantity]) =>
                productById.has(id) &&
                Number.isInteger(quantity) &&
                quantity > 0 &&
                quantity <= MAX_QUANTITY,
            ),
          ),
        );
      }
    } catch {
      /* Storage may be unavailable. */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(cartKey, JSON.stringify(cart));
      } catch {
        /* Keep the current bag in memory. */
      }
    }
  }, [cart, ready]);

  function update(id: string, quantity: number, increment = false) {
    if (!productById.has(id)) return;
    setCart((previous) => {
      const next = { ...previous };
      const amount = Math.min(MAX_QUANTITY, quantity + (increment ? (previous[id] ?? 0) : 0));
      if (amount > 0) next[id] = amount;
      else delete next[id];
      return next;
    });
  }

  const count = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  return (
    <CartContext.Provider
      value={{
        cart,
        ready,
        setQuantity: update,
        add: (id, quantity) => update(id, quantity, true),
        clear: () => setCart({}),
      }}
    >
      <div className="storefront-theme min-h-screen bg-background text-foreground">
        <a
          href="#store-main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-3"
        >
          Skip to content
        </a>
        <div className="store-announcement">
          <span aria-hidden="true">✦</span>
          <span>The Occasion Edit</span>
          <span className="store-announcement-divider" aria-hidden="true" />
          <span>A little celebration in every detail</span>
        </div>
        <header className="store-header">
          <div className="store-header-inner">
            <Brand />
            <nav className="store-navigation" aria-label="Shop navigation">
              <Link to="/" activeOptions={{ exact: true }}>
                Home
              </Link>
              <Link
                to="/shop"
                search={{ category: undefined }}
                activeOptions={{ exact: true, explicitUndefined: true }}
              >
                Shop all
              </Link>
              <Link
                to="/shop"
                search={{ category: "sarees" }}
                activeOptions={{ exact: true }}
                className="store-nav-category"
              >
                Sarees
              </Link>
              <Link
                to="/shop"
                search={{ category: "jewellery" }}
                activeOptions={{ exact: true }}
                className="store-nav-category"
              >
                Jewellery
              </Link>
              <Link
                to="/trial-room"
                search={{}}
                className="store-trial-button"
                activeOptions={{ exact: true, includeSearch: false }}
              >
                <Sparkles size={14} aria-hidden="true" /> AI Trial Room
              </Link>
            </nav>
            <div className="store-header-actions">
              <Link
                to="/shop"
                search={{}}
                hash="catalog-search"
                aria-label="Search products"
                className="store-header-action"
              >
                <Search size={19} strokeWidth={1.6} />
              </Link>
              {user ? (
                <button
                  type="button"
                  aria-label="Sign out of your account"
                  title="Sign out"
                  className="store-header-action"
                  onClick={() => void supabase.auth.signOut()}
                >
                  <LogOut size={18} strokeWidth={1.6} />
                </button>
              ) : (
                <Link
                  to="/auth"
                  aria-label="Customer sign in"
                  title="Customer sign in"
                  className="store-header-action"
                >
                  <UserRound size={19} strokeWidth={1.6} />
                </Link>
              )}
              <Link
                to="/cart"
                aria-label={`Shopping bag, ${count} items`}
                className="store-header-action store-bag-link"
              >
                <ShoppingBag size={19} strokeWidth={1.6} />
                <span className="store-bag-count">{count}</span>
              </Link>
            </div>
          </div>
        </header>
        <main id="store-main">
          <Outlet />
        </main>
        <footer className="store-footer">
          <div className="store-footer-inner">
            <div>
              <Brand />
              <p className="mt-5 max-w-xs text-sm store-footer-muted">
                Indian wear, thoughtful details and pieces worth dressing up for.
              </p>
            </div>
            <div>
              <h2 className="store-editorial-label mb-4">Explore the boutique</h2>
              <div className="grid w-fit grid-cols-2 gap-x-5 gap-y-2.5 text-sm">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    to="/shop"
                    search={{ category: category.id }}
                    className="store-footer-link"
                  >
                    {category.label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h2 className="store-editorial-label mb-4">Ladies Collections</h2>
              <p className="text-sm store-footer-muted">Sample collection · Preview checkout</p>
              <Link to="/auth" className="store-editorial-link store-on-garnet mt-4">
                Customer account <ArrowUpRight size={14} />
              </Link>
              <Link to="/admin-login" className="store-footer-link mt-3 block text-sm">
                Staff sign in
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </CartContext.Provider>
  );
}
