import { useEffect, useMemo, useState } from "react";

interface AuditEntry {
  id: number;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  order_status_change: { label: "訂單狀態", color: "#55FFFF" },
  inspect_confirm: { label: "檢驗確認", color: "#55FF55" },
  inspect_revert: { label: "檢驗撤銷", color: "#FFFF55" },
  listing_create: { label: "上架", color: "#55FF55" },
  listing_cancel: { label: "下架", color: "#FF5555" },
  chest_delete: { label: "刪除箱子", color: "#FF5555" },
  role_add: { label: "新增人員", color: "#55FF55" },
  role_remove: { label: "移除人員", color: "#FF5555" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "order", label: "訂單" },
  { value: "listing", label: "上架/下架" },
  { value: "chest", label: "箱子" },
  { value: "role", label: "身分組" },
];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/audit?limit=500", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setLogs(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filter !== "all") {
      result = result.filter((l) => l.targetType === filter);
    }
    const kw = search.trim().toLowerCase();
    if (kw) {
      result = result.filter(
        (l) =>
          l.actorName.toLowerCase().includes(kw) ||
          l.detail.toLowerCase().includes(kw) ||
          l.targetId.toLowerCase().includes(kw) ||
          (ACTION_LABELS[l.action]?.label || l.action).toLowerCase().includes(kw)
      );
    }
    return result;
  }, [logs, filter, search]);

  // Group by date
  const groupedLogs = useMemo(() => {
    const groups = new Map<string, AuditEntry[]>();
    for (const log of filteredLogs) {
      const date = new Date(log.createdAt).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
      const arr = groups.get(date) || [];
      arr.push(log);
      groups.set(date, arr);
    }
    return Array.from(groups.entries());
  }, [filteredLogs]);

  return (
    <div className="audit-page">
      <h2>歷史變更紀錄</h2>
      <p className="audit-desc">記錄所有管理操作，包含訂單管理、出貨檢驗、上架/下架、箱子刪除及身分組變更。</p>

      <div className="audit-controls">
        <div className="audit-filters">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`audit-filter-btn ${filter === opt.value ? "active" : ""}`}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="audit-search"
          placeholder="搜尋操作者 / 內容 / ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="role-error">{error}</div>}

      {loading ? (
        <div className="loading">載入中...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="audit-empty">無符合條件的紀錄</div>
      ) : (
        <div className="audit-timeline">
          {groupedLogs.map(([date, entries]) => (
            <div key={date} className="audit-date-group">
              <div className="audit-date-header">{date}</div>
              {entries.map((log) => {
                const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: "#888" };
                return (
                  <div key={log.id} className="audit-entry">
                    <div className="audit-entry-time">
                      {new Date(log.createdAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    <div className="audit-entry-body">
                      <span className="audit-action-tag" style={{ background: actionInfo.color + "22", color: actionInfo.color, borderColor: actionInfo.color }}>
                        {actionInfo.label}
                      </span>
                      <span className="audit-actor">{log.actorName}</span>
                      <span className="audit-detail">{log.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
