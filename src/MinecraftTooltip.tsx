import { useMemo } from "react";
import {
  parseLoreFromComponents,
  parseCustomData,
  parseCustomName,
  type LoreLine,
  type CustomData,
} from "./loreParser";

interface Props {
  itemName: string;
  itemComponents?: string;
  tooltipLines?: string[];
}

// Stat ID → display name mapping
const STAT_NAMES: Record<string, string> = {
  ATK: "攻擊力",
  ATK_SPD: "攻擊速度",
  WPN_DMG: "武器總傷害",
  DEF: "防禦力",
  HP: "生命值",
  MP: "魔量",
  MP_REGEN: "魔量恢復量",
  MOVE_SPD: "移動速度",
  SKILL_DMG: "技能傷害",
  CRIT_RATE: "暴擊率",
  CRIT_DMG: "暴擊傷害",
};

// Skill key → display name
const SKILL_KEYS: Record<string, string> = {
  L: "普通攻擊",
  RL: "右鍵技能",
  RR: "右鍵技能",
  SHIFT_L: "Shift+左鍵",
  SHIFT_R: "Shift+右鍵",
};

function renderLine(line: LoreLine, idx: number) {
  if (line.isSeparator) {
    return <hr key={idx} className="mc-tooltip-separator" />;
  }
  return (
    <div key={idx} className="mc-tooltip-line">
      {line.segments.map((seg, si) => (
        <span
          key={si}
          style={{
            color: seg.color,
            fontWeight: seg.bold ? "bold" : undefined,
            fontStyle: seg.italic ? "italic" : undefined,
            textDecoration: [
              seg.underlined ? "underline" : "",
              seg.strikethrough ? "line-through" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined,
          }}
        >
          {seg.text}
        </span>
      ))}
    </div>
  );
}

function CustomDataSection({ data, loreLines }: { data: CustomData; loreLines: LoreLine[] }) {
  // Try to match grades from lore text
  const gradeMap = new Map<string, string>();
  for (const line of loreLines) {
    const allText = line.segments.map((s) => s.text).join("");
    // Match "stat_name +value [GRADE] (xx%)"
    const m = allText.match(/([\p{L}\s]+?)\s*[+-][\d.]+\s*(?:%\s*)?\[([A-Z]+)\]/u);
    if (m) gradeMap.set(m[1].trim(), m[2]);
  }

  return (
    <div className="mc-tooltip-section">
      <div className="mc-tooltip-section-title">QPItem Data</div>
      {data.baseMaterial && (
        <div className="mc-tooltip-meta">
          <span className="mc-meta-label">基礎材質:</span> {data.baseMaterial}
        </div>
      )}
      {data.level !== undefined && (
        <div className="mc-tooltip-meta">
          <span className="mc-meta-label">需求等級:</span> {data.level}
        </div>
      )}
      {data.skills.length > 0 && (
        <div className="mc-tooltip-meta">
          <span className="mc-meta-label">技能綁定:</span>
          {data.skills.map((s) => (
            <span key={s.key} className="mc-skill-tag">
              {SKILL_KEYS[s.key] || s.key}: {s.skillId}
            </span>
          ))}
        </div>
      )}
      {data.stats.length > 0 && (
        <table className="mc-stat-table">
          <thead>
            <tr>
              <th>屬性</th>
              <th>數值</th>
              <th>等級</th>
            </tr>
          </thead>
          <tbody>
            {data.stats.map((stat) => (
              <tr key={stat.statId}>
                <td>{STAT_NAMES[stat.statId] || stat.statId}</td>
                <td>{stat.value}</td>
                <td>{gradeMap.get(STAT_NAMES[stat.statId] || stat.statId) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function MinecraftTooltip({ itemName, itemComponents, tooltipLines }: Props) {
  const parsed = useMemo(() => {
    if (!itemComponents) return null;
    const lore = parseLoreFromComponents(itemComponents);
    const customName = parseCustomName(itemComponents);
    const customData = parseCustomData(itemComponents);
    return { lore, customName, customData };
  }, [itemComponents]);

  // Fallback: no itemComponents or parse failed
  if (!parsed || parsed.lore.length === 0) {
    if (tooltipLines && tooltipLines.length > 0) {
      return (
        <div className="mc-tooltip mc-tooltip-fallback">
          <div className="mc-tooltip-name">{itemName}</div>
          {tooltipLines.map((l, i) => (
            <div key={i} className="mc-tooltip-line">{l}</div>
          ))}
        </div>
      );
    }
    return <span className="muted">無</span>;
  }

  return (
    <div className="mc-tooltip">
      <div className="mc-tooltip-name">
        {parsed.customName || itemName}
      </div>
      {parsed.lore.map((line, i) => renderLine(line, i))}
      {parsed.customData && (
        <CustomDataSection data={parsed.customData} loreLines={parsed.lore} />
      )}
    </div>
  );
}
