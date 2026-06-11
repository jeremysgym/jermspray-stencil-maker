import nearestColor from "nearest-color";
import { colornames } from "color-name-list";

const palette: Record<string, string> = {};
for (const c of colornames as Array<{ name: string; hex: string }>) {
  palette[c.name] = c.hex;
}
const nearest = nearestColor.from(palette);

export function nameForHex(hex: string): string {
  try {
    const r = nearest(hex);
    return r?.name ?? hex;
  } catch {
    return hex;
  }
}
