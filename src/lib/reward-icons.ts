import item001 from "animal-island-ui/items/item-001.png";
import item020 from "animal-island-ui/items/item-020.png";
import item200 from "animal-island-ui/items/item-200.png";
import item170 from "animal-island-ui/items/item-170.png";
import item303 from "animal-island-ui/items/item-303.png";
import item321 from "animal-island-ui/items/item-321.png";
import item353 from "animal-island-ui/items/item-353.png";
import item371 from "animal-island-ui/items/item-371.png";
import item372 from "animal-island-ui/items/item-372.png";
import item373 from "animal-island-ui/items/item-373.png";
import item447 from "animal-island-ui/items/item-447.png";
import item476 from "animal-island-ui/items/item-476.png";
import type { SlotIconKey } from "@/lib/reward-policy";

function resolveItemSource(asset: string | { src: string }) {
  return typeof asset === "string" ? asset : asset.src;
}

export const REWARD_ICONS: ReadonlyArray<{
  key: SlotIconKey;
  label: string;
  src: string;
}> = [
  { key: "item-001", label: "物品 001", src: resolveItemSource(item001) },
  { key: "item-020", label: "物品 020", src: resolveItemSource(item020) },
  { key: "item-200", label: "物品 200", src: resolveItemSource(item200) },
  { key: "item-170", label: "物品 170", src: resolveItemSource(item170) },
  { key: "item-303", label: "物品 303", src: resolveItemSource(item303) },
  { key: "item-321", label: "物品 321", src: resolveItemSource(item321) },
  { key: "item-353", label: "物品 353", src: resolveItemSource(item353) },
  { key: "item-371", label: "物品 371", src: resolveItemSource(item371) },
  { key: "item-372", label: "物品 372", src: resolveItemSource(item372) },
  { key: "item-373", label: "物品 373", src: resolveItemSource(item373) },
  { key: "item-447", label: "物品 447", src: resolveItemSource(item447) },
  { key: "item-476", label: "物品 476", src: resolveItemSource(item476) },
];

export function getRewardIcon(key: string | null | undefined) {
  return REWARD_ICONS.find((icon) => icon.key === key) ?? REWARD_ICONS[0];
}
