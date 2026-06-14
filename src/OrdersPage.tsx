import { useEffect, useState } from "react";
import { fetchOrders, updateOrderStatus, type Order } from "./orders";

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

  useEffect(() => {
    let cancelled = false;
    fetchOrders(filter || undefined)
      .then((data) => { if (!cancelled) { setOrders(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setOrders([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [filter, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await updateOrderStatus(id, newStatus);
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "操作失敗");
    }
  };

  if (loading) return <div className="shop-loading">載入訂單中...</div>;

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

      {orders.length === 0 ? (
        <div className="empty">暫無訂單</div>
      ) : (
        <div className="item-table-wrap">
          <table className="item-table orders-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>買家</th>
                <th>物品</th>
                <th>總價</th>
                <th>狀態</th>
                <th>建立時間</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="order-row">
                  <td className="order-id">#{order.id}</td>
                  <td>{order.buyerName}</td>
                  <td className="order-items-cell">
                    {order.items.map((item, i) => (
                      <span key={i} className="order-item-tag">
                        {item.itemName} &times;{item.count}
                      </span>
                    ))}
                  </td>
                  <td className="shop-price">{order.totalPrice.toLocaleString()} $</td>
                  <td>
                    <span className="order-status" style={{ color: STATUS_COLORS[order.status] }}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="order-time">
                    {new Date(order.createdAt).toLocaleString("zh-TW")}
                  </td>
                  <td className="order-actions">
                    {order.status === "pending" && (
                      <button className="order-btn order-btn-process" onClick={() => handleStatusChange(order.id, "processing")}>
                        接手
                      </button>
                    )}
                    {order.status === "processing" && (
                      <button className="order-btn order-btn-complete" onClick={() => handleStatusChange(order.id, "completed")}>
                        完成
                      </button>
                    )}
                    {(order.status === "pending" || order.status === "processing") && (
                      <button className="order-btn order-btn-cancel" onClick={() => handleStatusChange(order.id, "cancelled")}>
                        取消
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
