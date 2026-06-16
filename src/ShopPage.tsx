import { useEffect, useMemo, useState, Fragment } from "react";
import { fetchAllActiveListings, fetchCatalog, syncCatalog, type Listing, type CatalogItem } from "./listings";
import { fetchOrders, type Order } from "./orders";
import { fetchWarehouseData, type WarehouseData } from "./turso";
import { useCart } from "./cart/CartContext";
import { useAuth } from "./auth/AuthContext";
import MinecraftTooltip from "./MinecraftTooltip";
import ItemIcon from "./ItemIcon";
import { parseCustomData, parseCustomName, parseStatLabelMap, parseEquipmentType, type CustomData, type EquipmentType } from "./loreParser";

type SortField = "name" | "price";
type ShopTab = "all" | "bulk" | "stats";

// ── Stat comparison constants (same as App.tsx) ──
const STAT_LABELS: Record<string, string> = {
  ATK: "攻擊力",
  ATK_SPD: "攻擊速度",
  WPN_DMG: "武器總傷害",
  DEF: "防禦力",
  HP: "生命值",
  HP_REGEN: "生命恢復量",
  MP: "魔量",
  MAX_MP: "最大魔量",
  MP_REGEN: "魔量恢復量",
  MOVE_SPD: "移動速度",
  MOV_SPD: "移動速度",
  SKILL_DMG: "技能傷害",
  CRIT_RATE: "暴擊率",
  CRIT_DMG: "暴擊傷害",
  TOT_DMG: "總傷害",
  NAT_DMG: "自然傷害",
  DRK_DMG: "暗傷害",
  FIRE_DMG: "火焰傷害",
  ICE_DMG: "冰凍傷害",
  LIGHT_DMG: "雷電傷害",
};

const GRADE_COLORS: Record<string, string> = {
  MAX: "#FF5555",
  S: "#FFAA00",
  A: "#55FF55",
  B: "#55FFFF",
  C: "#FFFF55",
  D: "#AAAAAA",
  F: "#AA0000",
};

// ── Shop stat types ──
interface ShopStatInstance {
  listing: Listing;
  customData: CustomData;
}

interface ShopStatGroup {
  itemName: string;
  itemId: string;
  instances: ShopStatInstance[];
  statIds: string[];
}

