import { useEffect, useState } from "react";
import { fetchMyOrders, type Order } from "./orders";
import OrderChat from "./OrderChat";

const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  processing: "處理中",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFAA00",
  processing: "#55FFFF",
  completed: "#55FF55",
  cancelled: "#FF5555",
};

type TabMode = "active" | "history";

function isActive(order: Order): boolean {
  return order.status === "pending" || order.status === "processing";
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabMode>("active");
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMyOrders()
      .then((data) => { if (!cancelled) { setOrders(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setOrders([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (loading) return <div className="shop-loading">載入訂單中...</div>;

  // If viewing a chat
  if (selectedOrder) {
    return (
      <div className="my-orders-page">
        <button className="chat-back-btn" onClick={() => setSelectedOrder(null)}>← 返回訂單列表</button>
        <OrderChat orderId={selectedOrder} />
      </div>
    );
  }

  const activeOrders = orders.filter(isActive);
  const historyOrders = orders.filter((o) => !isActive(o));
  const displayedOrders = tab === "active" ? activeOrders : historyOrders;

  return (
    <div className="my-orders-page">
      <div className="shop-header">
        <h2>我的訂單</h2>
        <button className="refresh-btn" onClick={() => setReloadKey((k) => k + 1)}>重新整理</button>
      </div>

      {/* ── Tabs ── */}
      <div className="orders-tabs">
        <button
          className={`orders-tab ${tab === "active" ? "active" : ""}`}
          onClick={() => setTab("active")}
        >
          進行中 {activeOrders.length > 0 && <span className="tab-count">{activeOrders.length}</span>}
        </button>
        <button
          className={`orders-tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          歷史訂單 {historyOrders.length > 0 && <span className="tab-count">{historyOrders.length}</span>}
        </button>
      </div>

      {displayedOrders.length === 0 ? (
        <div className="empty">
          {tab === "active" ? "暫無進行中的訂單" : "暫無歷史訂單"}
        </div>
      ) : (
        <div className="my-order-list">
          {displayedOrders.map((order) => (
            <div
              key={order.id}
              className={`my-order-card ${isActive(order) ? "clickable" : ""}`}
              onClick={() => { if (isActive(order)) setSelectedOrder(order.id); }}
            >
              <div className="my-order-card-header">
                <span className="order-id">#{order.id}</span>
                <span className="order-status" style={{ color: STATUS_COLORS[order.status] }}>
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
              <div className="my-order-items">
                {order.items.map((item, i) => (
                  <span key={i} className="order-item-tag">
                    {item.itemName} &times;{item.count}
                  </span>
                ))}
              </div>
              <div className="my-order-meta">
                {order.minecraftId && (
                  <span className="order-mc-id">MC ID: {order.minecraftId}</span>
                )}
              </div>
              <div className="my-order-footer">
                <span className="shop-price">{order.totalPrice.toLocaleString()} $</span>
                <span className="order-time">{new Date(order.createdAt).toLocaleString("zh-TW")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
