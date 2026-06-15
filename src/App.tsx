import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { fetchWarehouseData } from "./turso";
import type { WarehouseChest, WarehouseData, ChestItem } from "./turso";
import ItemIcon from "./ItemIcon";
import MinecraftTooltip from "./MinecraftTooltip";
import { useAuth } from "./auth/AuthContext";
import type { DiscordUser } from "./auth/AuthContext";
import { fetchListings, createListing, cancelListing, fetchAllActiveListings, buildListingTypeMap, type Listing } from "./listings";
import { sendPresenceHeartbeat } from "./messages";
import ListingStatsView from "./ListingStatsView";
import ShopPage from "./ShopPage";
import OrdersPage from "./OrdersPage";
import MyOrdersPage from "./MyOrdersPage";
import CartSidebar from "./cart/CartSidebar";
import CheckoutPage from "./CheckoutPage";
import "./App.css";

function getAvatarUrl(user: DiscordUser): string {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=64`;
  }
  const defaultIndex = Number(BigInt(user.discordId) >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}


interface AggregatedItem {
  itemId: string;
  itemName: string;
  totalCount: number;
  locations: { pos: string; count: number }[];
  tooltipLines: string[];
  itemComponents: string;
}

type ViewMode = "shop" | "items" | "chests" | "stats" | "orders" | "myorders" | "checkout";

function posKey(pos: { x: number; y: number; z: number }): string {
  return `(${pos.x}, ${pos.y}, ${pos.z})`;
}

function App() {
  const { user, login, logout, hasListingRole } = useAuth();
  const [data, setData] = useState<WarehouseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("shop");
  const [selectedChest, setSelectedChest] = useState<WarehouseChest | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [chestListingTypes, setChestListingTypes] = useState<Record<string, "bulk" | "single" | null>>({});
  const [showUserMenu, setShowUserMenu] = useState(false);

  const onListingsUpdate = useCallback((pos: string, type: "bulk" | "single" | null) => {
    setChestListingTypes((prev) => ({ ...prev, [pos]: type }));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, listings] = await Promise.all([
        fetchWarehouseData(),
        fetchAllActiveListings().catch(() => []),
      ]);
      setData(result);
      setChestListingTypes(buildListingTypeMap(listings));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = { cancelled: false };
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchWarehouseData();
        if (!controller.cancelled) setData(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!controller.cancelled) setError(msg);
      } finally {
        if (!controller.cancelled) setLoading(false);
      }
    })();
    return () => { controller.cancelled = true; };
  }, []);

  // Load all active listings on mount to color chest cards immediately
  useEffect(() => {
    let cancelled = false;
    fetchAllActiveListings()
      .then((listings) => {
        if (!cancelled) setChestListingTypes(buildListingTypeMap(listings));
      })
      .catch(() => {}); // silently ignore — card coloring is optional enhancement
    return () => { cancelled = true; };
  }, []);

  // Admin presence heartbeat every 30 seconds
  useEffect(() => {
    if (!hasListingRole) return;
    sendPresenceHeartbeat().catch(() => {});
    const interval = setInterval(() => {
      sendPresenceHeartbeat().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [hasListingRole]);

  const aggregated = useMemo<AggregatedItem[]>(() => {
    if (!data) return [];
    const map = new Map<string, AggregatedItem>();
    for (const chest of data.chests) {
      const pos = posKey(chest.pos);
      for (const item of chest.items) {
        const key = `${item.itemId}::${item.itemName}`;
        let entry = map.get(key);
        if (!entry) {
          entry = {
            itemId: item.itemId,
            itemName: item.itemName,
            totalCount: 0,
            locations: [],
            tooltipLines: item.tooltipLines ?? [],
            itemComponents: item.itemComponents ?? "",
          };
          map.set(key, entry);
        }
        entry.totalCount += item.count;
        const loc = entry.locations.find((l) => l.pos === pos);
        if (loc) {
          loc.count += item.count;
        } else {
          entry.locations.push({ pos, count: item.count });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [data]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return aggregated;
    return aggregated.filter(
      (item) =>
        item.itemName.toLowerCase().includes(keyword) ||
        item.itemId.toLowerCase().includes(keyword) ||
        item.locations.some((l) => l.pos.toLowerCase().includes(keyword))
    );
  }, [aggregated, search]);

  const chests = useMemo(() => {
    if (!data) return [];
    return data.chests.slice().sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y || a.pos.z - b.pos.z);
  }, [data]);

  const filteredChests = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return chests;
    return chests.filter((c) => {
      const pos = posKey(c.pos).toLowerCase();
      return (
        pos.includes(keyword) ||
        c.items.some((i) => i.itemName.toLowerCase().includes(keyword))
      );
    });
  }, [chests, search]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-box">
          <h2>載入失敗</h2>
          <p>{error}</p>
          <button onClick={loadData}>重試</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <nav className="main-nav">
            <button
              className={view === "shop" ? "nav-tab active" : "nav-tab"}
              onClick={() => setView("shop")}
            >
              商城
            </button>
            {hasListingRole && (
              <>
                <button
                  className={view === "items" ? "nav-tab active" : "nav-tab"}
                  onClick={() => { setView("items"); setSelectedChest(null); }}
                >
                  物品總覽
                </button>
                <button
                  className={view === "chests" ? "nav-tab active" : "nav-tab"}
                  onClick={() => { setView("chests"); setSelectedChest(null); }}
                >
                  箱子列表
                </button>
                <button
                  className={view === "stats" ? "nav-tab active" : "nav-tab"}
                  onClick={() => { setView("stats"); setSelectedChest(null); }}
                >
                  數值比較
                </button>
                <button
                  className={view === "orders" ? "nav-tab active" : "nav-tab"}
                  onClick={() => setView("orders")}
                >
                  訂單管理
                </button>
              </>
            )}
          </nav>
          <div className="user-area">
            <CartSidebar onNavigateCheckout={() => setView("checkout")} />
            {user ? (
              <div className="user-menu-wrapper">
                <button
                  className="user-avatar-btn"
                  onClick={() => setShowUserMenu((v) => !v)}
                  title={user.username}
                >
                  <img
                    className="user-avatar"
                    src={getAvatarUrl(user)}
                    alt={user.username}
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                  />
                </button>
                {showUserMenu && (
                  <div className="user-menu-dropdown">
                    <div className="user-menu-name">{user.username}</div>
                    <button
                      className="user-menu-item"
                      onClick={() => { setView("myorders"); setShowUserMenu(false); }}
                    >
                      我的訂單
                    </button>
                    <button
                      className="user-menu-item user-menu-logout"
                      onClick={() => { setShowUserMenu(false); logout(); }}
                    >
                      登出
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="login-btn" onClick={login}>Discord 登入</button>
            )}
          </div>
        </div>
      </header>

      {view === "shop" && <ShopPage />}
      {view === "checkout" && user && (
        <CheckoutPage
          onBack={() => setView("shop")}
          onOrderCreated={() => { setView("myorders"); }}
        />
      )}
      {view === "myorders" && user && <MyOrdersPage />}
      {view === "orders" && hasListingRole && <OrdersPage />}

      {hasListingRole && view !== "shop" && view !== "orders" && view !== "myorders" && view !== "checkout" && (
        <>
          <div className="meta">
            <span>箱子數: {data?.chests.length ?? 0}</span>
            <span>物品種類: {aggregated.length}</span>
            {data?.uploadedAt && <span>最後上傳: {new Date(data.uploadedAt).toLocaleString("zh-TW")}</span>}
            <button className="refresh-btn" onClick={loadData}>重新整理</button>
          </div>

          {loading && <div className="loading">載入中...</div>}
          {error && (
            <div className="error-box">
              <h2>載入失敗</h2>
              <p>{error}</p>
              <button onClick={loadData}>重試</button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="controls">
                <input
                  className="search-input"
                  type="text"
                  placeholder="搜尋物品名稱 / 座標..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

            {selectedChest && (
              <ChestDetail
                chest={selectedChest}
                onClose={() => setSelectedChest(null)}
                onListingsUpdate={onListingsUpdate}
              />
            )}

            {view === "items" && !selectedChest && (
        <div className="item-table-wrap">
          <table className="item-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>物品名稱</th>
                <th>ID</th>
                <th>總數量</th>
                <th>所在箱子</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="empty">查無符合條件的物品</td></tr>
              )}
              {filtered.map((item) => {
                const key = `${item.itemId}::${item.itemName}`;
                const isExpanded = expandedItem === key;
                return (
                  <Fragment key={key}>
                    <tr className="item-row">
                      <td className="item-icon-cell"><ItemIcon itemId={item.itemId} itemComponents={item.itemComponents} /></td>
                      <td className="item-name">{item.itemName}</td>
                      <td className="item-id">{item.itemId}</td>
                      <td className="item-count">{item.totalCount}</td>
                      <td className="item-locs">
                        {item.locations.map((l) => (
                          <span key={l.pos} className="loc-tag">{l.pos} ×{l.count}</span>
                        ))}
                      </td>
                      <td>
                        <button
                          className="expand-btn"
                          onClick={() => setExpandedItem(isExpanded ? null : key)}
                        >
                          {isExpanded ? "收起" : "詳情"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={key + "-detail"} className="detail-row">
                        <td colSpan={6}>
                          <div className="detail-box">
                            <div className="detail-section">
                              <h4>Tooltip</h4>
                              <MinecraftTooltip
                                itemName={item.itemName}
                                itemComponents={item.itemComponents}
                                tooltipLines={item.tooltipLines}
                              />
                            </div>
                            <div className="detail-section">
                              <h4>Components</h4>
                              <code className="components">{item.itemComponents || "無"}</code>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
          )}

          {view === "stats" && !selectedChest && (
        <ListingStatsView />
          )}

          {view === "chests" && !selectedChest && (
        <div className="chest-list-wrap">
          {filteredChests.length === 0 && <div className="empty">查無符合條件的箱子</div>}
          {filteredChests.map((chest) => (
            <div
              key={posKey(chest.pos)}
              className={[
                "chest-card",
                chestListingTypes[posKey(chest.pos)] === "bulk" ? "chest-card-listing-bulk" : "",
                chestListingTypes[posKey(chest.pos)] === "single" ? "chest-card-listing-single" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setSelectedChest(chest)}
            >
              <div className="chest-card-icons">
                {chest.items.slice(0, 8).map((item, i) => (
                  <ItemIcon key={i} itemId={item.itemId} itemComponents={item.itemComponents} size={28} />
                ))}
                {chest.items.length > 8 && (
                  <span className="chest-card-more">+{chest.items.length - 8}</span>
                )}
              </div>
              <div className="chest-pos">{posKey(chest.pos)}</div>
              {chest.items.length > 0 &&
                chest.items.every((i) => i.itemId === chest.items[0].itemId && i.itemName === chest.items[0].itemName) && (
                  <div className="chest-card-item-name" title={chest.items[0].itemName}>
                    {chest.items[0].itemName}
                  </div>
                )}
              <div className="chest-info">
                <span>{chest.items.length} 種物品</span>
                <span>{chest.items.reduce((s, i) => s + i.count, 0)} 件</span>
                <span className="chest-time">{new Date(chest.capturedAt).toLocaleString("zh-TW")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ChestDetail({ chest, onClose, onListingsUpdate }: { chest: WarehouseChest; onClose: () => void; onListingsUpdate: (pos: string, type: "bulk" | "single" | null) => void }) {
  const { hasListingRole } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [listingDialog, setListingDialog] = useState<{
    item: ChestItem;
    mode: "single" | "bulk";
  } | null>(null);

  const pos = chest.pos;

  const loadListings = useCallback(async () => {
    try {
      const data = await fetchListings(pos);
      return data;
    } catch { return []; }
  }, [pos]);

  useEffect(() => {
    let cancelled = false;
    loadListings().then((data) => {
      if (cancelled) return;
      setListings(data);
      setLoadingListings(false);
      // Report listing type back to parent for chest card coloring
      const pos = posKey(chest.pos);
      const bulk = data.some((l) => l.slot === -1 && l.status === "active");
      const single = data.some((l) => l.slot !== -1 && l.status === "active");
      if (bulk) onListingsUpdate(pos, "bulk");
      else if (single) onListingsUpdate(pos, "single");
      else onListingsUpdate(pos, null);
    });
    return () => { cancelled = true; };
  }, [loadListings, chest.pos, onListingsUpdate]);

  const listingMap = useMemo(() => {
    const m = new Map<number, Listing>();
    for (const l of listings) m.set(l.slot, l);
    return m;
  }, [listings]);

  // Check if all items are the same type
  const allSameItem = useMemo(() => {
    if (chest.items.length === 0) return false;
    const first = chest.items[0];
    return chest.items.every(
      (i) => i.itemId === first.itemId && i.itemName === first.itemName
    );
  }, [chest.items]);

  const bulkListing = listingMap.get(-1);
  const hasAnyListing = listings.length > 0;
  const canBulk = allSameItem && !hasAnyListing && hasListingRole;

  const handleCancel = async (id: number) => {
    if (!confirm("確定要下架嗎？")) return;
    try {
      await cancelListing(id);
      loadListings().then((data) => setListings(data));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "下架失敗");
    }
  };

  return (
    <div className="chest-detail-panel">
      <div className="chest-detail-header">
        <h2>箱子 {posKey(chest.pos)}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {canBulk && (
            <button
              className="listing-btn"
              onClick={() => {
                const total = chest.items.reduce((s, i) => s + i.count, 0);
                setListingDialog({
                  item: { ...chest.items[0], count: total },
                  mode: "bulk",
                });
              }}
            >
              整箱上架
            </button>
          )}
          <button onClick={onClose}>返回列表</button>
        </div>
      </div>
      <p className="chest-dim">維度: {chest.dimension}</p>
      <p className="chest-time">掃描時間: {new Date(chest.capturedAt).toLocaleString("zh-TW")}</p>
      {bulkListing && (
        <div className="listing-bulk-banner">
          <span className="listing-badge">已上架</span>
          整箱上架 · {bulkListing.count} 件 · 單價 ${bulkListing.price}
          <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
            總價 ${bulkListing.price * bulkListing.count}
          </span>
          {hasListingRole && (
            <button className="listing-cancel-btn" onClick={() => handleCancel(bulkListing.id)}>
              下架
            </button>
          )}
        </div>
      )}
      {loadingListings && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>載入上架狀態...</p>}
      <table className="item-table">
        <thead>
          <tr>
            <th style={{ width: 48 }}></th>
            <th>Slot</th>
            <th>物品名稱</th>
            <th>ID</th>
            <th>數量</th>
            <th>狀態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {chest.items.length === 0 && (
            <tr><td colSpan={7} className="empty">箱子為空</td></tr>
          )}
          {chest.items.map((item, i) => (
            <ChestItemRow
              key={i}
              item={item}
              listing={listingMap.get(item.slot)}
              canList={hasListingRole && !bulkListing}
              onList={() => setListingDialog({ item, mode: "single" })}
              onCancel={() => {
                const l = listingMap.get(item.slot);
                if (l) handleCancel(l.id);
              }}
            />
          ))}
        </tbody>
      </table>

      {listingDialog && (
        <ListingDialog
          item={listingDialog.item}
          mode={listingDialog.mode}
          chestPos={pos}
          onClose={() => setListingDialog(null)}
          onCreated={() => {
            setListingDialog(null);
            loadListings().then((data) => setListings(data));
          }}
        />
      )}
    </div>
  );
}

function ListingDialog({
  item,
  mode,
  chestPos,
  onClose,
  onCreated,
}: {
  item: ChestItem;
  mode: "single" | "bulk";
  chestPos: { x: number; y: number; z: number };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum <= 0) {
      setError("請輸入有效的價格");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createListing({
        chestPos,
        slot: item.slot,
        itemName: item.itemName,
        itemId: item.itemId,
        itemComponents: item.itemComponents,
        tooltipLines: item.tooltipLines,
        count: item.count,
        price: priceNum,
        listingType: mode,
      });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "上架失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="listing-overlay" onClick={onClose}>
      <div className="listing-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "bulk" ? "整箱上架" : "單個上架"}</h3>
        <div className="listing-dialog-item">
          <ItemIcon itemId={item.itemId} itemComponents={item.itemComponents} size={40} />
          <div>
            <div className="item-name">{item.itemName}</div>
            <div className="item-id">{item.itemId}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 2 }}>
              數量: {item.count}
            </div>
          </div>
        </div>
        <div className="listing-dialog-field">
          <label>單價 (每個)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="輸入價格..."
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={submitting}
          />
        </div>
        {mode === "bulk" && price && parseFloat(price) > 0 && (
          <div className="listing-dialog-summary">
            總價: ${parseFloat(price) * item.count}
          </div>
        )}
        {error && <div className="listing-error">{error}</div>}
        <div className="listing-dialog-actions">
          <button className="listing-cancel-btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button className="listing-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "上架中..." : "確認上架"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChestItemRow({
  item,
  listing,
  canList,
  onList,
  onCancel,
}: {
  item: ChestItem;
  listing?: Listing;
  canList: boolean;
  onList: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isListed = !!listing;

  return (
    <>
      <tr
        className={`item-row ${isListed ? "listing-row-active" : ""}`}
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer" }}
      >
        <td className="item-icon-cell"><ItemIcon itemId={item.itemId} itemComponents={item.itemComponents} /></td>
        <td>{item.slot}</td>
        <td className="item-name">{item.itemName}</td>
        <td className="item-id">{item.itemId}</td>
        <td className="item-count">{item.count}</td>
        <td>
          {isListed ? (
            <span className="listing-badge">${listing.price}</span>
          ) : (
            <span className="listing-unlisted">未上架</span>
          )}
        </td>
        <td>
          {canList && !isListed && (
            <button className="listing-btn listing-btn-sm" onClick={(e) => { e.stopPropagation(); onList(); }}>
              上架
            </button>
          )}
          {isListed && (
            <button className="listing-cancel-btn listing-btn-sm" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
              下架
            </button>
          )}
          {!canList && !isListed && (
            <button className="expand-btn" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
              {expanded ? "收起" : "詳情"}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={7}>
            <div className="detail-box">
              <div className="detail-section">
                <h4>Tooltip</h4>
                <MinecraftTooltip
                  itemName={item.itemName}
                  itemComponents={item.itemComponents}
                  tooltipLines={item.tooltipLines}
                />
              </div>
              {isListed && (
                <div className="detail-section">
                  <h4>上架資訊</h4>
                  <ul>
                    <li>賣家: {listing.sellerName}</li>
                    <li>單價: ${listing.price}</li>
                    <li>數量: {listing.count}</li>
                    <li>類型: {listing.listingType === "bulk" ? "整箱上架" : "單個上架"}</li>
                    <li>上架時間: {new Date(listing.createdAt).toLocaleString("zh-TW")}</li>
                  </ul>
                </div>
              )}
              <div className="detail-section">
                <h4>Components</h4>
                <code className="components">{item.itemComponents || "無"}</code>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default App;
