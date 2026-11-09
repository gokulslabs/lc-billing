import { createContext, useContext } from "react";
import { productById, salePrice } from "@/lib/storefront";

export type Cart = Record<string, number>;
export const CartContext = createContext<{
  cart: Cart;
  ready: boolean;
  setQuantity: (id: string, quantity: number) => void;
  add: (id: string, quantity: number) => void;
  clear: () => void;
} | null>(null);

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("The storefront cart is unavailable.");
  return context;
}

export function cartLines(cart: Cart) {
  return Object.entries(cart).flatMap(([id, quantity]) => {
    const product = productById.get(id);
    return product ? [{ product, quantity, amount: salePrice(product) * quantity }] : [];
  });
}
