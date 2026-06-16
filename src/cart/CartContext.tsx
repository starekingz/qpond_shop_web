import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { Listing } from "../listings";

export interface CartItem {
  listing: Listing;
  quantity: number;
  isPreOrder?: boolean;
}

interface CartContextValue {
  cartItems: CartItem[];
  addToCart: (listing: Listing, quantity?: number, isPreOrder?: boolean) => number;
  updateQuantity: (listingId: number, qty: number) => void;
  removeFromCart: (listingId: number) => void;
  clearCart: () => void;
  totalPrice: number;
  cartCount: number;
  hasPreOrder: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((listing: Listing, quantity = 1, isPreOrder = false): number => {
    const maxQty = isPreOrder ? 99 : listing.count;
    let addedQty = 0;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.listing.id === listing.id);
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, maxQty);
        addedQty = newQty - existing.quantity;
        return prev.map((i) =>
          i.listing.id === listing.id ? { ...i, quantity: newQty } : i
        );
      }
      const clampedQty = Math.min(quantity, maxQty);
      addedQty = clampedQty;
      return [...prev, { listing, quantity: clampedQty, isPreOrder }];
    });
    return addedQty;
  }, []);

  const updateQuantity = useCallback((listingId: number, qty: number) => {
    if (qty < 1) return;
    setCartItems((prev) =>
      prev.map((i) => {
        if (i.listing.id !== listingId) return i;
        const clampedQty = Math.min(qty, i.listing.count);
        return { ...i, quantity: clampedQty };
      })
    );
  }, []);

  const removeFromCart = useCallback((listingId: number) => {
    setCartItems((prev) => prev.filter((i) => i.listing.id !== listingId));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, i) => sum + (i.isPreOrder ? 0 : i.listing.price * i.quantity), 0),
    [cartItems]
  );

  const hasPreOrder = cartItems.some((i) => i.isPreOrder);

  const cartCount = cartItems.length;

  return (
    <CartContext.Provider value={{ cartItems, addToCart, updateQuantity, removeFromCart, clearCart, totalPrice, cartCount, hasPreOrder }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
