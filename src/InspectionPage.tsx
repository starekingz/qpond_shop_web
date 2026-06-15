import { useEffect, useMemo, useState } from "react";
import { fetchOrders, markOrderInspected, type Order, type OrderItem } from "./orders";
import { fetchAllActiveListings, type Listing } from "./listings";
import { fetchWarehouseData, type WarehouseData } from "./turso";
import { useAuth } from "./auth/AuthContext";

type InspectionFilter = "pending" | "all";

export default function InspectionPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [warehouseData, setWarehouseData] = useState<WarehouseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<InspectionFilter>("pending");
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOrders("completed").catch(() => [] as Order[]),
      fetchAllActiveListings().catch(() => [] as Listing[]),
      fetchWarehouseData().catch(() => null),
    ])
      .then(([orderData, listingData, whData]) => {
        if (cancelled) return;
        setOrders(orderData);
        setListings(listingData);
        setWarehouseData(whData);
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

  // Warehouse lookups
  const warehouseMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!warehouseData) return m;
    for (const chest of warehouseData.chests) {
      const { x, y, z } = chest.pos;
      for (const item of chest.items) {
        const key = `${x},${y},${z},${item.slot},${item.itemId}`;
        m.set(key, (m.get(key) || 0) + item.count);
      }
    }
    return m;
  }, [warehouseData]);

  // Fallback 1: "x,y,z,itemId" → total count in same chest
  const warehouseChestItem = useMemo(() => {
    const m = new Map<string, number>();
    if (!warehouseData) return m;
    for (const chest of warehouseData.chests) {
      const { x, y, z } = chest.pos;
      for (const item of chest.items) {
        const key = `${x},${y},${z},${item.itemId}`;
        m.set(key, (m.get(key) || 0) + item.count);
      }
    }
    return m;
  }, [warehouseData]);

  // Fallback 2: "slot,itemId" → count (double-chest position mismatch)
  const warehouseFallback = useMemo(() => {
    const m = new Map<string, number>();
    if (!warehouseData) return m;
    for (const chest of warehouseData.chests) {
      for (const item of chest.items) {
        const key = `${item.slot},${item.itemId}`;
        m.set(key, (m.get(key) || 0) + item.count);
      }
    }
    return m;
  }, [warehouseData]);

  // Get current warehouse quantity for a listing
  const getWarehouseQty = (listing: Listing): number | null => {
    if (!warehouseData) return null;
    // Tier 1: exact match
    const exactKey = `${listing.chestX},${listing.chestY},${listing.chestZ},${listing.slot},${listing.itemId}`;
    const exactQty = warehouseMap.get(exactKey);
    if (exactQty !== undefined && exactQty > 0) return exactQty;
    // Tier 2: same chest + same itemId
    const chestKey = `${listing.chestX},${listing.chestY},${listing.chestZ},${listing.itemId}`;
    const chestQty = warehouseChestItem.get(chestKey);
    if (chestQty !== undefined && chestQty > 0) return chestQty;
    // Tier 3: slot+itemId across all chests
    const fbKey = `${listing.slot},${listing.itemId}`;
    const fbQty = warehouseFallback.get(fbKey);
    if (fbQty !== undefined && fbQty > 0) return fbQty;
    return 0;
  };

  // Build total ordered per listing from uninspected completed orders
  const totalOrderedPerListing = useMemo(() => {
    const m = new Map<number, number>();
    for (const order of orders) {
      if (order.inspected) continue;
      for (const item of order.items) {
        m.set(item.listingId, (m.get(item.listingId) || 0) + item.count);
      }
    }
    return m;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (filter === "pending") return orders.filter((o) => !o.inspected);
    return orders;
  }, [orders, filter]);

  // Get item status with warehouse-based validation
  const getItemStatus = (item: OrderItem): {
    status: "ok" | "error" | "warning";
    listedCount: number | null;
    warehouseCount: number | null;
    totalOrdered: number;
    diff: number | null;
  } => {
    const listing = listingMap.get(item.listingId);
    const totalOrdered = totalOrderedPerListing.get(item.listingId) || 0;

    if (!listing) {
      // Listing no longer active — can't validate with warehouse
      return { status: "warning", listedCount: null, warehouseCount: null, totalOrdered, diff: null };
    }

    const whQty = getWarehouseQty(listing);
    if (whQty === null) {
      // No warehouse data
      return { status: "warning", listedCount: listing.count, warehouseCount: null, totalOrdered, diff: null };
    }

    const decrease = listing.count - whQty;
    const diff = decrease - totalOrdered;

    if (diff === 0) {
      return { status: "ok", listedCount: listing.count, warehouseCount: whQty, totalOrdered, diff };
    }
    return { status: "error", listedCount: listing.count, warehouseCount: whQty, totalOrdered, diff };
  };

  const getOrderStatus = (order: Order): "ok" | "error" | "warning" => {
    let hasError = false;
    let hasWarning = false;
    for (const item of order.items) {
      const { status } = getItemStatus(item);
      if (status === "error") hasError = true;
      if (status === "warning") hasWarning = true;
    }
    if (hasError) return "error";
    if (hasWarning) return "warning";
    return "ok";
  };

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
          {!warehouseData && (
            <span className="inspection-stat inspection-stat-error">
              ⚠ 倉儲資料載入失敗，無法驗證庫存
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
                      <th>上架數量</th>
                      <th>倉儲目前</th>
                      <th>已出貨</th>
                      <th>訂購數量</th>
                      <th>結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, idx) => {
                      const result = getItemStatus(item);
                      return (
                        <tr key={idx} className={`inspection-item-row ${result.status === "error" ? "row-error" : result.status === "warning" ? "row-warn" : ""}`}>
                          <td>{item.itemName}</td>
                          <td>
                            {item.listingType === "bulk" ? (
                              <span className="checkout-bulk-tag">胚子</span>
                            ) : (
                              <span className="checkout-single-tag">單件</span>
                            )}
                          </td>
                          <td>{result.listedCount ?? "-"}</td>
                          <td>{result.warehouseCount ?? "-"}</td>
                          <td>
                            {result.listedCount !== null && result.warehouseCount !== null
                              ? result.listedCount - result.warehouseCount
                              : "-"}
                          </td>
                          <td>{item.count}</td>
                          <td>
                            {result.status === "error" && result.diff !== null && (
                              <span className="status-error">
                                {result.diff > 0
                                  ? `多扣 ${result.diff}`
                                  : `少扣 ${Math.abs(result.diff)}`}
                              </span>
                            )}
                            {result.status === "warning" && (
                              <span className="status-warn">無法驗證</span>
                            )}
                            {result.status === "ok" && (
                              <span className="status-ok">正確</span>
                            )}
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
