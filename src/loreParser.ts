// ── Minecraft color name → hex mapping ──────────────────
const MC_COLORS: Record<string, string> = {
  black: "#000000",
  dark_blue: "#0000AA",
  dark_green: "#00AA00",
  dark_aqua: "#00AAAA",
  dark_red: "#AA0000",
  dark_purple: "#AA00AA",
  gold: "#FFAA00",
  gray: "#AAAAAA",
  dark_gray: "#555555",
  blue: "#5555FF",
  green: "#55FF55",
  aqua: "#55FFFF",
  red: "#FF5555",
  light_purple: "#FF55FF",
  yellow: "#FFFF55",
  white: "#FFFFFF",
};

export interface LoreSegment {
  text: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  strikethrough: boolean;
}

export interface LoreLine {
  segments: LoreSegment[];
  isSeparator: boolean;
}

export interface SkillBinding {
  key: string;
  skillId: string;
}

export interface StatEntry {
  statId: string;
  value: number;
  grade?: string;
  operation: string;
}

export interface CustomData {
  baseMaterial?: string;
  skills: SkillBinding[];
  stats: StatEntry[];
  level?: number;
  conditions?: string[];
}

// ── Find matching bracket at a given depth ───────────────
function findMatchingBracket(str: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === open) depth++;
    else if (str[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ── Parse a single style string ─────────────────────────
function parseStyle(styleStr: string): Omit<LoreSegment, "text"> {
  let color = "#FFFFFF";

  // Match color=VALUE (name or #RRGGBB)
  const colorMatch = styleStr.match(/color=([^,]+)/);
  if (colorMatch) {
    const c = colorMatch[1].trim();
    if (c.startsWith("#")) {
      color = c;
    } else {
      color = MC_COLORS[c] || "#FFFFFF";
    }
  }

  // Boolean style flags: "bold" = true, "!bold" = false
  const checkFlag = (flag: string): boolean => {
    const re = new RegExp(`(^|,)\\s*(!?)${flag}\\b`);
    const m = styleStr.match(re);
    if (!m) return false;
    return m[2] !== "!"; // m[2] is "!" if negated, "" if not
  };

  return {
    color,
    bold: checkFlag("bold"),
    italic: checkFlag("italic"),
    underlined: checkFlag("underlined"),
    strikethrough: checkFlag("strikethrough"),
  };
}

// ── Detect separator line (only Unicode PUA characters) ──
function isSeparatorText(text: string): boolean {
  if (text.length === 0) return false;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // Allow Unicode PUA (U+E000-U+F8FF), spaces, and some special chars
    if (code >= 0xE000 && code <= 0xF8FF) continue;
    if (code === 0x20 || code === 0xA0) continue; // spaces
    if (code >= 0xF0000 && code <= 0xFFFFF) continue; // supplementary PUA
    return false;
  }
  return true;
}

// ── Extract the lines=[...] section from lore ────────────
function extractLinesSection(components: string): string | null {
  // Find minecraft:lore=>...lines=[
  const loreStart = components.indexOf("minecraft:lore=>");
  if (loreStart === -1) return null;

  const linesMarker = "lines=[";
  const linesIdx = components.indexOf(linesMarker, loreStart);
  if (linesIdx === -1) return null;

  const bracketStart = linesIdx + linesMarker.length - 1; // position of '['
  const bracketEnd = findMatchingBracket(components, bracketStart, "[", "]");
  if (bracketEnd === -1) return null;

  return components.substring(bracketStart + 1, bracketEnd);
}

// ── Parse literal{TEXT}[style={...}] segments from a line ─
function parseLiteralSegments(lineStr: string): LoreSegment[] {
  const segments: LoreSegment[] = [];
  // Match: literal{TEXT}[style={STYLE}]
  // TEXT can contain anything except unescaped }
  const re = /literal\{([^}]*)\}\[style=\{([^}]*)\}\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineStr)) !== null) {
    const text = m[1];
    const style = parseStyle(m[2]);
    segments.push({ text, ...style });
  }
  return segments;
}

