import { useState } from "react";
import { useCart } from "./CartContext";
import { useAuth } from "../auth/AuthContext";
import { createOrder } from "../orders";

export default function CartSidebar() {
  const { user } = useAuth();
  const { cartItems, removeFromCart, clearCart, totalPrice, cartCount } = useCart();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCheckout = async () => {
    if (!user || cartItems.length === 0) return;
    setSubmitting(true);
    try {
      const items = cartItems.map((ci) => ({
        listingId: ci.listing.id,
        itemName: ci.listing.itemName,
        itemId: ci.listing.itemId,
        count: ci.listing.count,
        price: ci.listing.price,
      }));
      await createOrder(items);
      clearCart();
      setOpen(false);
      alert("訂單已送出，等待管理員處理！");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "結帳失敗");
    } finally {
      setSubmitting(false);
    }
  };

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
                        {ci.listing.count} 件 &times; {ci.listing.price.toLocaleString()} $
                      </span>
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
                  onClick={handleCheckout}
                  disabled={!user || submitting}
                >
                  {submitting ? "送出中..." : user ? "結帳" : "請先登入"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
