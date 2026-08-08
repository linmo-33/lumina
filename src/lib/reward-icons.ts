const iconMap = {
  "item-001": { label: "微光", glyph: "✦" },
  "item-020": { label: "星芒", glyph: "✧" },
  "item-200": { label: "月辉", glyph: "☾" },
  "item-170": { label: "极光", glyph: "◈" },
  "item-303": { label: "晨曦", glyph: "☼" },
  "item-321": { label: "晶体", glyph: "◇" },
  "item-353": { label: "花瓣", glyph: "✿" },
  "item-371": { label: "涡流", glyph: "◌" },
  "item-372": { label: "彩虹", glyph: "◒" },
  "item-373": { label: "流光", glyph: "◉" },
  "item-447": { label: "星云", glyph: "✺" },
  "item-476": { label: "灵感", glyph: "✦" },
} as const;

type LegacyRewardIconKey = keyof typeof iconMap;

export const REWARD_ICONS = (Object.keys(iconMap) as LegacyRewardIconKey[]).map((key) => ({
  key,
  label: iconMap[key].label,
  glyph: iconMap[key].glyph,
  src: "",
}));

export function getRewardIcon(key: string | null | undefined) {
  const safeKey = (key && key in iconMap ? key : "item-001") as LegacyRewardIconKey;
  return { key: safeKey, ...iconMap[safeKey], src: "" };
}
