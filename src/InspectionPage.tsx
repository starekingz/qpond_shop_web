import { useEffect, useMemo, useState } from "react";
import { fetchOrders, markOrderInspected, type Order, type OrderItem } from "./orders";
import { fetchAllActiveListings, type Listing } from "./listings";
import { fetchWarehouseData, type WarehouseData } from "./turso";
import { useAuth } from "./auth/AuthContext";

type InspectionTab = "orders" | "anomalies";
type InspectionFilter = "pending" | "all";

interface Anomaly {
  id: number;
  listingId: number;
  itemName: string;
  itemId: string;
  chestX: number;
  chestY: number;
  chestZ: number;
  slot: number;
  listingCount: number;
  warehouseCount: number;
  detectedBy: string;
  detectedByName: string;
  confirmed: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  notes: string | null;
  createdAt: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAnomalies(): Promise<Anomaly[]> {
  return apiFetch<Anomaly[]>("/api/anomalies");
}

async function createAnomalies(items: Omit<Anomaly, "id" | "detectedBy" | "detectedByName" | "confirmed" | "confirmedBy" | "confirmedAt" | "notes" | "createdAt">[]): Promise<{ created: number; skipped: number }> {
  return apiFetch<{ created: number; skipped: number }>("/api/anomalies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anomalies: items }),
  });
}

