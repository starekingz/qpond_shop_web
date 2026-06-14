import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { Listing } from "../listings";

export interface CartItem {
  listing: Listing;
  quantity: number;
}

interface CartContextValue {
  cartItems: CartItem[];
  addToCart: (listing: Listing) => void;
  removeFromCart: (listingId: number) => void;
  clearCart: () => void;
  totalPrice: number;
  cartCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((listing: Listing) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.listing.id === listing.id);
      if (existing) {
        // Already in cart — don't duplicate
        return prev;
      }
      return [...prev, { listing, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((listingId: number) => {
    setCartItems((prev) => prev.filter((i) => i.listing.id !== listingId));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const totalPrice = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.listing.price * i.listing.count, 0),
    [cartItems]
  );

  const cartCount = cartItems.length;

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, clearCart, totalPrice, cartCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
