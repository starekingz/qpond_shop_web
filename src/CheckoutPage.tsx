import { useEffect, useState } from "react";
import { useCart } from "./cart/CartContext";
import { useAuth } from "./auth/AuthContext";
import { createOrder } from "./orders";
import { fetchOnlineAdmins, type OnlineAdmin } from "./messages";
import ItemIcon from "./ItemIcon";
import MinecraftTooltip from "./MinecraftTooltip";

interface CheckoutPageProps {
  onBack: () => void;
  onOrderCreated: (orderId: number) => void;
}

export default function CheckoutPage({ onBack, onOrderCreated }: CheckoutPageProps) {
  const { user } = useAuth();
  const { cartItems, totalPrice, clearCart } = useCart();
  const [minecraftId, setMinecraftId] = useState("");
  const [onlineAdmins, setOnlineAdmins] = useState<OnlineAdmin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOnlineAdmins()
      .then((admins) => { if (!cancelled) setOnlineAdmins(admins); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoadingAdmins(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCheckout = async () => {
    if (!user || cartItems.length === 0) return;
    if (!minecraftId.trim()) {
      alert("請填寫 Minecraft ID");
      return;
    }
    setSubmitting(true);
    try {
      const items = cartItems.map((ci) => ({
        listingId: ci.listing.id,
        itemName: ci.listing.itemName,
        itemId: ci.listing.itemId,
        count: ci.quantity,
        price: ci.listing.price,
        listingType: ci.listing.listingType,
        itemComponents: ci.listing.itemComponents,
      }));
      const order = await createOrder(items, minecraftId.trim(), selectedAdmin || undefined);
      clearCart();
      onOrderCreated(order.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "結帳失敗");
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="checkout-page">
        <div className="checkout-empty">
          <p>購物車是空的，無法結帳</p>
          <button className="checkout-back-btn" onClick={onBack}>返回商城</button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-header">
        <button className="checkout-back-btn" onClick={onBack}>← 返回商城</button>
        <h2>確認結帳</h2>
      </div>

      {/* ── Item list ── */}
      <div className="checkout-items">
        <h3>訂單項目</h3>
        {cartItems.map((ci) => {
          const isBulk = ci.listing.listingType === "bulk";
          return (
            <div key={ci.listing.id} className="checkout-item-card">
              <div className="checkout-item-main">
                <div className="checkout-item-icon">
                  <ItemIcon itemId={ci.listing.itemId} itemComponents={ci.listing.itemComponents} />
                </div>
                <div className="checkout-item-info">
                  <div className="checkout-item-name">{ci.listing.itemName}</div>
                  <div className="checkout-item-id">{ci.listing.itemId}</div>
                  {isBulk && <span className="checkout-bulk-tag">胚子</span>}
                </div>
                <div className="checkout-item-qty">
                  <span>數量: {ci.quantity}</span>
                </div>
                <div className="checkout-item-price">
                  <div className="checkout-unit-price">{ci.listing.price.toLocaleString()} $ / 件</div>
                  <div className="checkout-subtotal">小計: {(ci.listing.price * ci.quantity).toLocaleString()} $</div>
                </div>
              </div>
              {!isBulk && (
                <div className="checkout-item-detail">
                  <button
                    className="checkout-detail-toggle"
                    onClick={() => setExpandedItem(expandedItem === ci.listing.id ? null : ci.listing.id)}
                  >
                    {expandedItem === ci.listing.id ? "收起詳細資訊 ▲" : "展開詳細數值 ▼"}
                  </button>
                  {expandedItem === ci.listing.id && (
                    <div className="checkout-tooltip">
                      <MinecraftTooltip
                        itemName={ci.listing.itemName}
                        itemComponents={ci.listing.itemComponents}
                        tooltipLines={ci.listing.tooltipLines}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Minecraft ID ── */}
      <div className="checkout-section">
        <h3>Minecraft ID</h3>
        <p className="checkout-hint">請填寫您的 Minecraft 遊戲 ID，管理員將以此 ID 進行交貨</p>
        <input
          type="text"
          className="checkout-mc-input"
          placeholder="輸入你的 Minecraft ID"
          value={minecraftId}
          onChange={(e) => setMinecraftId(e.target.value)}
          maxLength={32}
        />
      </div>

      {/* ── Admin selection ── */}
      <div className="checkout-section">
        <h3>選擇管理員</h3>
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
                  name="checkout-admin"
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
            name="checkout-admin"
            value=""
            checked={selectedAdmin === null}
            onChange={() => setSelectedAdmin(null)}
          />
          <span className="admin-name">不指定，等待管理員接手</span>
        </label>
        {selectedAdmin && (
          <p className="checkout-hint checkout-hint-info">選擇管理員後，訂單將直接進入「處理中」狀態</p>
        )}
      </div>

      {/* ── Order summary ── */}
      <div className="checkout-summary">
        <div className="checkout-summary-row">
          <span>訂單項目</span>
          <span>{cartItems.length} 項</span>
        </div>
        <div className="checkout-summary-row">
          <span>總數量</span>
          <span>{cartItems.reduce((sum, ci) => sum + ci.quantity, 0)} 件</span>
        </div>
        <div className="checkout-summary-row checkout-summary-total">
          <span>總計</span>
          <span>{totalPrice.toLocaleString()} $</span>
        </div>
        <button
          className="cart-checkout-btn checkout-confirm-btn"
          onClick={handleCheckout}
          disabled={submitting || !minecraftId.trim()}
        >
          {submitting ? "送出中..." : "確認下單"}
        </button>
      </div>
    </div>
  );
}
