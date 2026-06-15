import { useState } from "react";
import { useCart } from "./CartContext";
import { useAuth } from "../auth/AuthContext";

interface CartSidebarProps {
  onNavigateCheckout: () => void;
}

export default function CartSidebar({ onNavigateCheckout }: CartSidebarProps) {
  const { user } = useAuth();
  const { cartItems, updateQuantity, removeFromCart, totalPrice, cartCount } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="cart-icon-btn" onClick={() => setOpen(!open)} title="購物車">
        <span className="cart-icon">&#128722;</span>
        {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
      </button>

      {open && (
        <div className="cart-sidebar">
          <div className="cart-sidebar-header">
            <h3>購物車</h3>
            <button className="cart-close-btn" onClick={() => setOpen(false)}>&times;</button>
          </div>

          {cartItems.length === 0 ? (
            <div className="cart-empty">購物車是空的</div>
          ) : (
            <>
              <div className="cart-items">
                {cartItems.map((ci) => (
                  <div key={ci.listing.id} className="cart-item">
                    <div className="cart-item-info">
                      <span className="cart-item-name">{ci.listing.itemName}</span>
                      <span className="cart-item-detail">
                        {ci.quantity} 件 &times; {ci.listing.price.toLocaleString()} $ = {(ci.quantity * ci.listing.price).toLocaleString()} $
                      </span>
                      <div className="cart-qty-controls">
                        <button className="qty-btn-sm" onClick={() => updateQuantity(ci.listing.id, ci.quantity - 1)} disabled={ci.quantity <= 1}>-</button>
                        <span className="cart-qty-display">{ci.quantity}</span>
                        <button className="qty-btn-sm" onClick={() => updateQuantity(ci.listing.id, ci.quantity + 1)}>+</button>
                      </div>
                    </div>
                    <button className="cart-remove-btn" onClick={() => removeFromCart(ci.listing.id)}>移除</button>
                  </div>
                ))}
              </div>

              <div className="cart-footer">
                <div className="cart-total">
                  總計：<strong>{totalPrice.toLocaleString()} $</strong>
                </div>
                <button
                  className="cart-checkout-btn"
                  onClick={() => { setOpen(false); onNavigateCheckout(); }}
                  disabled={!user}
                >
                  {user ? "前往結帳" : "請先登入"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
