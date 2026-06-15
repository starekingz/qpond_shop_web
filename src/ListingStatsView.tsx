import { useEffect, useMemo, useState } from "react";
import { fetchAllActiveListings, type Listing } from "./listings";
import { parseCustomData } from "./loreParser";
import MinecraftTooltip from "./MinecraftTooltip";
import ItemIcon from "./ItemIcon";

const STAT_LABELS: Record<string, string> = {
  DAMAGE: "傷害",
  ATTACK_SPEED: "攻速",
  CRIT_CHANCE: "暴擊率",
  CRIT_DAMAGE: "暴擊傷害",
  HEALTH: "生命",
  DEFENSE: "防禦",
  SPEED: "速度",
  MANA: "魔力",
  MANA_REGEN: "魔力恢復",
  ABILITY_HASTE: "技能疾速",
};

type StatsListing = Listing & {
  stats: { statId: string; value: number }[];
};

type StatsGroup = {
  itemName: string;
  listings: StatsListing[];
  statIds: string[];
};

type SortConfig = { statId: string; dir: "asc" | "desc" } | null;

export default function ListingStatsView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);

  useEffect(() => {
    fetchAllActiveListings()
      .then(setListings)
      .finally(() => setLoading(false));
  }, []);

  // Filter to single-type listings with stats
  const statsListings = useMemo<StatsListing[]>(() => {
    const result: StatsListing[] = [];
    for (const l of listings) {
      if (l.listingType !== "single") continue;
      if (!l.itemComponents) continue;
      const cd = parseCustomData(l.itemComponents);
      if (!cd || cd.stats.length === 0) continue;
      result.push({ ...l, stats: cd.stats });
    }
    return result;
  }, [listings]);

  // Group by itemName
  const groups = useMemo<StatsGroup[]>(() => {
    const map = new Map<string, StatsListing[]>();
    for (const l of statsListings) {
      if (!map.has(l.itemName)) map.set(l.itemName, []);
      map.get(l.itemName)!.push(l);
    }
    return Array.from(map.entries())
      .map(([itemName, lss]) => {
        const statIdSet = new Set<string>();
        for (const ls of lss) for (const s of ls.stats) statIdSet.add(s.statId);
        return { itemName, listings: lss, statIds: Array.from(statIdSet) };
      })
      .sort((a, b) => b.listings.length - a.listings.length);
  }, [statsListings]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    return groups.filter((g) =>
      g.itemName.toLowerCase().includes(search.trim().toLowerCase())
    );
  }, [groups, search]);

  // Sort listings within a group by a specific stat
  const getStatValue = (listing: StatsListing, statId: string): number | null => {
    const stat = listing.stats.find((s) => s.statId === statId);
    return stat ? stat.value : null;
  };

  const sortListings = (lss: StatsListing[]): StatsListing[] => {
    if (!sort) return lss;
    return [...lss].sort((a, b) => {
      const va = getStatValue(a, sort.statId);
      const vb = getStatValue(b, sort.statId);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sort.dir === "asc" ? va - vb : vb - va;
    });
  };

  const toggleSort = (statId: string) => {
    if (sort?.statId === statId) {
      setSort(sort.dir === "asc" ? { statId, dir: "desc" } : null);
    } else {
      setSort({ statId, dir: "desc" });
    }
  };

  if (loading) return <div className="shop-loading">載入中...</div>;

  return (
    <div className="shop-stats-wrap">
      <div className="shop-stats-header">
        <h2>數值比較（僅上架商品）</h2>
        <div className="shop-stats-controls">
          <input
            type="text"
            className="shop-stats-search"
            placeholder="搜尋物品名稱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {sort && (
            <button className="shop-stats-clear-sort" onClick={() => setSort(null)}>
              清除排序: {STAT_LABELS[sort.statId] || sort.statId}
              {sort.dir === "asc" ? " ↑" : " ↓"}
            </button>
          )}
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="empty">無符合的物品</div>
      ) : (
        <div className="shop-stats-list">
          {filteredGroups.map((group) => {
            const isExpanded = expandedName === group.itemName;
            const sortedListings = isExpanded ? sortListings(group.listings) : group.listings;
            return (
              <div key={group.itemName} className="stat-group-card">
                <div
                  className={`stat-group-header ${isExpanded ? "expanded" : ""}`}
                  onClick={() => setExpandedName(isExpanded ? null : group.itemName)}
                >
                  <ItemIcon
                    itemId={group.listings[0].itemId}
                    itemComponents={group.listings[0].itemComponents}
                    size={28}
                  />
                  <span className="stat-group-name">{group.itemName}</span>
                  <span className="stat-group-count">{group.listings.length} 件</span>
                  <span className="expand-arrow">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {isExpanded && (
                  <div className="stat-group-body">
                    <div className="stat-sort-buttons">
                      <span className="stat-sort-label">排序：</span>
                      {group.statIds.map((sid) => (
                        <button
                          key={sid}
                          className={`stat-sort-btn ${sort?.statId === sid ? "active" : ""}`}
                          onClick={(e) => { e.stopPropagation(); toggleSort(sid); }}
                        >
                          {STAT_LABELS[sid] || sid}
                          {sort?.statId === sid && (sort.dir === "asc" ? " ↑" : " ↓")}
                        </button>
                      ))}
                    </div>
                    {sortedListings.map((listing) => (
                      <div key={listing.id} className="stat-instance">
                        <div className="stat-instance-header">
                          <ItemIcon itemId={listing.itemId} itemComponents={listing.itemComponents} size={24} />
                          <span className="stat-instance-price">{listing.price.toLocaleString()} $</span>
                          <span className="stat-instance-count">庫存: {listing.count}</span>
                        </div>
                        <div className="stat-instance-tooltip">
                          <MinecraftTooltip
                            itemName={listing.itemName}
                            itemComponents={listing.itemComponents}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
