import { useEffect, useState } from "react";

interface RoleEntry {
  userId: string;
  role: string;
  username: string;
  assignedBy: string;
  createdAt: string;
}

export default function RoleManagePage() {
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/roles", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRoles(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const reloadRoles = async () => {
    try {
      const res = await fetch("/api/roles", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRoles(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    }
  };

  const handleAdd = async () => {
    const id = newUserId.trim();
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, username: newUsername.trim() }),
      });
      if (!res.ok) throw new Error("新增失敗");
      setNewUserId("");
      setNewUsername("");
      await reloadRoles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (userId: string, username: string) => {
    if (!window.confirm(`確定要移除 ${username || userId} 的倉儲人員身分嗎？`)) return;
    try {
      const res = await fetch("/api/roles", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("移除失敗");
      await reloadRoles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除失敗");
    }
  };

  return (
    <div className="role-manage-page">
      <h2>身分組管理</h2>
      <p className="role-manage-desc">管理倉儲人員身分組，擁有此身分的使用者可以管理訂單出貨流程。</p>

      <div className="role-manage-add">
        <h3>新增倉儲人員</h3>
        <div className="role-manage-form">
          <input
            type="text"
            placeholder="Discord ID"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            className="role-input"
          />
          <input
            type="text"
            placeholder="使用者名稱（選填）"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="role-input"
          />
          <button
            onClick={handleAdd}
            disabled={submitting || !newUserId.trim()}
            className="role-add-btn"
          >
            {submitting ? "新增中..." : "新增"}
          </button>
        </div>
      </div>

      {error && <div className="role-error">{error}</div>}

      <div className="role-manage-list">
        <h3>目前倉儲人員 ({roles.length})</h3>
        {loading ? (
          <div className="loading">載入中...</div>
        ) : roles.length === 0 ? (
          <div className="role-empty">尚未新增任何倉儲人員</div>
        ) : (
          <table className="role-table">
            <thead>
              <tr>
                <th>使用者名稱</th>
                <th>Discord ID</th>
                <th>新增時間</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={`${r.userId}-${r.role}`}>
                  <td className="role-username">{r.username || "-"}</td>
                  <td className="role-userid">{r.userId}</td>
                  <td className="role-time">{r.createdAt ? new Date(r.createdAt).toLocaleString("zh-TW") : "-"}</td>
                  <td>
                    <button
                      className="role-remove-btn"
                      onClick={() => handleRemove(r.userId, r.username)}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
