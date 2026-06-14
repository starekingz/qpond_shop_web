import { useEffect, useState } from "react";
import { fetchMyOrders, type Order } from "./orders";
import OrderChat from "./OrderChat";

const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  processing: "處理中",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFAA00",
  processing: "#55FFFF",
};

export default function MyOrdersPage({ initialChatOrderId }: { initialChatOrderId?: number | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Open chat immediately if initialChatOrderId provided
  const activeOrder = selectedOrder ?? initialChatOrderId ?? null;

  useEffect(() => {
    let cancelled = false;
    fetchMyOrders()
      .then((data) => { if (!cancelled) { setOrders(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setOrders([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (loading) return <div className="shop-loading">載入訂單中...</div>;

  if (activeOrder) {
    return (
      <div className="my-orders-page">
        <button className="chat-back-btn" onClick={() => setSelectedOrder(null)}>← 返回訂單列表</button>
        <OrderChat orderId={activeOrder} />
      </div>
    );
  }

  return (
    <div className="my-orders-page">
      <div className="shop-header">
        <h2>我的訂單</h2>
        <button className="refresh-btn" onClick={() => setReloadKey((k) => k + 1)}>重新整理</button>
      </div>

      {orders.length === 0 ? (
        <div className="empty">暫無進行中的訂單</div>
      ) : (
        <div className="my-order-list">
          {orders.map((order) => (
            <div key={order.id} className="my-order-card" onClick={() => setSelectedOrder(order.id)}>
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
