import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUpRight, Flower2 } from "lucide-react";
import { eyebrow, ProductCard, wrap } from "@/components/store/catalog";
import { Button } from "@/components/ui/button";
import { categories, storeImage, storeProducts } from "@/lib/storefront";

export const Route = createFileRoute("/_store/")({
  head: () => ({
    meta: [
      { title: "Ladies Collections | The Boutique" },
      {
        name: "description",
        content: "Discover sarees, kurthis, jewellery and more at the Ladies Collections boutique.",
      },
      { property: "og:title", content: "Ladies Collections | The Boutique" },
      {
        property: "og:description",
        content: "Discover the occasion edit and shop the Ladies Collections boutique.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <>
      <section className="store-hero" aria-labelledby="store-hero-title">
        <div className="store-hero-copy">
          <Flower2 className="store-hero-emboss" aria-hidden="true" strokeWidth={0.5} />
          <div className="store-hero-content">
            <p className="store-editorial-label store-hero-kicker">
              <span aria-hidden="true">✦</span> The Occasion Edit
            </p>
            <h1 id="store-hero-title" className="store-hero-title">
              Dressed for <em>the moment.</em>
            </h1>
            <p className="store-hero-description">
              Luminous silks, easy silhouettes and little details that make an occasion yours.
            </p>
            <div className="store-hero-actions">
              <Button asChild className="store-action store-action-ivory">
                <Link to="/shop" search={{}}>
                  Explore the collection <ArrowRight />
                </Link>
              </Button>
              <a href="#collections" className="store-editorial-link store-on-garnet">
                Shop by category <ArrowDown size={15} />
              </a>
            </div>
          </div>
        </div>
        <div className="store-hero-photo">
          <img
            src={storeImage("hero")}
            alt="Rose silk saree in a softly lit veranda"
            fetchPriority="high"
          />
          <div className="store-photo-frame" aria-hidden="true" />
          <Link to="/shop/$slug" params={{ slug: "gulab-silk-saree" }} className="store-photo-link">
            <span>
              <span className="store-editorial-label">From the edit</span>
              <span className="store-photo-title">The Gulab Silk Saree</span>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>

      <div className="store-chapter" aria-hidden="true">
        <span>Silk &amp; embroidery</span>
        <Flower2 size={20} strokeWidth={1.25} />
        <span>Gold &amp; pearls</span>
      </div>

      <div className={wrap}>
        <section id="collections" className="store-section store-reveal scroll-mt-32">
          <div className="store-section-heading">
            <div>
              <p className={eyebrow}>Find your favourites</p>
              <h2>Shop by category</h2>
            </div>
            <Link to="/shop" search={{}} className="store-editorial-link">
              View all collections <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-6">
            {categories.map((category, index) => (
              <Link
                key={category.id}
                to="/shop"
                search={{ category: category.id }}
                className="store-category group"
              >
                <div className="store-category-photo store-image">
                  <img src={storeImage(category.image)} alt="" loading="lazy" decoding="async" />
                  <span className="store-category-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <h3 className="text-2xl leading-none font-semibold">{category.label}</h3>
                  <ArrowUpRight size={15} className="store-category-arrow shrink-0" />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{category.note}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="store-section store-reveal">
          <div className="store-section-heading">
            <div>
              <p className={eyebrow}>Selected for the edit</p>
              <h2>Featured pieces</h2>
            </div>
            <Link to="/shop" search={{}} className="store-editorial-link">
              Shop the edit <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
            {storeProducts
              .filter((p) => p.featured)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
          </div>
        </section>

        <section className="store-section store-editorial-feature store-reveal">
          <div className="store-editorial-photo store-image">
            <img
              src={storeImage("jewellery-edit")}
              alt="Antique gold jhumkas with pearl fringe on garnet silk"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="store-editorial-copy">
            <p className="store-editorial-label">
              <span aria-hidden="true">✦</span> The finishing touch
            </p>
            <h2>
              Little <em>treasures.</em>
            </h2>
            <p>Antique gold tones and soft pearls, ready to bring your look together.</p>
            <Link
              to="/shop"
              search={{ category: "jewellery" }}
              className="store-editorial-link store-on-garnet"
            >
              Discover jewellery <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
