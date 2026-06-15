import { useEffect, useMemo, useState } from "react";
import { fetchOrders, markOrderInspected, type Order } from "./orders";
import { fetchAllActiveListings, type Listing } from "./listings";
import { useAuth } from "./auth/AuthContext";

type InspectionFilter = "pending" | "all";

export default function InspectionPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<InspectionFilter>("pending");
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOrders("completed").catch(() => [] as Order[]),
      fetchAllActiveListings().catch(() => [] as Listing[]),
    ])
      .then(([orderData, listingData]) => {
        if (cancelled) return;
        setOrders(orderData);
        setListings(listingData);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const listingMap = useMemo(() => {
    const m = new Map<number, Listing>();
    for (const l of listings) m.set(l.id, l);
    return m;
  }, [listings]);

  const filteredOrders = useMemo(() => {
    if (filter === "pending") return orders.filter((o) => !o.inspected);
    return orders;
  }, [orders, filter]);

  const handleInspect = async (orderId: number) => {
    setConfirming(orderId);
    try {
      await markOrderInspected(orderId, true);
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, inspected: true } : o));
    } catch (err) {
      console.error("Failed to mark inspected:", err);
    } finally {
      setConfirming(null);
    }
  };

  const handleUndoInspect = async (orderId: number) => {
    setConfirming(orderId);
    try {
      await markOrderInspected(orderId, false);
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, inspected: false } : o));
    } catch (err) {
      console.error("Failed to undo inspection:", err);
    } finally {
      setConfirming(null);
    }
  };

  // Check if an item has a shipping issue
  const getItemStatus = (item: Order["items"][0]): "ok" | "error" | "warning" => {
    const listing = listingMap.get(item.listingId);

    if (!listing) {
      // Listing no longer exists (already shipped or removed)
      return "ok";
    }

    if (item.listingType === "bulk") {
      // For bulk: listing still exists — might be okay if count was reduced
      // We can't know the original count, so show warning (needs manual check)
      return "warning";
    }

    // Single item still has active listing — likely not shipped
    return "error";
  };

  const getOrderStatus = (order: Order): "ok" | "error" | "warning" => {
    let hasError = false;
    let hasWarning = false;
    for (const item of order.items) {
      const status = getItemStatus(item);
      if (status === "error") hasError = true;
      if (status === "warning") hasWarning = true;
    }
    if (hasError) return "error";
    if (hasWarning) return "warning";
    return "ok";
  };

  if (!user) return <div className="inspection-page">請先登入</div>;
  if (loading) return <div className="inspection-page">載入中...</div>;

  const pendingCount = orders.filter((o) => !o.inspected).length;
  const errorCount = orders.filter((o) => !o.inspected && getOrderStatus(o) === "error").length;

  return (
    <div className="inspection-page">
      <div className="inspection-header">
        <h2>出貨檢驗</h2>
        <div className="inspection-stats">
          <span className="inspection-stat">
            待檢驗：<strong>{pendingCount}</strong>
          </span>
          {errorCount > 0 && (
            <span className="inspection-stat inspection-stat-error">
              有問題：<strong>{errorCount}</strong>
            </span>
          )}
        </div>
        <div className="inspection-filters">
          <button
            className={`filter-btn ${filter === "pending" ? "active" : ""}`}
            onClick={() => setFilter("pending")}
          >
            待檢驗 ({pendingCount})
          </button>
          <button
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            全部 ({orders.length})
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="inspection-empty">
          {filter === "pending" ? "沒有待檢驗的訂單" : "沒有已完成的訂單"}
        </div>
      ) : (
        <div className="inspection-list">
          {filteredOrders.map((order) => {
            const orderStatus = getOrderStatus(order);
            return (
              <div
                key={order.id}
                className={`inspection-card ${orderStatus === "error" ? "inspection-card-error" : ""} ${order.inspected ? "inspection-card-inspected" : ""}`}
              >
                <div className="inspection-card-header">
                  <div className="inspection-order-info">
                    <span className="inspection-order-id">訂單 #{order.id}</span>
                    <span className="inspection-buyer">{order.buyerName}</span>
                    {order.minecraftId && (
                      <span className="inspection-mc-id">MC: {order.minecraftId}</span>
                    )}
                    <span className="inspection-date">
                      {new Date(order.updatedAt).toLocaleString("zh-TW")}
                    </span>
                  </div>
                  <div className="inspection-order-actions">
                    {order.inspected ? (
                      <span className="inspection-badge-ok">已檢驗</span>
                    ) : orderStatus === "error" ? (
                      <span className="inspection-badge-error">出貨異常</span>
                    ) : orderStatus === "warning" ? (
                      <span className="inspection-badge-warn">需確認</span>
                    ) : (
                      <span className="inspection-badge-ok">正常</span>
                    )}
                    {order.inspected ? (
                      <button
                        className="btn-undo-inspect"
                        onClick={() => handleUndoInspect(order.id)}
                        disabled={confirming === order.id}
                      >
                        撤銷
                      </button>
                    ) : (
                      <button
                        className="btn-confirm-inspect"
                        onClick={() => handleInspect(order.id)}
                        disabled={confirming === order.id}
                      >
                        {confirming === order.id ? "處理中..." : "確認出貨正確"}
                      </button>
                    )}
                  </div>
                </div>

                <table className="inspection-items-table">
                  <thead>
                    <tr>
                      <th>物品名稱</th>
                      <th>類型</th>
                      <th>訂購數量</th>
                      <th>Listing 狀態</th>
                      <th>目前庫存</th>
                      <th>結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, idx) => {
                      const listing = listingMap.get(item.listingId);
                      const status = getItemStatus(item);
                      return (
                        <tr key={idx} className={`inspection-item-row ${status === "error" ? "row-error" : status === "warning" ? "row-warn" : ""}`}>
                          <td>{item.itemName}</td>
                          <td>
                            {item.listingType === "bulk" ? (
                              <span className="checkout-bulk-tag">胚子</span>
                            ) : (
                              <span className="checkout-single-tag">單件</span>
                            )}
                          </td>
                          <td>{item.count}</td>
                          <td>
                            {listing ? (
                              <span className="listing-exists">仍存在</span>
                            ) : (
                              <span className="listing-gone">已下架</span>
                            )}
                          </td>
                          <td>{listing ? listing.count : "-"}</td>
                          <td>
                            {status === "error" && <span className="status-error">未出貨</span>}
                            {status === "warning" && <span className="status-warn">需確認數量</span>}
                            {status === "ok" && <span className="status-ok">正確</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