const PREORDER_MAX = 99;
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return -(Math.abs(h) % 1000000 + 1);
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
  const [addQuantities, setAddQuantities] = useState<Record<number, number>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<ShopTab>("all");

  // Sold map: listingId → total ordered qty from pending+processing orders
  const [soldMap, setSoldMap] = useState<Map<number, number>>(new Map());

  // Warehouse live quantity map: "x,y,z,slot,itemId" → current count
  const [warehouseData, setWarehouseData] = useState<WarehouseData | null>(null);

  // Stats tab state
  const [selectedStatGroup, setSelectedStatGroup] = useState<string | null>(null);
  const [sortByStat, setSortByStat] = useState<string | null>(null);
  const [statSortDir, setStatSortDir] = useState<"desc" | "asc">("desc");

  // Equipment filter state
  const [selectedEquipTypes, setSelectedEquipTypes] = useState<Set<EquipmentType>>(new Set());
  const [showEquipFilter, setShowEquipFilter] = useState(false);

  // Catalog (pre-order) state
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [preOrderQty, setPreOrderQty] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAllActiveListings(),
      fetchOrders("pending").catch(() => [] as Order[]),
      fetchOrders("processing").catch(() => [] as Order[]),
      fetchWarehouseData().catch(() => null),
      fetchCatalog().catch(() => [] as CatalogItem[]),
    ])
      .then(([listingsData, pendingOrders, processingOrders, whData, catalogData]) => {
        if (cancelled) return;
        setListings(listingsData);
        setWarehouseData(whData);
        setCatalogItems(catalogData);

        // Build sold map: listingId → total ordered qty
        const sold = new Map<number, number>();
        const allOrders = [...pendingOrders, ...processingOrders];
        for (const order of allOrders) {
          for (const item of order.items) {
            sold.set(item.listingId, (sold.get(item.listingId) || 0) + item.count);
          }
        }
        setSoldMap(sold);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setListings([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Sync warehouse bulk items to catalog
  useEffect(() => {
    if (!warehouseData) return;
    const uniqueItems = new Map<string, { itemId: string; itemName: string; itemComponents: string }>();
    for (const chest of warehouseData.chests) {
      for (const item of chest.items) {
        if (!uniqueItems.has(item.itemId)) {
          uniqueItems.set(item.itemId, {
            itemId: item.itemId,
            itemName: item.itemName,
            itemComponents: item.itemComponents ?? "",
          });
        }
      }
    }
    if (uniqueItems.size > 0) {
      syncCatalog(Array.from(uniqueItems.values())).catch(() => {});
    }
  }, [warehouseData]);

  // Build warehouse lookups
  const warehouseMap = useMemo(() => {
    // Primary: exact match "x,y,z,slot,itemId"
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

  // Fallback 1: "x,y,z,itemId" → total count in same chest (handles items moved between slots)
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

  // Fallback 2: "slot,itemId" → count (handles double-chest position mismatch)
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

  // Get live warehouse quantity for a listing
  const getLiveQty = (listing: Listing): number => {
    if (!warehouseData) return listing.count;
    const isSingle = listing.slot !== -1;
    // Tier 1: exact match "x,y,z,slot,itemId"
    const exactKey = `${listing.chestX},${listing.chestY},${listing.chestZ},${listing.slot},${listing.itemId}`;
    const exactQty = warehouseMap.get(exactKey);
    if (exactQty !== undefined && exactQty > 0) return exactQty;
    // Single items: only exact position matters — item gone from slot = gone
    if (isSingle) return listing.count;
    // Bulk items (slot === -1): fall through to chest-level aggregation
    // Tier 2: same chest + same itemId (items may have moved between slots)
    const chestKey = `${listing.chestX},${listing.chestY},${listing.chestZ},${listing.itemId}`;
    const chestQty = warehouseChestItem.get(chestKey);
    if (chestQty !== undefined && chestQty > 0) return chestQty;
    // Tier 3: slot+itemId across all chests (double-chest position mismatch)
    const fbKey = `${listing.slot},${listing.itemId}`;
    const fbQty = warehouseFallback.get(fbKey);
    if (fbQty !== undefined && fbQty > 0) return fbQty;
    // All lookups returned 0 or not found — trust listing count
    return listing.count;
  };

  const cartMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const ci of cartItems) m.set(ci.listing.id, ci.quantity);
    return m;
  }, [cartItems]);

  // Pre-order: items in warehouse but not listed + items in catalog (once existed) but no active bulk listing
  const preOrderItems = useMemo(() => {
    const activeBulkItemIds = new Set(
      listings.filter((l) => l.listingType === "bulk").map((l) => l.itemId)
    );

    // Merge warehouse items + catalog items into a single map
    const allItems = new Map<string, CatalogItem>();
    if (warehouseData) {
      for (const chest of warehouseData.chests) {
        for (const item of chest.items) {
          if (!allItems.has(item.itemId)) {
            allItems.set(item.itemId, {
              itemId: item.itemId,
              itemName: item.itemName,
              itemComponents: item.itemComponents ?? "",
              firstSeen: "",
              lastSeen: "",
            });
          }
        }
      }
    }
    for (const c of catalogItems) {
      if (!allItems.has(c.itemId)) {
        allItems.set(c.itemId, c);
      }
    }

    const kw = search.trim().toLowerCase();
    return Array.from(allItems.values())
      .filter((c) => !activeBulkItemIds.has(c.itemId))
      .filter((c) => !kw || c.itemName.toLowerCase().includes(kw) || c.itemId.toLowerCase().includes(kw));
  }, [catalogItems, listings, search, warehouseData]);

  const handlePreOrderAdd = (catItem: CatalogItem) => {
    if (!user) return;
    const qty = preOrderQty[catItem.itemId] || 1;
    const syntheticListing: Listing = {
      id: hashStr(catItem.itemId),
      sellerId: "",
      sellerName: "",
      chestX: 0, chestY: 0, chestZ: 0,
      slot: -1,
      itemName: catItem.itemName,
      itemId: catItem.itemId,
      itemComponents: catItem.itemComponents,
      tooltipLines: [],
      count: PREORDER_MAX,
      price: 0,
      listingType: "bulk",
      status: "pre-order",
      createdAt: "",
    };
    addToCart(syntheticListing, qty, true);
    setPreOrderQty((p) => ({ ...p, [catItem.itemId]: 1 }));
  };

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    let items = listings;

    // Tab filter
    if (tab === "bulk") items = items.filter((l) => l.listingType === "bulk");
    else if (tab === "stats") items = items.filter((l) => l.listingType === "single");

    // Equipment type filter
    if (selectedEquipTypes.size > 0) {
      items = items.filter((l) => {
        const eqType = parseEquipmentType(l.itemComponents, l.itemId);
        return eqType !== null && selectedEquipTypes.has(eqType);
      });
    }

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
  }, [listings, search, sortField, sortDir, tab, selectedEquipTypes]);

  // ── Build shop stat groups from single listings with stats ──
  const shopStatGroups = useMemo<ShopStatGroup[]>(() => {
    const singleListings = listings.filter((l) => l.listingType === "single" && l.itemComponents);
    const groups = new Map<string, ShopStatInstance[]>();
    const itemIdMap = new Map<string, string>();

    for (const listing of singleListings) {
      const cd = parseCustomData(listing.itemComponents);
      if (!cd || cd.stats.length === 0) continue;
      const inst: ShopStatInstance = { listing, customData: cd };
      const key = listing.itemName;
      if (!groups.has(key)) {
        groups.set(key, []);
        itemIdMap.set(key, listing.itemId);
      }
      groups.get(key)!.push(inst);
    }

    return Array.from(groups.entries())
      .map(([name, instances]) => {
        const statIdSet = new Set<string>();
        for (const inst of instances) {
          for (const s of inst.customData.stats) {
            statIdSet.add(s.statId);
          }
        }
        return {
          itemName: name,
          itemId: itemIdMap.get(name) || "",
          instances,
          statIds: Array.from(statIdSet),
        };
      })
      .sort((a, b) => b.instances.length - a.instances.length);
  }, [listings]);

  // ── Filter stat groups by search and equipment type ──
  const filteredStatGroups = useMemo(() => {
    let groups = shopStatGroups;
    const kw = search.trim().toLowerCase();
    if (kw) groups = groups.filter((g) => g.itemName.toLowerCase().includes(kw));
    if (selectedEquipTypes.size > 0) {
      groups = groups.filter((g) => {
        const firstListing = g.instances[0]?.listing;
        if (!firstListing) return false;
        const eqType = parseEquipmentType(firstListing.itemComponents, firstListing.itemId);
        return eqType !== null && selectedEquipTypes.has(eqType);
      });
    }
    return groups;
  }, [shopStatGroups, search, selectedEquipTypes]);

  // ── Selected stat group details ──
  const selectedGroup = useMemo(() => {
    if (!selectedStatGroup) return null;
    return shopStatGroups.find((g) => g.itemName === selectedStatGroup) || null;
  }, [shopStatGroups, selectedStatGroup]);

  // Dynamic stat label map from tooltip lore (statId → Chinese name)
  const dynamicStatLabels = useMemo(() => {
    if (!selectedGroup || !selectedGroup.instances[0]?.listing.itemComponents) return new Map<string, string>();
    return parseStatLabelMap(selectedGroup.instances[0].listing.itemComponents);
  }, [selectedGroup]);

  const sortedInstances = useMemo(() => {
    if (!selectedGroup) return [];
    const instances = selectedGroup.instances.slice();
    if (!sortByStat) return instances;

    const getStatVal = (inst: ShopStatInstance): number | null => {
      const s = inst.customData.stats.find((s) => s.statId === sortByStat);
      return s ? s.value : null;
    };

    instances.sort((a, b) => {
      const va = getStatVal(a);
      const vb = getStatVal(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return statSortDir === "desc" ? vb - va : va - vb;
    });
    return instances;
  }, [selectedGroup, sortByStat, statSortDir]);

  const getGrade = (inst: ShopStatInstance, statId: string): string => {
    const stat = inst.customData.stats.find((s) => s.statId === statId);
    if (!stat || !inst.listing.itemComponents) return "-";
    const valStr = stat.value.toString();
    const re = new RegExp(
      `${valStr.replace(".", "\\.")}[\\s\\S]*?\\[([A-Z]{1,5})\\]`
    );
    const m = inst.listing.itemComponents.match(re);
    return m ? m[1] : "-";
  };

  const statLabel = (id: string) => dynamicStatLabels.get(id) || STAT_LABELS[id] || id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const sortArrow = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const handleAddToCart = (listing: Listing) => {
    const qty = addQuantities[listing.id] || 1;
    const inCart = cartMap.get(listing.id) || 0;
    const sold = soldMap.get(listing.id) || 0;
    const liveQty = getLiveQty(listing);
    const remaining = liveQty - sold - inCart;
    if (remaining <= 0) return;
    addToCart(listing, Math.min(qty, remaining));
    setAddQuantities((p) => ({ ...p, [listing.id]: 1 }));
  };

  const getMaxQty = (listing: Listing) => {
    const inCart = cartMap.get(listing.id) || 0;
    const sold = soldMap.get(listing.id) || 0;
    const liveQty = getLiveQty(listing);
    return Math.max(0, liveQty - sold - inCart);
  };

  const getAvailable = (listing: Listing) => {
    const sold = soldMap.get(listing.id) || 0;
    const liveQty = getLiveQty(listing);
    return Math.max(0, liveQty - sold);
  };

  if (loading) return <div className="shop-loading">載入中...</div>;

  return (
    <div className="shop-page">
      <div className="shop-header">
        <h2>商城</h2>
        <div className="shop-controls">
          <div className="equip-filter-wrapper">
            <button
              className={`equip-filter-btn ${selectedEquipTypes.size > 0 ? "active" : ""}`}
              onClick={() => setShowEquipFilter((v) => !v)}
              title="篩選裝備部位"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {selectedEquipTypes.size > 0 && <span className="filter-badge">{selectedEquipTypes.size}</span>}
            </button>

            {showEquipFilter && (
              <>
                <div className="equip-filter-backdrop" onClick={() => setShowEquipFilter(false)} />
                <div className="equip-filter-popup">
                  <div className="equip-filter-header">
                    <span className="equip-filter-title">篩選裝備部位</span>
                    {selectedEquipTypes.size > 0 && (
                      <button
                        className="equip-filter-clear"
                        onClick={() => setSelectedEquipTypes(new Set())}
                      >清除</button>
                    )}
                  </div>
                  <div className="equip-filter-groups">
                    <div className="equip-filter-group">
                      <span className="equip-filter-group-label">防具</span>
                      <div className="equip-filter-chips">
                        {(["頭盔", "胸甲", "護腿", "靴子"] as EquipmentType[]).map((t) => (
                          <button
                            key={t}
                            className={`equip-chip ${selectedEquipTypes.has(t) ? "active" : ""}`}
                            onClick={() => {
                              setSelectedEquipTypes((prev) => {
                                const next = new Set(prev);
                                if (next.has(t)) next.delete(t); else next.add(t);
                                return next;
                              });
                            }}
                          >{t}</button>
                        ))}
                      </div>
                    </div>
                    <div className="equip-filter-group">
                      <span className="equip-filter-group-label">飾品</span>
                      <div className="equip-filter-chips">
                        {(["肩飾", "腰帶", "披風", "手套"] as EquipmentType[]).map((t) => (
                          <button
                            key={t}
                            className={`equip-chip ${selectedEquipTypes.has(t) ? "active" : ""}`}
                            onClick={() => {
                              setSelectedEquipTypes((prev) => {
                                const next = new Set(prev);
                                if (next.has(t)) next.delete(t); else next.add(t);
                                return next;
                              });
                            }}
                          >{t}</button>
                        ))}
                      </div>
                    </div>
                    <div className="equip-filter-group">
                      <span className="equip-filter-group-label">武器</span>
                      <div className="equip-filter-chips">
                        {(["劍", "杖", "弓", "匕首"] as EquipmentType[]).map((t) => (
                          <button
                            key={t}
                            className={`equip-chip ${selectedEquipTypes.has(t) ? "active" : ""}`}
                            onClick={() => {
                              setSelectedEquipTypes((prev) => {
                                const next = new Set(prev);
                                if (next.has(t)) next.delete(t); else next.add(t);
                                return next;
                              });
                            }}
                          >{t}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
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
        <button className={`shop-tab ${tab === "stats" ? "active" : ""}`} onClick={() => { setTab("stats"); setSelectedStatGroup(null); setSortByStat(null); }}>數值</button>
      </div>

      {tab === "stats" ? (
        /* ── Stats comparison view (listing-based) ── */
        <div className="stat-compare-wrap">
          <div className="stat-compare-sidebar">
            <div className="stat-sidebar-title">上架中的數值物品 ({filteredStatGroups.length})</div>
            {filteredStatGroups.length === 0 && (
              <div className="stat-sidebar-empty">無數值商品</div>
            )}
            {filteredStatGroups.map((g) => (
              <div
                key={g.itemName}
                className={`stat-sidebar-item ${selectedStatGroup === g.itemName ? "active" : ""}`}
                onClick={() => { setSelectedStatGroup(g.itemName); setSortByStat(null); }}
              >
                <ItemIcon itemId={g.itemId} itemComponents={g.instances[0]?.listing.itemComponents} size={28} />
                <div className="stat-sidebar-info">
                  <span className="stat-sidebar-name">{g.itemName}</span>
                  <span className="stat-sidebar-count">{g.instances.length} 件上架</span>
                </div>
              </div>
            ))}
          </div>

          <div className="stat-compare-main">
            {!selectedGroup ? (
              <div className="stat-compare-placeholder">
                ← 選擇左側的物品來比較數值
              </div>
            ) : (
              <>
                <div className="stat-compare-header">
                  <h3>
                    <ItemIcon itemId={selectedGroup.itemId} itemComponents={selectedGroup.instances[0]?.listing.itemComponents} size={24} />
                    {parseCustomName(selectedGroup.instances[0]?.listing.itemComponents || "") || selectedGroup.itemName}
                    <span className="stat-compare-count">{selectedGroup.instances.length} 件上架</span>
                  </h3>
                </div>
                <div className="stat-table-wrap">
                  <table className="stat-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>單價</th>
                        <th>數量</th>
                        <th>賣家</th>
                        <th>等級</th>
                        {selectedGroup.statIds.map((sid) => (
                          <th
                            key={sid}
                            className={`stat-sortable ${sortByStat === sid ? "sorted" : ""}`}
                            onClick={() => {
                              if (sortByStat === sid) {
                                setStatSortDir((d) => (d === "desc" ? "asc" : "desc"));
                              } else {
                                setSortByStat(sid);
                                setStatSortDir("desc");
                              }
                            }}
                          >
                            {statLabel(sid)}
                            {sortByStat === sid && (
                              <span className="sort-arrow">{statSortDir === "desc" ? " ▼" : " ▲"}</span>
                            )}
                          </th>
                        ))}
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedInstances.map((inst, i) => {
                        const listing = inst.listing;
                        const maxQty = getMaxQty(listing);
                        const inCart = cartMap.get(listing.id) || 0;
                        return (
                          <ShopStatRow
                            key={listing.id}
                            inst={inst}
                            rank={i + 1}
                            statIds={selectedGroup.statIds}
                            getGrade={getGrade}
                            statLabel={statLabel}
                            user={user}
                            maxQty={maxQty}
                            inCart={inCart}
                            addQuantity={addQuantities[listing.id] || 1}
                            onSetQuantity={(qty) => setAddQuantities((p) => ({ ...p, [listing.id]: qty }))}
                            onAddToCart={() => handleAddToCart(listing)}
                            available={getAvailable(listing)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : filtered.length === 0 && !(tab === "bulk" && preOrderItems.length > 0) ? (
        <div className="empty">目前沒有上架物品</div>
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
                    <td className="item-count">{getAvailable(listing)}</td>
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
              {/* Pre-order items in bulk tab */}
              {tab === "bulk" && preOrderItems.length > 0 && (
                <>
                  <tr className="preorder-section-header">
                    <td colSpan={7}>
                      <div className="preorder-divider">
                        <span className="preorder-divider-tag">預購區</span>
                        <span className="preorder-divider-hint">以下物品尚未上架，可先預購排隊</span>
                      </div>
                    </td>
                  </tr>
                  {preOrderItems.map((catItem) => {
                    const syntheticId = hashStr(catItem.itemId);
                    const inCart = cartMap.get(syntheticId) || 0;
                    const qty = preOrderQty[catItem.itemId] || 1;
                    return (
                      <tr key={`preorder-${catItem.itemId}`} className="item-row shop-row preorder-row">
                        <td className="item-icon-cell">
                          <ItemIcon itemId={catItem.itemId} itemComponents={catItem.itemComponents} />
                        </td>
                        <td className="item-name">
                          {catItem.itemName}
                          <span className="preorder-tag">預購</span>
                        </td>
                        <td className="item-id">{catItem.itemId}</td>
                        <td className="item-count preorder-qty">—</td>
                        <td className="shop-price preorder-price">待定價</td>
                        <td className="shop-seller">—</td>
                        <td>
                          {user ? (
                            <div className="shop-add-group">
                              <div className="qty-selector">
                                <button
                                  className="qty-btn"
                                  onClick={() => setPreOrderQty((p) => ({ ...p, [catItem.itemId]: Math.max(1, qty - 1) }))}
                                >-</button>
                                <input
                                  type="number"
                                  className="qty-input"
                                  min={1}
                                  max={PREORDER_MAX}
                                  value={qty}
                                  onChange={(e) => setPreOrderQty((p) => ({ ...p, [catItem.itemId]: Math.min(PREORDER_MAX, Math.max(1, parseInt(e.target.value) || 1)) }))}
                                />
                                <button
                                  className="qty-btn"
                                  onClick={() => setPreOrderQty((p) => ({ ...p, [catItem.itemId]: Math.min(PREORDER_MAX, qty + 1) }))}
                                >+</button>
                              </div>
                              <button className="cart-add-btn preorder-btn" onClick={() => handlePreOrderAdd(catItem)}>
                                {inCart > 0 ? `已預購 (${inCart})` : "預購"}
                              </button>
                            </div>
                          ) : (
                            <span className="shop-login-hint">登入後可預購</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Shop stat comparison row ──
function ShopStatRow({
  inst,
  rank,
  statIds,
  getGrade,
  user,
  maxQty,
  inCart,
  addQuantity,
  onSetQuantity,
  onAddToCart,
  available,
}: {
  inst: ShopStatInstance;
  rank: number;
  statIds: string[];
  getGrade: (inst: ShopStatInstance, statId: string) => string;
  statLabel: (id: string) => string;
  user: ReturnType<typeof useAuth>["user"];
  maxQty: number;
  inCart: number;
  addQuantity: number;
  onSetQuantity: (qty: number) => void;
  onAddToCart: () => void;
  available: number;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const listing = inst.listing;

  const statValMap = new Map<string, number>();
  for (const sid of statIds) {
    const s = inst.customData.stats.find((st) => st.statId === sid);
    if (s) statValMap.set(sid, s.value);
  }

  return (
    <>
      <tr className="stat-row stat-row-clickable" onClick={() => setShowTooltip((v) => !v)}>
        <td className="stat-rank">{rank}</td>
        <td className="shop-price">{listing.price.toLocaleString()} $</td>
        <td className="item-count">{available}</td>
        <td className="shop-seller">{listing.sellerName}</td>
        <td className="stat-level">{inst.customData.level ?? "-"}</td>
        {statIds.map((sid) => {
          const val = statValMap.get(sid);
          const grade = getGrade(inst, sid);
          const gradeColor = GRADE_COLORS[grade] || undefined;
          return (
            <td key={sid} className="stat-val-cell">
              {val !== undefined ? (
                <span className="stat-val" style={gradeColor ? { color: gradeColor } : undefined}>
                  {val.toFixed(2)}
                  {grade !== "-" && (
                    <span className="stat-grade" style={gradeColor ? { color: gradeColor, borderColor: gradeColor } : undefined}>
                      {grade}
                    </span>
                  )}
                </span>
              ) : (
                <span className="stat-val-na">-</span>
              )}
            </td>
          );
        })}
        <td onClick={(e) => e.stopPropagation()}>
          {user ? (
            maxQty === 0 ? (
              <span className="cart-added-badge">{inCart > 0 ? `已加入 (${inCart})` : "售罄"}</span>
            ) : (
              <div className="shop-stat-cart-cell">
                <div className="qty-selector qty-selector-compact">
                  <button
                    className="qty-btn"
                    onClick={() => onSetQuantity(Math.max(1, addQuantity - 1))}
                  >-</button>
                  <input
                    type="number"
                    className="qty-input"
                    min={1}
                    max={maxQty}
                    value={addQuantity}
                    onChange={(e) => onSetQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
                  />
                  <button
                    className="qty-btn"
                    onClick={() => onSetQuantity(Math.min(maxQty, addQuantity + 1))}
                  >+</button>
                </div>
                <button className="cart-add-btn cart-add-btn-sm" onClick={onAddToCart}>加入</button>
              </div>
            )
          ) : (
            <span className="shop-login-hint">登入</span>
          )}
        </td>
      </tr>
      {showTooltip && (
        <tr className="detail-row">
          <td colSpan={statIds.length + 6}>
            <div className="detail-box">
              <div className="detail-section">
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
    </>
  );
}
