import { useEffect, useMemo, useState } from "react";
import { fetchMyOrders, type Order } from "./orders";
import { fetchAllActiveListings, type Listing } from "./listings";
import OrderChat from "./OrderChat";
import MinecraftTooltip from "./MinecraftTooltip";
import ItemIcon from "./ItemIcon";

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
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [chatOrderId, setChatOrderId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [listingMap, setListingMap] = useState<Map<number, Listing>>(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMyOrders(),
      fetchAllActiveListings(),
    ])
      .then(([orderData, listingData]) => {
        if (!cancelled) {
          setOrders(orderData);
          const map = new Map<number, Listing>();
          for (const l of listingData) map.set(l.id, l);
          setListingMap(map);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) { setOrders([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const enrichedOrders = useMemo(() =>
    orders.map((order) => ({
      ...order,
      items: order.items.map((item) => {
        if (item.listingType && item.itemComponents) return item;
        const listing = listingMap.get(item.listingId);
        return {
          ...item,
          listingType: item.listingType ?? listing?.listingType,
          itemComponents: item.itemComponents ?? listing?.itemComponents,
        };
      }),
    })),
    [orders, listingMap]
  );

  if (loading) return <div className="shop-loading">載入訂單中...</div>;

  // If viewing a chat
  if (chatOrderId) {
    return (
      <div className="my-orders-page">
        <button className="chat-back-btn" onClick={() => setChatOrderId(null)}>← 返回訂單列表</button>
        <OrderChat orderId={chatOrderId} />
      </div>
    );
  }

  const activeOrders = enrichedOrders.filter(isActive);
  const historyOrders = enrichedOrders.filter((o) => !isActive(o));
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
          {displayedOrders.map((order) => {
            const isExpanded = expandedOrder === order.id;
            return (
              <div key={order.id} className={`my-order-card ${isExpanded ? "expanded" : ""}`}>
                <div
                  className="my-order-card-header clickable"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div className="my-order-card-title">
                    <span className="order-id">#{order.id}</span>
                    <span className="order-status" style={{ color: STATUS_COLORS[order.status] }}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  <span className="expand-arrow">{isExpanded ? "▲" : "▼"}</span>
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

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div className="order-detail-expand">
                    {order.minecraftId && (
                      <div className="order-detail-mc">MC ID: <strong>{order.minecraftId}</strong></div>
                    )}
                    <div className="order-detail-items">
                      {order.items.map((item, i) => {
                        const isBulk = item.listingType === "bulk";
                        return (
                          <div key={i} className="order-detail-item">
                            <div className="order-detail-item-header">
                              <div className="order-detail-item-icon">
                                <ItemIcon itemId={item.itemId} itemComponents={item.itemComponents} />
                              </div>
                              <div className="order-detail-item-info">
                                <span className="order-detail-item-name">{item.itemName}</span>
                                <span className="order-detail-item-id">{item.itemId}</span>
                                {isBulk && <span className="checkout-bulk-tag">胚子</span>}
                              </div>
                              <div className="order-detail-item-price">
                                <span>{item.count} 件 &times; {item.price.toLocaleString()} $</span>
                                <span className="order-detail-subtotal">{(item.count * item.price).toLocaleString()} $</span>
                              </div>
                            </div>
                            {!isBulk && item.itemComponents && (
                              <div className="order-detail-tooltip">
                                <MinecraftTooltip
                                  itemName={item.itemName}
                                  itemComponents={item.itemComponents}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {isActive(order) && (
                      <button
                        className="order-chat-enter-btn"
                        onClick={() => setChatOrderId(order.id)}
                      >
                        進入聊天室
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
