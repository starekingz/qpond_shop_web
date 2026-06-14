import { useState } from "react";
import { useCart } from "./CartContext";
import { useAuth } from "../auth/AuthContext";
import { createOrder } from "../orders";
import { fetchOnlineAdmins, type OnlineAdmin } from "../messages";

interface CartSidebarProps {
  onOrderCreated?: (orderId: number) => void;
}

export default function CartSidebar({ onOrderCreated }: CartSidebarProps) {
  const { user } = useAuth();
  const { cartItems, updateQuantity, removeFromCart, clearCart, totalPrice, cartCount } = useCart();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Checkout flow state
  const [showCheckout, setShowCheckout] = useState(false);
  const [onlineAdmins, setOnlineAdmins] = useState<OnlineAdmin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<string | null>(null);

  const closeSidebar = () => { setOpen(false); setShowCheckout(false); };

  const handlePrepareCheckout = async () => {
    if (!user || cartItems.length === 0) return;
    setShowCheckout(true);
    setLoadingAdmins(true);
    setSelectedAdmin(null);
    try {
      const admins = await fetchOnlineAdmins();
      setOnlineAdmins(admins);
    } catch {
      setOnlineAdmins([]);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const handleCheckout = async () => {
    if (!user || cartItems.length === 0) return;
    setSubmitting(true);
    try {
      const items = cartItems.map((ci) => ({
        listingId: ci.listing.id,
        itemName: ci.listing.itemName,
        itemId: ci.listing.itemId,
        count: ci.quantity,
        price: ci.listing.price,
      }));
      const order = await createOrder(items, selectedAdmin || undefined);
      clearCart();
      setOpen(false);
      if (onOrderCreated) {
        onOrderCreated(order.id);
      } else {
        alert("訂單已送出！");
      }
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
            <button className="cart-close-btn" onClick={closeSidebar}>&times;</button>
          </div>

          {!showCheckout ? (
            /* ── Normal cart view ── */
            cartItems.length === 0 ? (
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
                    onClick={handlePrepareCheckout}
                    disabled={!user || cartItems.length === 0}
                  >
                    {user ? "準備結帳" : "請先登入"}
                  </button>
                </div>
              </>
            )
          ) : (
            /* ── Checkout confirmation panel ── */
            <div className="checkout-panel">
              <h4>選擇管理員</h4>
              {loadingAdmins ? (
                <div className="checkout-loading">查詢在線管理員...</div>
              ) : onlineAdmins.length > 0 ? (
                <div className="admin-list">
                  {onlineAdmins.map((admin) => (
                    <label
                      key={admin.userId}
                      className={`admin-option ${selectedAdmin === admin.userId ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="admin"
                        value={admin.userId}
                        checked={selectedAdmin === admin.userId}
                        onChange={() => setSelectedAdmin(admin.userId)}
                      />
                      <span className="admin-name">{admin.username}</span>
                      <span className="admin-online-dot" />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="checkout-no-admin">目前無在線管理員</div>
              )}

              <label className="admin-option no-admin-option">
                <input
                  type="radio"
                  name="admin"
                  value=""
                  checked={selectedAdmin === null}
                  onChange={() => setSelectedAdmin(null)}
                />
                <span className="admin-name">不指定，等待管理員接手</span>
              </label>

              <div className="checkout-actions">
                <button className="checkout-back-btn" onClick={() => setShowCheckout(false)}>返回</button>
                <button
                  className="cart-checkout-btn"
                  onClick={handleCheckout}
                  disabled={submitting}
                >
                  {submitting ? "送出中..." : "確認下單"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
