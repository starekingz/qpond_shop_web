import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { fetchAllActiveListings, type Listing } from "./listings";
import { useCart } from "./cart/CartContext";
import { useAuth } from "./auth/AuthContext";
import MinecraftTooltip from "./MinecraftTooltip";

// Re-use ItemIcon for shop items
function ShopItemIcon({ itemId, itemComponents, size = 32 }: { itemId: string; itemComponents?: string; size?: number }) {
  // Use the same component as the warehouse — but we can't import from App directly
  // For now just render a simple img with fallback
  const cdnBase = (import.meta.env.VITE_TEXTURE_CDN_URL as string) || "https://assets.mcasset.cloud/1.21";

  function parseItemModel(itemComponents: string): string | null {
    const match = itemComponents.match(/minecraft:item_model=>([a-z0-9_.-]+:[a-z0-9_./-]+)/);
    return match ? match[1] : null;
  }

  const urls = useMemo(() => {
    const u: string[] = [];
    if (itemComponents) {
      const model = parseItemModel(itemComponents);
      if (model && model !== itemId) {
        const [ns, path] = model.split(":");
        u.push(`/textures/assets/${ns}/textures/${path}.png`);
        u.push(`/textures/assets/${ns}/textures/item/${path}.png`);
        u.push(`${cdnBase}/assets/${ns}/textures/${path}.png`);
        u.push(`${cdnBase}/assets/${ns}/textures/item/${path}.png`);
      }
    }
    const [ns, path] = itemId.includes(":") ? itemId.split(":") : ["minecraft", itemId];
    u.push(`/textures/assets/${ns}/textures/${path}.png`);
    u.push(`/textures/assets/${ns}/textures/item/${path}.png`);
    u.push(`${cdnBase}/assets/${ns}/textures/item/${path}.png`);
    return u;
  }, [itemId, itemComponents]);

  const [urlIdx, setUrlIdx] = useState(0);
  const handleError = useCallback(() => {
    setUrlIdx((prev) => (prev + 1 < urls.length ? prev + 1 : -1));
  }, [urls.length]);

  if (urlIdx === -1 || urlIdx >= urls.length) {
    return (
      <div className="item-icon item-icon-fallback" style={{ width: size, height: size }}>
        {itemId.charAt(itemId.includes(":") ? itemId.indexOf(":") + 1 : 0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      key={urls[urlIdx]}
      className="item-icon"
      src={urls[urlIdx]}
      alt={itemId}
      width={size}
      height={size}
      loading="lazy"
      style={{ imageRendering: "pixelated" }}
      onError={handleError}
    />
  );
}

type SortField = "name" | "price";

export default function ShopPage() {
  const { user } = useAuth();
  const { addToCart, cartItems } = useCart();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedListing, setExpandedListing] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAllActiveListings()
      .then((data) => { if (!cancelled) { setListings(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setListings([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const cartIds = useMemo(() => new Set(cartItems.map((i) => i.listing.id)), [cartItems]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    let items = listings;
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
  }, [listings, search, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const sortArrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

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

      {filtered.length === 0 ? (
        <div className="empty">目前沒有上架物品</div>
      ) : (
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
              {filtered.map((listing) => (
                <Fragment key={listing.id}>
                  <tr className="item-row shop-row">
                    <td className="item-icon-cell">
                      <ShopItemIcon itemId={listing.itemId} itemComponents={listing.itemComponents} />
                    </td>
                    <td className="item-name clickable" onClick={() => setExpandedListing(expandedListing === listing.id ? null : listing.id)}>
                      {listing.itemName}
                    </td>
                    <td className="item-id">{listing.itemId}</td>
                    <td className="item-count">{listing.count}</td>
                    <td className="shop-price">{listing.price.toLocaleString()} $</td>
                    <td className="shop-seller">{listing.sellerName}</td>
                    <td>
                      {user && !cartIds.has(listing.id) ? (
                        <button className="cart-add-btn" onClick={() => addToCart(listing)}>加入購物車</button>
                      ) : cartIds.has(listing.id) ? (
                        <span className="cart-added-badge">已加入</span>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
