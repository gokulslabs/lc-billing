import { createFileRoute } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { z } from "zod";
import { eyebrow, field, ProductCard, wrap } from "@/components/store/catalog";
import { Button } from "@/components/ui/button";
import { categories, salePrice, storeProducts } from "@/lib/storefront";

const sorts = ["featured", "price-low", "price-high", "rating", "name"] as const;
const searchSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  sort: z.enum(sorts).optional().catch(undefined),
});

export const Route = createFileRoute("/_store/shop")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Shop the collection | Ladies Collections" }] }),
  component: Shop,
});

function Shop() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const category = categories.find((item) => item.id === search.category);
  const query = search.q?.trim().toLowerCase() ?? "";
  const matches = storeProducts.filter(
    (p) =>
      (!category || p.category === category) &&
      `${p.name} ${p.category.label} ${p.description}`.toLowerCase().includes(query),
  );
  switch (search.sort) {
    case "price-low":
      matches.sort((a, b) => salePrice(a) - salePrice(b));
      break;
    case "price-high":
      matches.sort((a, b) => salePrice(b) - salePrice(a));
      break;
    case "rating":
      matches.sort((a, b) => b.rating - a.rating);
      break;
    case "name":
      matches.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }

  return (
    <div className={`${wrap} pt-8 sm:pt-12`}>
      <section className="store-page-banner px-5 py-10 text-center sm:py-14">
        <p className={eyebrow}>Ladies Collections</p>
        <h1 className="mt-2 text-5xl font-semibold sm:text-7xl">
          {category?.label ?? "Shop the collection"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {category?.note ?? "Find something to make the occasion yours."}
        </p>
      </section>
      <section aria-label="Product catalog" className="mt-7">
        <div className="grid gap-3 border-y py-4 sm:grid-cols-[1fr_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <Search size={17} className="absolute top-3 left-3 text-muted-foreground" />
            <input
              id="catalog-search"
              type="search"
              placeholder="Search sarees, jewellery, and more"
              value={search.q ?? ""}
              maxLength={100}
              className={`${field} scroll-mt-28 pl-9`}
              onChange={(e) =>
                void navigate({
                  search: { ...search, q: e.target.value || undefined },
                  replace: true,
                  resetScroll: false,
                })
              }
            />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select
              className={field}
              value={category?.id ?? ""}
              onChange={(e) =>
                void navigate({
                  search: { ...search, category: e.target.value || undefined },
                  resetScroll: false,
                })
              }
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort products</span>
            <select
              className={field}
              value={search.sort ?? "featured"}
              onChange={(e) =>
                void navigate({
                  search: { ...search, sort: sorts.find((sort) => sort === e.target.value) },
                  resetScroll: false,
                })
              }
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="rating">Top rated</option>
              <option value="name">Name: A to Z</option>
            </select>
          </label>
        </div>
        <div className="my-5 flex items-center justify-between gap-3 text-sm">
          <p role="status" className="text-muted-foreground">
            {matches.length} {matches.length === 1 ? "piece" : "pieces"} in the collection
          </p>
          {(search.q || category || search.sort) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void navigate({ search: {}, resetScroll: false })}
            >
              Clear filters
            </Button>
          )}
        </div>
        {matches.length ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
            {matches.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="store-surface px-5 py-12 text-center">
            <SlidersHorizontal className="mx-auto mb-3 text-primary" />
            <h2 className="text-3xl font-semibold">No pieces found</h2>
            <p className="mt-2 text-muted-foreground">Try another search or category.</p>
          </div>
        )}
      </section>
    </div>
  );
}
