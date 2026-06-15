import { useEffect, useMemo, useState } from "react";
import { fetchOrders, updateOrderStatus, type Order } from "./orders";
import { fetchAllActiveListings, type Listing } from "./listings";
import { deleteMessages } from "./messages";
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
  cancelled: "#AA0000",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [chatOrderId, setChatOrderId] = useState<number | null>(null);
  const [listingMap, setListingMap] = useState<Map<number, Listing>>(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOrders(filter || undefined),
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
  }, [filter, reloadKey]);

  // Enrich order items with missing listingType/itemComponents from listing map
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

  const reload = () => setReloadKey((k) => k + 1);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      if (newStatus === "completed") {
        await deleteMessages(id);
      }
      await updateOrderStatus(id, newStatus);
      if (newStatus === "completed" || newStatus === "cancelled") {
        if (chatOrderId === id) setChatOrderId(null);
      }
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "操作失敗");
    }
  };

  if (loading) return <div className="shop-loading">載入訂單中...</div>;

  if (chatOrderId) {
    return (
      <div className="orders-page">
        <button className="chat-back-btn" onClick={() => setChatOrderId(null)}>← 返回訂單列表</button>
        <OrderChat orderId={chatOrderId} />
      </div>
    );
  }

  return (
    <div className="orders-page">
      <div className="shop-header">
        <h2>訂單管理</h2>
        <div className="shop-controls">
          <select className="order-filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">所有訂單</option>
            <option value="pending">待處理</option>
            <option value="processing">處理中</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
          <button className="refresh-btn" onClick={reload}>重新整理</button>
        </div>
      </div>

      {enrichedOrders.length === 0 ? (
        <div className="empty">暫無訂單</div>
      ) : (
        <div className="admin-order-list">
          {enrichedOrders.map((order) => {
            const isExpanded = expandedOrder === order.id;
            const canAct = order.status === "pending" || order.status === "processing";
            return (
              <div key={order.id} className={`admin-order-card ${isExpanded ? "expanded" : ""}`}>
                <div
                  className="admin-order-header clickable"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div className="admin-order-left">
                    <span className="order-id">#{order.id}</span>
                    <span className="admin-order-buyer">{order.buyerName}</span>
                    <span className="order-status" style={{ color: STATUS_COLORS[order.status] }}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  <div className="admin-order-right">
                    <span className="shop-price">{order.totalPrice.toLocaleString()} $</span>
                    <span className="expand-arrow">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                <div className="admin-order-items">
                  {order.items.map((item, i) => (
                    <span key={i} className="order-item-tag">
                      {item.itemName} &times;{item.count}
                    </span>
                  ))}
                </div>

                {isExpanded && (
                  <div className="order-detail-expand">
                    <div className="admin-order-meta">
                      <span>買家: <strong>{order.buyerName}</strong></span>
                      {order.minecraftId && <span>MC ID: <strong>{order.minecraftId}</strong></span>}
                      <span>時間: {new Date(order.createdAt).toLocaleString("zh-TW")}</span>
                    </div>

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

                    {canAct && (
                      <div className="admin-order-actions">
                        {order.status === "pending" && (
                          <button className="order-btn order-btn-process" onClick={() => handleStatusChange(order.id, "processing")}>
                            接手
                          </button>
                        )}
                        <button className="order-btn order-btn-chat" onClick={() => setChatOrderId(order.id)}>
                          聊天
                        </button>
                        {order.status === "processing" && (
                          <button className="order-btn order-btn-complete" onClick={() => handleStatusChange(order.id, "completed")}>
                            完成
                          </button>
                        )}
                        <button className="order-btn order-btn-cancel" onClick={() => handleStatusChange(order.id, "cancelled")}>
                          取消
                        </button>
                      </div>
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
