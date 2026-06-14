import { useEffect, useMemo, useState, Fragment } from "react";
import { fetchAllActiveListings, type Listing } from "./listings";
import { useCart } from "./cart/CartContext";
import { useAuth } from "./auth/AuthContext";
import MinecraftTooltip from "./MinecraftTooltip";
import ItemIcon from "./ItemIcon";

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
  const [addQuantities, setAddQuantities] = useState<Record<number, number>>({});
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
                      <ItemIcon itemId={listing.itemId} itemComponents={listing.itemComponents} />
                    </td>
                    <td className="item-name clickable" onClick={() => setExpandedListing(expandedListing === listing.id ? null : listing.id)}>
                      {listing.itemName}
                    </td>
                    <td className="item-id">{listing.itemId}</td>
                    <td className="item-count">{listing.count}</td>
                    <td className="shop-price">{listing.price.toLocaleString()} $</td>
                    <td className="shop-seller">{listing.sellerName}</td>
                    <td>
                      {user ? (
                        cartIds.has(listing.id) ? (
                          <span className="cart-added-badge">已加入</span>
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
                                value={addQuantities[listing.id] || 1}
                                onChange={(e) => setAddQuantities((p) => ({ ...p, [listing.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                              />
                              <button
                                className="qty-btn"
                                onClick={() => setAddQuantities((p) => ({ ...p, [listing.id]: (p[listing.id] || 1) + 1 }))}
                              >+</button>
                            </div>
                            <button className="cart-add-btn" onClick={() => addToCart(listing, addQuantities[listing.id] || 1)}>加入購物車</button>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
