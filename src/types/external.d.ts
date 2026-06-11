declare module "nearest-color" {
  interface NearestColorResult {
    name: string;
    value: string;
    rgb: { r: number; g: number; b: number };
    distance: number;
  }
  interface NearestColorFn {
    (input: string | { r: number; g: number; b: number }): NearestColorResult | undefined;
    from: (palette: Record<string, string> | string[]) => NearestColorFn;
  }
  const nearestColor: NearestColorFn;
  export default nearestColor;
}

declare module "color-name-list" {
  export const colornames: Array<{ name: string; hex: string }>;
}
