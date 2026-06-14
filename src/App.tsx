import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { fetchWarehouseData } from "./turso";
import type { WarehouseChest, WarehouseData, ChestItem } from "./turso";
import WeaponModelIcon from "./WeaponModelIcon";
import MinecraftTooltip from "./MinecraftTooltip";
import { parseCustomData, parseCustomName, type CustomData } from "./loreParser";
import "./App.css";

/** Extract item_model from components string (1.21+ format) */
function parseItemModel(itemComponents: string): string | null {
  const match = itemComponents.match(/minecraft:item_model=>([a-z0-9_.-]+:[a-z0-9_./-]+)/);
  return match ? match[1] : null;
}

/** Build item texture URLs — item_model first, then itemId fallback, local → CDN */
function getItemIconUrls(itemId: string, itemComponents?: string): string[] {
  const urls: string[] = [];
  const cdnBase = (import.meta.env.VITE_TEXTURE_CDN_URL as string) || "https://assets.mcasset.cloud/1.21";

  // 1. Try item_model from components (custom items via ItemsAdder/Oraxen)
  if (itemComponents) {
    const itemModel = parseItemModel(itemComponents);
    if (itemModel && itemModel !== itemId) {
      const [ns, path] = itemModel.split(":");
      // Local: direct path (resource pack structure: textures/bow/dark.png)
      urls.push(`/textures/assets/${ns}/textures/${path}.png`);
      // Local: item/ and block/ subfolders
      urls.push(`/textures/assets/${ns}/textures/item/${path}.png`);
      urls.push(`/textures/assets/${ns}/textures/block/${path}.png`);
      // CDN fallback
      urls.push(`${cdnBase}/assets/${ns}/textures/${path}.png`);
      urls.push(`${cdnBase}/assets/${ns}/textures/item/${path}.png`);
      urls.push(`${cdnBase}/assets/${ns}/textures/block/${path}.png`);
    }
  }

  // 2. Fallback to vanilla itemId
  const [ns, path] = itemId.includes(":") ? itemId.split(":") : ["minecraft", itemId];
  urls.push(`/textures/assets/${ns}/textures/${path}.png`);
  urls.push(`/textures/assets/${ns}/textures/item/${path}.png`);
  urls.push(`/textures/assets/${ns}/textures/block/${path}.png`);
  urls.push(`${cdnBase}/assets/${ns}/textures/item/${path}.png`);
  urls.push(`${cdnBase}/assets/${ns}/textures/block/${path}.png`);

  return urls;
}

