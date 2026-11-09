import type { Product } from "@/lib/products";

export const categories = [
  {
    id: "sarees",
    label: "Sarees",
    name: "SAREES",
    code: "SS",
    image: "saree",
    note: "Timeless drapes",
  },
  {
    id: "kurthi",
    label: "Kurthis",
    name: "KURTHI",
    code: "KU",
    image: "kurthi",
    note: "Everyday elegance",
  },
  {
    id: "salwar",
    label: "Salwar",
    name: "SALWAR",
    code: "SR",
    image: "salwar",
    note: "Made for occasions",
  },
  {
    id: "jewellery",
    label: "Jewellery",
    name: "JEWELLERY",
    code: "JW",
    image: "jewellery",
    note: "The finishing touch",
  },
  {
    id: "fabrics",
    label: "Fabrics",
    name: "FABRICS",
    code: "FB",
    image: "fabric",
    note: "Something of your own",
  },
  {
    id: "co-ord",
    label: "Co-ord Sets",
    name: "CO-ORD",
    code: "CO",
    image: "coord",
    note: "Perfect pairings",
  },
] as const;

type Category = (typeof categories)[number];

export type StoreProduct = Product & {
  category: Category;
  description: string;
  rating: number;
  featured: boolean;
};

function sample(
  category: Category,
  id: string,
  name: string,
  price: number,
  discountPercent: number,
  rating: number,
  description: string,
  featured = false,
): StoreProduct {
  return {
    id,
    groupId: category.id,
    groupName: category.name,
    groupCode: category.code,
    code: `SAMPLE-${category.code}`,
    name,
    unit: category.id === "fabrics" ? "MT" : "NO",
    price,
    discountPercent,
    category,
    description,
    rating,
    featured,
  };
}

export const storeProducts = [
  sample(
    categories[0],
    "gulab-silk-saree",
    "Gulab Silk Saree",
    4800,
    15,
    4.9,
    "Rose silk with a soft sheen and a finely detailed gold border. Drape it for festive evenings or a celebration that calls for something special.",
    true,
  ),
  sample(
    categories[1],
    "noor-embroidered-kurthi",
    "Noor Embroidered Kurthi",
    2200,
    0,
    4.8,
    "An ivory kurthi with sage embroidery and a relaxed silhouette. Light enough for an afternoon out and dressed enough for dinner.",
    true,
  ),
  sample(
    categories[2],
    "meher-anarkali-set",
    "Meher Anarkali Set",
    3900,
    10,
    4.8,
    "A flowing wine anarkali with delicate embellishment, paired with a matching dupatta for festive occasions.",
    true,
  ),
  sample(
    categories[3],
    "tara-gold-jhumkas",
    "Tara Gold Jhumkas",
    1250,
    0,
    4.7,
    "Antique gold tone jhumkas with pearl detailing. A small statement that works with everything from silk drapes to simple cotton.",
    true,
  ),
  sample(
    categories[4],
    "bagh-block-print-cotton",
    "Bagh Block Print Cotton",
    520,
    0,
    4.8,
    "Cream cotton with a dusty rose floral block print and a soft, visible weave. Sold by the metre for your own tailoring projects.",
  ),
  sample(
    categories[5],
    "ira-floral-co-ord",
    "Ira Floral Co-ord Set",
    2800,
    20,
    4.9,
    "A soft mauve and plum floral pairing with an easy fit. Wear the pieces together or style them separately.",
  ),
];

export const productById = new Map(storeProducts.map((product) => [product.id, product]));
export const salePrice = (product: StoreProduct) =>
  Math.round(product.price * (100 - product.discountPercent)) / 100;
export const storeImage = (name: string) => `/store/${name}.webp`;
export const MAX_QUANTITY = 20;
