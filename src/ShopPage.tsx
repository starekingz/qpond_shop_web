import { useEffect, useMemo, useState, Fragment } from "react";
import { fetchAllActiveListings, type Listing } from "./listings";
import { useCart } from "./cart/CartContext";
import { useAuth } from "./auth/AuthContext";
import MinecraftTooltip from "./MinecraftTooltip";
import ItemIcon from "./ItemIcon";

type SortField = "name" | "price";
type ShopTab = "all" | "bulk" | "stats";

interface StatGroupEntry {
  itemName: string;
  listings: Listing[];
}

export default function ShopPage() {
  const { user } = useAuth();
  const { addToCart, cartItems } = useCart();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedListing, setExpandedListing] = useState<number | null>(null);
  const [expandedStatGroup, setExpandedStatGroup] = useState<string | null>(null);
  const [addQuantities, setAddQuantities] = useState<Record<number, number>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<ShopTab>("all");

  useEffect(() => {
    let cancelled = false;
    fetchAllActiveListings()
      .then((data) => { if (!cancelled) { setListings(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setListings([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const cartMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const ci of cartItems) m.set(ci.listing.id, ci.quantity);
    return m;
  }, [cartItems]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    let items = listings;

    // Tab filter
    if (tab === "bulk") items = items.filter((l) => l.listingType === "bulk");
    else if (tab === "stats") items = items.filter((l) => l.listingType === "single");

    if (kw) {
      items = items.filter(
        (l) =>
          l.itemName.toLowerCase().includes(kw) ||
          l.itemId.toLowerCase().includes(kw) ||
          l.sellerName.toLowerCase().includes(kw)
      );
    }
    return items.sort((a, b) => {
      let cmp: number;
      if (sortField === "price") cmp = a.price - b.price;
      else cmp = a.itemName.localeCompare(b.itemName);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [listings, search, sortField, sortDir, tab]);

  // Group single listings by itemName for stats view
  const statGroups = useMemo<StatGroupEntry[]>(() => {
    const map = new Map<string, Listing[]>();
    for (const l of filtered) {
      if (l.listingType !== "single") continue;
      if (!map.has(l.itemName)) map.set(l.itemName, []);
      map.get(l.itemName)!.push(l);
    }
    return Array.from(map.entries())
      .map(([itemName, lss]) => ({ itemName, listings: lss }))
      .sort((a, b) => b.listings.length - a.listings.length);
  }, [filtered]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const sortArrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const handleAddToCart = (listing: Listing) => {
    const qty = addQuantities[listing.id] || 1;
    const inCart = cartMap.get(listing.id) || 0;
    const remaining = listing.count - inCart;
    if (remaining <= 0) return;
    const actualAdded = addToCart(listing, Math.min(qty, remaining));
    // Update quantity display to reflect clamped value
    setAddQuantities((p) => ({ ...p, [listing.id]: 1 }));
    return actualAdded;
  };

  const getMaxQty = (listing: Listing) => {
    const inCart = cartMap.get(listing.id) || 0;
    return Math.max(0, listing.count - inCart);
  };

  if (loading) return <div className="shop-loading">載入中...</div>;

  return (
    <div className="shop-page">
      <div className="shop-header">
        <h2>商城</h2>
        <div className="shop-controls">
          <input
            className="search-input"
            type="text"
            placeholder="搜尋物品 / 賣家..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="refresh-btn" onClick={() => setReloadKey((k) => k + 1)}>重新整理</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="shop-tabs">
        <button className={`shop-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>全部</button>
        <button className={`shop-tab ${tab === "bulk" ? "active" : ""}`} onClick={() => setTab("bulk")}>胚子</button>
        <button className={`shop-tab ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>數值</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">目前沒有上架物品</div>
      ) : tab === "stats" ? (
        /* ── Stats view: grouped by item name ── */
        <div className="shop-stats-view">
          {statGroups.length === 0 ? (
            <div className="empty">無數值商品</div>
          ) : (
            statGroups.map((group) => (
              <div key={group.itemName} className="stat-group-card">
                <div
                  className="stat-group-header"
                  onClick={() => setExpandedStatGroup(expandedStatGroup === group.itemName ? null : group.itemName)}
                >
                  <div className="stat-group-icon">
                    <ItemIcon itemId={group.listings[0].itemId} itemComponents={group.listings[0].itemComponents} />
                  </div>
                  <div className="stat-group-info">
                    <span className="stat-group-name">{group.itemName}</span>
                    <span className="stat-group-count">{group.listings.length} 件上架</span>
                  </div>
                  <span className="stat-group-toggle">
                    {expandedStatGroup === group.itemName ? "▲" : "▼"}
                  </span>
                </div>
                {expandedStatGroup === group.itemName && (
                  <div className="stat-group-body">
                    {group.listings.map((listing) => {
                      const maxQty = getMaxQty(listing);
                      const inCart = cartMap.get(listing.id) || 0;
                      return (
                        <div key={listing.id} className="stat-instance-card">
                          <div className="stat-instance-top">
                            <div className="stat-instance-meta">
                              <span className="item-id">{listing.itemId}</span>
                              <span className="shop-price">{listing.price.toLocaleString()} $</span>
                              <span className="shop-seller">{listing.sellerName}</span>
                              {inCart > 0 && <span className="cart-added-badge">購物車: {inCart}</span>}
                            </div>
                            {user && maxQty > 0 && (
                              <div className="shop-add-group">
                                <div className="qty-selector">
                                  <button
                                    className="qty-btn"
                                    onClick={() => setAddQuantities((p) => ({ ...p, [listing.id]: Math.max(1, (p[listing.id] || 1) - 1) }))}
                                  >-</button>
                                  <input
                                    type="number"
                                    className="qty-input"
                                    min={1}
                                    max={maxQty}
                                    value={addQuantities[listing.id] || 1}
                                    onChange={(e) => setAddQuantities((p) => ({ ...p, [listing.id]: Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)) }))}
                                  />
                                  <button
                                    className="qty-btn"
                                    onClick={() => setAddQuantities((p) => ({ ...p, [listing.id]: Math.min(maxQty, (p[listing.id] || 1) + 1) }))}
                                  >+</button>
                                </div>
                                <button className="cart-add-btn" onClick={() => handleAddToCart(listing)}>加入購物車</button>
                              </div>
                            )}
                            {user && maxQty === 0 && <span className="cart-added-badge">已達上限</span>}
                            {!user && <span className="shop-login-hint">登入後可購買</span>}
                          </div>
                          <div className="stat-instance-tooltip">
                            <MinecraftTooltip
                              itemName={listing.itemName}
                              itemComponents={listing.itemComponents}
                              tooltipLines={listing.tooltipLines}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Table view (all / bulk) ── */
        <div className="item-table-wrap">
          <table className="item-table shop-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th className="sortable" onClick={() => handleSort("name")}>
                  物品名稱{sortArrow("name")}
                </th>
                <th>物品 ID</th>
                <th>數量</th>
                <th className="sortable" onClick={() => handleSort("price")}>
                  單價{sortArrow("price")}
                </th>
                <th>賣家</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((listing) => {
                const maxQty = getMaxQty(listing);
                const inCart = cartMap.get(listing.id) || 0;
                return (
                <Fragment key={listing.id}>
                  <tr className="item-row shop-row">
                    <td className="item-icon-cell">
                      <ItemIcon itemId={listing.itemId} itemComponents={listing.itemComponents} />
                    </td>
                    <td className="item-name clickable" onClick={() => setExpandedListing(expandedListing === listing.id ? null : listing.id)}>
                      {listing.itemName}
                      {listing.listingType === "bulk" && <span className="checkout-bulk-tag">胚子</span>}
                    </td>
                    <td className="item-id">{listing.itemId}</td>
                    <td className="item-count">{listing.count}</td>
                    <td className="shop-price">{listing.price.toLocaleString()} $</td>
                    <td className="shop-seller">{listing.sellerName}</td>
                    <td>
                      {user ? (
                        maxQty === 0 ? (
                          <span className="cart-added-badge">{inCart > 0 ? `已加入 (${inCart})` : "已達上限"}</span>
                        ) : (
                          <div className="shop-add-group">
                            <div className="qty-selector">
                              <button
                                className="qty-btn"
                                onClick={() => setAddQuantities((p) => ({ ...p, [listing.id]: Math.max(1, (p[listing.id] || 1) - 1) }))}
                              >-</button>
                              <input
                                type="number"
                                className="qty-input"
                                min={1}
                                max={maxQty}
                                value={addQuantities[listing.id] || 1}
                                onChange={(e) => setAddQuantities((p) => ({ ...p, [listing.id]: Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)) }))}
                              />
                              <button
                                className="qty-btn"
                                onClick={() => setAddQuantities((p) => ({ ...p, [listing.id]: Math.min(maxQty, (p[listing.id] || 1) + 1) }))}
                              >+</button>
                            </div>
                            <button className="cart-add-btn" onClick={() => handleAddToCart(listing)}>加入購物車</button>
                          </div>
                        )
                      ) : (
                        <span className="shop-login-hint">登入後可購買</span>
                      )}
                    </td>
                  </tr>
                  {expandedListing === listing.id && (
                    <tr className="detail-row">
                      <td colSpan={7}>
                        <div className="detail-box">
                          <div className="detail-section">
                            <h4>Tooltip</h4>
                            <MinecraftTooltip
                              itemName={listing.itemName}
                              itemComponents={listing.itemComponents}
                              tooltipLines={listing.tooltipLines}
                            />
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
    </div>
  );
}