function ItemIcon({ itemId, itemComponents, size = 32 }: { itemId: string; itemComponents?: string; size?: number }) {
  // Detect qp_weapon items → render 3D model on Canvas
  const itemModel = itemComponents ? parseItemModel(itemComponents) : null;
  const isWeapon = !!itemModel && itemModel.startsWith("qp_weapon:");

  const urls = useMemo(() => getItemIconUrls(itemId, itemComponents), [itemId, itemComponents]);
  const [urlIndex, setUrlIndex] = useState(0);

  const handleError = useCallback(() => {
    setUrlIndex((prev) => {
      const next = prev + 1;
      return next < urls.length ? next : -1;
    });
  }, [urls.length]);

  if (isWeapon) {
    return (
      <WeaponModelIcon
        modelRef={itemModel!}
        size={size}
        fallback={
          urls.length > 0 ? (
            <img
              className="item-icon"
              src={urls[urls.length - 2] || urls[0]}
              alt={itemId}
              width={size}
              height={size}
              loading="lazy"
              style={{ imageRendering: "pixelated" }}
              onError={handleError}
            />
          ) : (
            <div className="item-icon item-icon-fallback" style={{ width: size, height: size }}>
              {itemId.charAt(itemId.includes(":") ? itemId.indexOf(":") + 1 : 0).toUpperCase()}
            </div>
          )
        }
      />
    );
  }

  if (urls.length === 0 || urlIndex === -1 || urlIndex >= urls.length) {
    return (
      <div className="item-icon item-icon-fallback" style={{ width: size, height: size }}>
        {itemId.charAt(itemId.includes(":") ? itemId.indexOf(":") + 1 : 0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      key={urls[urlIndex]}
      className="item-icon"
      src={urls[urlIndex]}
      alt={itemId}
      width={size}
      height={size}
      loading="lazy"
      style={{ imageRendering: "pixelated" }}
      onError={handleError}
    />
  );
}

interface AggregatedItem {
  itemId: string;
  itemName: string;
  totalCount: number;
  locations: { pos: string; count: number }[];
  tooltipLines: string[];
  itemComponents: string;
}

interface StatItemInstance {
  itemName: string;
  itemId: string;
  itemComponents: string;
  customData: CustomData;
  chestPos: string;
  slot: number;
}

interface StatGroup {
  itemName: string;
  itemId: string;
  instances: StatItemInstance[];
  statIds: string[]; // unique stat IDs across all instances
}

type ViewMode = "items" | "chests" | "stats";

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

// Fixed grade colors (same across all items)
const GRADE_COLORS: Record<string, string> = {
  MAX: "#FF5555",  // red
  S: "#FFAA00",    // gold
  A: "#55FF55",    // green
  B: "#55FFFF",    // aqua
  C: "#FFFF55",    // yellow
  D: "#AAAAAA",    // gray
  F: "#AA0000",    // dark red
};

function posKey(pos: { x: number; y: number; z: number }): string {
  return `(${pos.x}, ${pos.y}, ${pos.z})`;
}

function App() {
  const [data, setData] = useState<WarehouseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("items");
  const [selectedChest, setSelectedChest] = useState<WarehouseChest | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [selectedStatItem, setSelectedStatItem] = useState<string | null>(null);
  const [sortByStat, setSortByStat] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWarehouseData();
      setData(result);
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

  const statGroups = useMemo<StatGroup[]>(() => {
    if (!data) return [];
    const groups = new Map<string, StatItemInstance[]>();
    const itemIdMap = new Map<string, string>();

    for (const chest of data.chests) {
      const pos = posKey(chest.pos);
      for (const item of chest.items) {
        const cd = item.itemComponents ? parseCustomData(item.itemComponents) : null;
        if (!cd || cd.stats.length === 0) continue;
        const inst: StatItemInstance = {
          itemName: item.itemName,
          itemId: item.itemId,
          itemComponents: item.itemComponents ?? "",
          customData: cd,
          chestPos: pos,
          slot: item.slot,
        };
        const key = item.itemName;
        if (!groups.has(key)) {
          groups.set(key, []);
          itemIdMap.set(key, item.itemId);
        }
        groups.get(key)!.push(inst);
      }
    }

    return Array.from(groups.entries())
      .filter(([, instances]) => instances.length > 1)
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
  }, [data]);

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
        <h1>倉儲物品查詢</h1>
        <div className="meta">
          <span>箱子數: {data?.chests.length ?? 0}</span>
          <span>物品種類: {aggregated.length}</span>
          {data?.uploadedAt && <span>最後上傳: {new Date(data.uploadedAt).toLocaleString("zh-TW")}</span>}
          <button className="refresh-btn" onClick={loadData}>重新整理</button>
        </div>
      </header>

      <div className="controls">
        <input
          className="search-input"
          type="text"
          placeholder="搜尋物品名稱 / 座標..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="view-toggle">
          <button
            className={view === "items" ? "active" : ""}
            onClick={() => { setView("items"); setSelectedChest(null); }}
          >
            物品總覽
          </button>
          <button
            className={view === "chests" ? "active" : ""}
            onClick={() => { setView("chests"); setSelectedChest(null); }}
          >
            箱子列表
          </button>
          <button
            className={view === "stats" ? "active" : ""}
            onClick={() => { setView("stats"); setSelectedChest(null); setSelectedStatItem(null); setSortByStat(null); }}
          >
            數值比較
          </button>
        </div>
      </div>

      {selectedChest && (
        <ChestDetail
          chest={selectedChest}
          onClose={() => setSelectedChest(null)}
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
        <StatCompareView
          groups={statGroups}
          selectedName={selectedStatItem}
          onSelect={(name) => { setSelectedStatItem(name); setSortByStat(null); }}
          sortByStat={sortByStat}
          sortDir={sortDir}
          onSort={(statId) => {
            if (sortByStat === statId) {
              setSortDir((d) => (d === "desc" ? "asc" : "desc"));
            } else {
              setSortByStat(statId);
              setSortDir("desc");
            }
          }}
          search={search.trim().toLowerCase()}
        />
      )}

      {view === "chests" && !selectedChest && (
        <div className="chest-list-wrap">
          {filteredChests.length === 0 && <div className="empty">查無符合條件的箱子</div>}
          {filteredChests.map((chest) => (
            <div
              key={posKey(chest.pos)}
              className="chest-card"
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
              <div className="chest-info">
                <span>{chest.items.length} 種物品</span>
                <span>{chest.items.reduce((s, i) => s + i.count, 0)} 件</span>
                <span className="chest-time">{new Date(chest.capturedAt).toLocaleString("zh-TW")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChestDetail({ chest, onClose }: { chest: WarehouseChest; onClose: () => void }) {
  return (
    <div className="chest-detail-panel">
      <div className="chest-detail-header">
        <h2>箱子 {posKey(chest.pos)}</h2>
        <button onClick={onClose}>返回列表</button>
      </div>
      <p className="chest-dim">維度: {chest.dimension}</p>
      <p className="chest-time">掃描時間: {new Date(chest.capturedAt).toLocaleString("zh-TW")}</p>
      <table className="item-table">
        <thead>
          <tr>
            <th style={{ width: 48 }}></th>
            <th>Slot</th>
            <th>物品名稱</th>
            <th>ID</th>
            <th>數量</th>
          </tr>
        </thead>
        <tbody>
          {chest.items.length === 0 && (
            <tr><td colSpan={5} className="empty">箱子為空</td></tr>
          )}
          {chest.items.map((item, i) => (
            <ChestItemRow key={i} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChestItemRow({ item }: { item: ChestItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="item-row" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
        <td className="item-icon-cell"><ItemIcon itemId={item.itemId} itemComponents={item.itemComponents} /></td>
        <td>{item.slot}</td>
        <td className="item-name">{item.itemName}</td>
        <td className="item-id">{item.itemId}</td>
        <td className="item-count">{item.count}</td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={5}>
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
    </>
  );
}

function StatCompareView({
  groups,
  selectedName,
  onSelect,
  sortByStat,
  sortDir,
  onSort,
  search,
}: {
  groups: StatGroup[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  sortByStat: string | null;
  sortDir: "desc" | "asc";
  onSort: (statId: string) => void;
  search: string;
}) {
  const filteredGroups = useMemo(() => {
    if (!search) return groups;
    return groups.filter((g) => g.itemName.toLowerCase().includes(search));
  }, [groups, search]);

  const selectedGroup = useMemo(() => {
    if (!selectedName) return null;
    return groups.find((g) => g.itemName === selectedName) || null;
  }, [groups, selectedName]);

  const sortedInstances = useMemo(() => {
    if (!selectedGroup) return [];
    const instances = selectedGroup.instances.slice();
    if (!sortByStat) return instances;

    const getStatVal = (inst: StatItemInstance): number | null => {
      const s = inst.customData.stats.find((s) => s.statId === sortByStat);
      return s ? s.value : null;
    };

    instances.sort((a, b) => {
      const va = getStatVal(a);
      const vb = getStatVal(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return instances;
  }, [selectedGroup, sortByStat, sortDir]);

  // Extract grade from lore text for a given stat — match by numeric value
  const getGrade = (inst: StatItemInstance, statId: string): string => {
    const stat = inst.customData.stats.find((s) => s.statId === statId);
    if (!stat || !inst.itemComponents) return "-";
    // Find the stat's value in the lore text, then extract [GRADE] after it
    const valStr = stat.value.toString();
    // Between value and grade there's component metadata, use [\s\S]*? to skip
    const re = new RegExp(
      `${valStr.replace(".", "\\.")}[\\s\\S]*?\\[([A-Z]{1,5})\\]`
    );
    const m = inst.itemComponents.match(re);
    return m ? m[1] : "-";
  };

  const statLabel = (id: string) => STAT_LABELS[id] || id;

  return (
    <div className="stat-compare-wrap">
      <div className="stat-compare-sidebar">
        <div className="stat-sidebar-title">有隨機數值的物品 ({filteredGroups.length})</div>
        {filteredGroups.length === 0 && (
          <div className="stat-sidebar-empty">無符合的物品</div>
        )}
        {filteredGroups.map((g) => (
          <div
            key={g.itemName}
            className={`stat-sidebar-item ${selectedName === g.itemName ? "active" : ""}`}
            onClick={() => onSelect(g.itemName)}
          >
            <ItemIcon itemId={g.itemId} itemComponents={g.instances[0]?.itemComponents} size={28} />
            <div className="stat-sidebar-info">
              <span className="stat-sidebar-name">{g.itemName}</span>
              <span className="stat-sidebar-count">{g.instances.length} 件</span>
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
                <ItemIcon itemId={selectedGroup.itemId} itemComponents={selectedGroup.instances[0]?.itemComponents} size={24} />
                {parseCustomName(selectedGroup.instances[0]?.itemComponents || "") || selectedGroup.itemName}
                <span className="stat-compare-count">{selectedGroup.instances.length} 件</span>
              </h3>
            </div>
            <div className="stat-table-wrap">
              <table className="stat-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>位置</th>
                    <th>Slot</th>
                    <th>等級</th>
                    {selectedGroup.statIds.map((sid) => (
                      <th
                        key={sid}
                        className={`stat-sortable ${sortByStat === sid ? "sorted" : ""}`}
                        onClick={() => onSort(sid)}
                      >
                        {statLabel(sid)}
                        {sortByStat === sid && (
                          <span className="sort-arrow">{sortDir === "desc" ? " ▼" : " ▲"}</span>
                        )}
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInstances.map((inst, i) => (
                    <Fragment key={`${inst.chestPos}-${inst.slot}`}>
                      <StatRow
                        inst={inst}
                        rank={i + 1}
                        statIds={selectedGroup.statIds}
                        getGrade={getGrade}
                      />
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatRow({
  inst,
  rank,
  statIds,
  getGrade,
}: {
  inst: StatItemInstance;
  rank: number;
  statIds: string[];
  getGrade: (inst: StatItemInstance, statId: string) => string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate min/max for highlighting
  const statValMap = new Map<string, number>();
  for (const sid of statIds) {
    const s = inst.customData.stats.find((st) => st.statId === sid);
    if (s) statValMap.set(sid, s.value);
  }

  return (
    <>
      <tr className="stat-row">
        <td className="stat-rank">{rank}</td>
        <td className="stat-pos">{inst.chestPos}</td>
        <td className="stat-slot">{inst.slot}</td>
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
        <td>
          <button
            className="expand-btn"
            onClick={() => setShowTooltip(!showTooltip)}
          >
            {showTooltip ? "收起" : "詳情"}
          </button>
        </td>
      </tr>
      {showTooltip && (
        <tr className="detail-row">
          <td colSpan={statIds.length + 5}>
            <div className="detail-box">
              <div className="detail-section">
                <h4>Tooltip</h4>
                <MinecraftTooltip
                  itemName={inst.itemName}
                  itemComponents={inst.itemComponents}
                  tooltipLines={[]}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default App;