// ── Parse lore lines from itemComponents ─────────────────
export function parseLoreFromComponents(components: string): LoreLine[] {
  const linesSection = extractLinesSection(components);
  if (!linesSection) return [];

  const result: LoreLine[] = [];

  // Split by "empty[siblings=" — each occurrence is a line
  // But we need to handle nested brackets carefully.
  // Strategy: find each "empty[" that starts a line, then find its matching "]"
  let pos = 0;
  while (pos < linesSection.length) {
    // Find next "empty["
    const emptyIdx = linesSection.indexOf("empty[", pos);
    if (emptyIdx === -1) break;

    // Find matching ] for this empty[
    const bracketEnd = findMatchingBracket(linesSection, emptyIdx + 5, "[", "]");
    if (bracketEnd === -1) break;

    const lineStr = linesSection.substring(emptyIdx, bracketEnd + 1);
    const segments = parseLiteralSegments(lineStr);

    // Check if all text in segments is separator characters
    const allText = segments.map((s) => s.text).join("");
    const isSeparator = segments.length > 0 && isSeparatorText(allText);

    result.push({ segments, isSeparator });
    pos = bracketEnd + 1;
  }

  return result;
}

// ── Parse custom_name from components ────────────────────
export function parseCustomName(components: string): string | null {
  const match = components.match(/minecraft:custom_name=>.*?literal\{([^}]*)\}/);
  return match ? match[1] : null;
}

// ── Parse custom_data QPItem from components ─────────────
export function parseCustomData(components: string): CustomData | null {
  const cdIdx = components.indexOf("minecraft:custom_data=>");
  if (cdIdx === -1) return null;

  const jsonStart = cdIdx + "minecraft:custom_data=>".length;
  // Find matching { }
  const braceEnd = findMatchingBracket(components, jsonStart, "{", "}");
  if (braceEnd === -1) return null;

  const raw = components.substring(jsonStart, braceEnd + 1);

  const data: CustomData = { skills: [], stats: [] };

  // Extract base_material
  const bmMatch = raw.match(/base_material:"([^"]+)"/);
  if (bmMatch) data.baseMaterial = bmMatch[1];

  // Extract level
  const lvlMatch = raw.match(/level:(\d+)/);
  if (lvlMatch) data.level = parseInt(lvlMatch[1], 10);

  // Extract conditions
  const condMatch = raw.match(/conditions:\[([^\]]*)\]/);
  if (condMatch) {
    data.conditions = [...condMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }

  // Extract skills: {L:"...",RL:"...",RR:"..."}
  const skillsMatch = raw.match(/skills:\{([^}]*)\}/);
  if (skillsMatch) {
    const skillRe = /(\w+):"([^"]+)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = skillRe.exec(skillsMatch[1])) !== null) {
      data.skills.push({ key: sm[1], skillId: sm[2] });
    }
  }

  // Extract stats: [{stat_id:"ATK", final_value:40.07f, ...}, ...]
  const statsMatch = raw.match(/stats:\[/);
  if (statsMatch) {
    const statsStart = raw.indexOf("stats:[") + "stats:[".length - 1;
    const statsEnd = findMatchingBracket(raw, statsStart, "[", "]");
    if (statsEnd !== -1) {
      const statsStr = raw.substring(statsStart + 1, statsEnd);
      // Match each {stat_id:"...", final_value:...f, ...}
      const statRe = /\{([^}]+)\}/g;
      let stm: RegExpExecArray | null;
      while ((stm = statRe.exec(statsStr)) !== null) {
        const entry = stm[1];
        const idMatch = entry.match(/stat_id:"([^"]+)"/);
        const valMatch = entry.match(/final_value:([\d.]+)/);
        const opMatch = entry.match(/operation:"([^"]+)"/);
        // Try to extract grade from lore text later
        if (idMatch && valMatch) {
          data.stats.push({
            statId: idMatch[1],
            value: parseFloat(valMatch[1]),
            operation: opMatch ? opMatch[1] : "ADDITIVE",
          });
        }
      }
    }
  }

  if (!data.baseMaterial && data.skills.length === 0 && data.stats.length === 0) {
    return null;
  }
  return data;
}

// ── Extract grade tags like [MAX], [B], [C] from lore ───
export function extractGrades(loreLines: LoreLine[]): Map<string, string> {
  const grades = new Map<string, string>();
  for (const line of loreLines) {
    for (const seg of line.segments) {
      // Match patterns like "攻擊力 " followed by "+40.07 " followed by "[MAX]"
      // The grade is in a segment matching \[[A-Z]+\] or \[MAX\]
      const gradeMatch = seg.text.match(/\[([A-Z]+(?:AX)?)\]/);
      if (gradeMatch) {
        // Look backward in the same line to find the stat name
        const idx = line.segments.indexOf(seg);
        for (let i = idx - 1; i >= 0; i--) {
          const prevText = line.segments[i].text.trim();
          if (prevText.length > 0 && !prevText.match(/^[+\-\d.%\s]+$/)) {
            grades.set(prevText.replace(/\s+$/, ""), gradeMatch[1]);
            break;
          }
        }
      }
    }
  }
  return grades;
}