async function confirmAnomaly(id: number, confirmed: boolean): Promise<void> {
  await apiFetch(`/api/anomalies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed }),
  });
}

export default function InspectionPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<InspectionTab>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [warehouseData, setWarehouseData] = useState<WarehouseData | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<InspectionFilter>("pending");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOrders("completed").catch(() => [] as Order[]),
      Promise.all([
        fetchOrders("pending").catch(() => [] as Order[]),
        fetchOrders("processing").catch(() => [] as Order[]),
        fetchOrders("completed").catch(() => [] as Order[]),
      ]).then(([p, pr, c]) => [...p, ...pr, ...c]),
      fetchAllActiveListings().catch(() => [] as Listing[]),
      fetchWarehouseData().catch(() => null),
      fetchAnomalies().catch(() => [] as Anomaly[]),
    ])
      .then(([completedOrders, allOrderData, listingData, whData, anomalyData]) => {
        if (cancelled) return;
        setOrders(completedOrders);
        setAllOrders(allOrderData);
        setListings(listingData);
        setWarehouseData(whData);
        setAnomalies(anomalyData);
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

  const getWarehouseQty = (listing: Listing): number | null => {
    if (!warehouseData) return null;
    const exactKey = `${listing.chestX},${listing.chestY},${listing.chestZ},${listing.slot},${listing.itemId}`;
    const exactQty = warehouseMap.get(exactKey);
    if (exactQty !== undefined && exactQty > 0) return exactQty;
    const chestKey = `${listing.chestX},${listing.chestY},${listing.chestZ},${listing.itemId}`;
    const chestQty = warehouseChestItem.get(chestKey);
    if (chestQty !== undefined && chestQty > 0) return chestQty;
    const fbKey = `${listing.slot},${listing.itemId}`;
    const fbQty = warehouseFallback.get(fbKey);
    if (fbQty !== undefined && fbQty > 0) return fbQty;
    return 0;
  };

  // Get warehouse quantity using snapshot data (when listing no longer exists)
  const getWarehouseQtyBySnapshot = (chestX: number, chestY: number, chestZ: number, slot: number, itemId: string): number | null => {
    if (!warehouseData) return null;
    const exactKey = `${chestX},${chestY},${chestZ},${slot},${itemId}`;
    const exactQty = warehouseMap.get(exactKey);
    if (exactQty !== undefined && exactQty > 0) return exactQty;
    const chestKey = `${chestX},${chestY},${chestZ},${itemId}`;
    const chestQty = warehouseChestItem.get(chestKey);
    if (chestQty !== undefined && chestQty > 0) return chestQty;
    const fbKey = `${slot},${itemId}`;
    const fbQty = warehouseFallback.get(fbKey);
    if (fbQty !== undefined && fbQty > 0) return fbQty;
    return 0;
  };

  // ── Order inspection logic ──
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

  const getItemStatus = (item: OrderItem) => {
    const listing = listingMap.get(item.listingId);
    const totalOrdered = totalOrderedPerListing.get(item.listingId) || 0;
    const listingCount = listing ? listing.count : (item.listingCount ?? null);

    // Case 1: listing still exists → compare warehouse vs listing
    if (listing) {
      const whQty = getWarehouseQty(listing);
      if (whQty === null) return { status: "warning" as const, listedCount: listing.count, warehouseCount: null, totalOrdered, diff: null };
      const decrease = listing.count - whQty;
      const diff = decrease - totalOrdered;
      if (diff === 0) return { status: "ok" as const, listedCount: listing.count, warehouseCount: whQty, totalOrdered, diff };
      return { status: "error" as const, listedCount: listing.count, warehouseCount: whQty, totalOrdered, diff };
    }

    // Case 2: listing gone but order has snapshot → verify with warehouse snapshot
    if (item.chestX != null && item.chestY != null && item.chestZ != null) {
      const whQty = getWarehouseQtyBySnapshot(item.chestX, item.chestY, item.chestZ, item.slot ?? 0, item.itemId);
      if (whQty === null) return { status: "warning" as const, listedCount: listingCount, warehouseCount: null, totalOrdered, diff: null };

      if (item.listingType === "single") {
        // Single item: if gone from warehouse → correctly shipped
        if (whQty === 0) return { status: "ok" as const, listedCount: listingCount, warehouseCount: 0, totalOrdered, diff: 0 };
        // Item still in warehouse → not shipped
        return { status: "error" as const, listedCount: listingCount, warehouseCount: whQty, totalOrdered, diff: -(whQty) };
      }

      // Bulk: same logic as before using snapshot count
      const snapshotCount = item.listingCount ?? 0;
      const decrease = snapshotCount - whQty;
      const diff = decrease - totalOrdered;
      if (diff === 0) return { status: "ok" as const, listedCount: snapshotCount, warehouseCount: whQty, totalOrdered, diff };
      return { status: "error" as const, listedCount: snapshotCount, warehouseCount: whQty, totalOrdered, diff };
    }

    // Case 3: no listing, no snapshot → cannot verify
    return { status: "warning" as const, listedCount: null, warehouseCount: null, totalOrdered, diff: null };
  };

  const getOrderStatus = (order: Order): "ok" | "error" | "warning" => {
    let hasError = false, hasWarning = false;
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
    } catch (err) { console.error(err); } finally { setConfirming(null); }
  };

  const handleUndoInspect = async (orderId: number) => {
    setConfirming(orderId);
    try {
      await markOrderInspected(orderId, false);
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, inspected: false } : o));
    } catch (err) { console.error(err); } finally { setConfirming(null); }
  };

  // ── Anomaly detection ──
  // Build set of listing IDs that have any orders
  const listingIdsWithOrders = useMemo(() => {
    const s = new Set<number>();
    for (const order of allOrders) {
      for (const item of order.items) {
        s.add(item.listingId);
      }
    }
    return s;
  }, [allOrders]);

  // Detect listings that disappeared from warehouse with no orders
  const detectedAnomalies = useMemo(() => {
    if (!warehouseData) return [];
    const results: { listing: Listing; whCount: number }[] = [];
    for (const listing of listings) {
      // Skip if there are orders for this listing
      if (listingIdsWithOrders.has(listing.id)) continue;
      const whQty = getWarehouseQty(listing);
      if (whQty !== null && whQty < listing.count) {
        results.push({ listing, whCount: whQty });
      }
    }
    return results;
  }, [listings, warehouseData, listingIdsWithOrders, warehouseMap, warehouseChestItem, warehouseFallback]);

  const handleScanAnomalies = async () => {
    if (detectedAnomalies.length === 0) return;
    setScanning(true);
    try {
      await createAnomalies(
        detectedAnomalies.map(({ listing, whCount }) => ({
          listingId: listing.id,
          itemName: listing.itemName,
          itemId: listing.itemId,
          chestX: listing.chestX,
          chestY: listing.chestY,
          chestZ: listing.chestZ,
          slot: listing.slot,
          listingCount: listing.count,
          warehouseCount: whCount,
        }))
      );
      // Reload anomalies
      const updated = await fetchAnomalies().catch(() => [] as Anomaly[]);
      setAnomalies(updated);
    } catch (err) {
      console.error("Failed to scan anomalies:", err);
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmAnomaly = async (id: number) => {
    setConfirming(id);
    try {
      await confirmAnomaly(id, true);
      setAnomalies((prev) => prev.map((a) => a.id === id ? { ...a, confirmed: true } : a));
    } catch (err) { console.error(err); } finally { setConfirming(null); }
  };

  const handleUndoAnomaly = async (id: number) => {
    setConfirming(id);
    try {
      await confirmAnomaly(id, false);
      setAnomalies((prev) => prev.map((a) => a.id === id ? { ...a, confirmed: false } : a));
    } catch (err) { console.error(err); } finally { setConfirming(null); }
  };

  if (!user) return <div className="inspection-page">請先登入</div>;
  if (loading) return <div className="inspection-page">載入中...</div>;

  const pendingCount = orders.filter((o) => !o.inspected).length;
  const errorCount = orders.filter((o) => !o.inspected && getOrderStatus(o) === "error").length;
  const unconfirmedAnomalies = anomalies.filter((a) => !a.confirmed).length;

  return (
    <div className="inspection-page">
      {/* Top tabs */}
      <div className="inspection-top-tabs">
        <button className={`filter-btn ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          出貨檢驗 {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button className={`filter-btn ${tab === "anomalies" ? "active" : ""}`} onClick={() => setTab("anomalies")}>
          異常消失 {unconfirmedAnomalies > 0 && `(${unconfirmedAnomalies})`}
        </button>
      </div>

      {/* ── Orders Tab ── */}
      {tab === "orders" && (
        <>
          <div className="inspection-header">
            <h2>出貨檢驗</h2>
            <div className="inspection-stats">
              <span className="inspection-stat">待檢驗：<strong>{pendingCount}</strong></span>
              {errorCount > 0 && (
                <span className="inspection-stat inspection-stat-error">有問題：<strong>{errorCount}</strong></span>
              )}
              {!warehouseData && (
                <span className="inspection-stat inspection-stat-error">⚠ 倉儲資料載入失敗</span>
              )}
            </div>
            <div className="inspection-filters">
              <button className={`filter-btn ${filter === "pending" ? "active" : ""}`} onClick={() => setFilter("pending")}>
                待檢驗 ({pendingCount})
              </button>
              <button className={`filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                全部 ({orders.length})
              </button>
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="inspection-empty">{filter === "pending" ? "沒有待檢驗的訂單" : "沒有已完成的訂單"}</div>
          ) : (
            <div className="inspection-list">
              {filteredOrders.map((order) => {
                const orderStatus = getOrderStatus(order);
                return (
                  <div key={order.id} className={`inspection-card ${orderStatus === "error" ? "inspection-card-error" : ""} ${order.inspected ? "inspection-card-inspected" : ""}`}>
                    <div className="inspection-card-header">
                      <div className="inspection-order-info">
                        <span className="inspection-order-id">訂單 #{order.id}</span>
                        <span className="inspection-buyer">{order.buyerName}</span>
                        {order.minecraftId && <span className="inspection-mc-id">MC: {order.minecraftId}</span>}
                        <span className="inspection-date">{new Date(order.updatedAt).toLocaleString("zh-TW")}</span>
                      </div>
                      <div className="inspection-order-actions">
                        {order.inspected ? <span className="inspection-badge-ok">已檢驗</span>
                          : orderStatus === "error" ? <span className="inspection-badge-error">出貨異常</span>
                          : orderStatus === "warning" ? <span className="inspection-badge-warn">需確認</span>
                          : <span className="inspection-badge-ok">正常</span>}
                        {order.inspected ? (
                          <button className="btn-undo-inspect" onClick={() => handleUndoInspect(order.id)} disabled={confirming === order.id}>撤銷</button>
                        ) : (
                          <button className="btn-confirm-inspect" onClick={() => handleInspect(order.id)} disabled={confirming === order.id}>
                            {confirming === order.id ? "處理中..." : "確認出貨正確"}
                          </button>
                        )}
                      </div>
                    </div>
                    <table className="inspection-items-table">
                      <thead><tr><th>物品名稱</th><th>類型</th><th>上架數量</th><th>倉儲目前</th><th>已出貨</th><th>訂購數量</th><th>結果</th></tr></thead>
                      <tbody>
                        {order.items.map((item, idx) => {
                          const r = getItemStatus(item);
                          return (
                            <tr key={idx} className={`inspection-item-row ${r.status === "error" ? "row-error" : r.status === "warning" ? "row-warn" : ""}`}>
                              <td>{item.itemName}</td>
                              <td>{item.listingType === "bulk" ? <span className="checkout-bulk-tag">胚子</span> : <span className="checkout-single-tag">單件</span>}</td>
                              <td>{r.listedCount ?? "-"}</td>
                              <td>{r.warehouseCount ?? "-"}</td>
                              <td>{r.listedCount !== null && r.warehouseCount !== null ? r.listedCount - r.warehouseCount : "-"}</td>
                              <td>{item.count}</td>
                              <td>
                                {r.status === "error" && r.diff !== null && (
                                  <span className="status-error">{r.diff > 0 ? `多扣 ${r.diff}` : `少扣 ${Math.abs(r.diff)}`}</span>
                                )}
                                {r.status === "warning" && <span className="status-warn">無法驗證</span>}
                                {r.status === "ok" && (
                                  <span className="status-ok">
                                    {!listingMap.get(item.listingId) && item.chestX != null ? "已出貨 ✓" : "正確"}
                                  </span>
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
        </>
      )}

      {/* ── Anomalies Tab ── */}
      {tab === "anomalies" && (
        <>
          <div className="inspection-header">
            <h2>異常消失紀錄</h2>
            <div className="inspection-stats">
              <span className="inspection-stat">未確認：<strong>{unconfirmedAnomalies}</strong></span>
              <span className="inspection-stat">已偵測到：<strong>{detectedAnomalies.length}</strong> 個上架物品庫存不足</span>
            </div>
            <div className="inspection-filters">
              <button
                className={`filter-btn ${scanning ? "" : "active"}`}
                onClick={handleScanAnomalies}
                disabled={scanning || detectedAnomalies.length === 0}
              >
                {scanning ? "掃描中..." : `掃描並記錄異常 (${detectedAnomalies.length})`}
              </button>
            </div>
          </div>

          {anomalies.length === 0 ? (
            <div className="inspection-empty">
              {detectedAnomalies.length > 0
                ? `偵測到 ${detectedAnomalies.length} 個異常，點擊上方按鈕記錄`
                : "目前沒有異常紀錄"}
            </div>
          ) : (
            <div className="inspection-list">
              {anomalies.map((a) => (
                <div key={a.id} className={`inspection-card ${!a.confirmed ? "inspection-card-error" : "inspection-card-inspected"}`}>
                  <div className="inspection-card-header">
                    <div className="inspection-order-info">
                      <span className="inspection-order-id">{a.itemName}</span>
                      <span className="inspection-buyer">{a.itemId}</span>
                      <span className="inspection-mc-id">({a.chestX}, {a.chestY}, {a.chestZ}) slot {a.slot}</span>
                      <span className="inspection-date">{new Date(a.createdAt).toLocaleString("zh-TW")}</span>
                    </div>
                    <div className="inspection-order-actions">
                      {a.confirmed ? (
                        <span className="inspection-badge-ok">已確認</span>
                      ) : (
                        <span className="inspection-badge-error">待確認</span>
                      )}
                      {a.confirmed ? (
                        <button className="btn-undo-inspect" onClick={() => handleUndoAnomaly(a.id)} disabled={confirming === a.id}>撤銷</button>
                      ) : (
                        <button className="btn-confirm-inspect" onClick={() => handleConfirmAnomaly(a.id)} disabled={confirming === a.id}>
                          {confirming === a.id ? "處理中..." : "確認已處理"}
                        </button>
                      )}
                    </div>
                  </div>
                  <table className="inspection-items-table">
                    <thead><tr><th>上架數量</th><th>倉儲數量</th><th>差異</th><th>偵測者</th><th>狀態</th></tr></thead>
                    <tbody>
                      <tr className={`inspection-item-row ${a.confirmed ? "" : "row-error"}`}>
                        <td>{a.listingCount}</td>
                        <td>{a.warehouseCount}</td>
                        <td><span className="status-error">-{a.listingCount - a.warehouseCount}</span></td>
                        <td>{a.detectedByName}</td>
                        <td>
                          {a.confirmed
                            ? <span className="status-ok">已確認 {a.confirmedBy && `(${a.confirmedBy})`}</span>
                            : <span className="status-error">未確認</span>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {a.notes && <div className="anomaly-notes">備註：{a.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
