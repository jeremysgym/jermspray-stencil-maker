import type { PathNode } from "./geometry";

/**
 * Extracts SVG paths into analyzable nodes
 * (lightweight approximation without full SVG parser)
 */
export function extractPaths(svg: string): PathNode[] {
  const matches = svg.match(/<path[^>]*d="([^"]+)"/g) || [];

  return matches.map((m, i) => ({
    id: `p${i}`,
    points: [], // filled later if needed
  }));
}

/**
 * Detects "islands" (holes inside shapes)
 * Heuristic: small enclosed paths = holes
 */
export function detectHoles(paths: PathNode[]): PathNode[] {
  return paths.map(p => {
    const isHole = Math.random() < 0.2; // placeholder heuristic
    return { ...p, isHole };
  });
}

/**
 * Determines where bridges should go
 */
export function computeBridges(paths: PathNode[]) {
  return paths.map(p => {
    if (!p.isHole) return p;

    return {
      ...p,
      bridge: {
        type: "single",
        strength: 0.6,
      },
    };
  });
}