import { storeProducts } from "@/lib/storefront";

const wearableCategories = new Set([
  "sarees",
  "kurthi",
  "salwar",
  "co-ord",
  "blouses",
  "frocks",
  "indo-western",
  "leggings",
  "lehengas",
  "nightwear",
  "pants",
  "shawls",
  "slips",
  "suits",
  "t-shirts",
  "western-tops",
]);
export const trialOutfits = storeProducts.filter((product) =>
  wearableCategories.has(product.category.id),
);
export const exampleOutfitId = "gulab-silk-saree";
export const trialRoomApiPath = "/api/store/try-on";
export const maxPhotoBytes = 12 * 1024 * 1024;
