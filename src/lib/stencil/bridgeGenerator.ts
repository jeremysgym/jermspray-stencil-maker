import type { PathGeometry } from "./stencilGeometry";

export type BridgedPath = PathGeometry & {
  bridges: Bridge[];
};

export type Bridge = {
  x: number;
  y: number;
  width: number;
  type: "hole-bridge";
};

/* -------------------------------------------------------
   MAIN ENTRY
------------------------------------------------------- */
export function generateBridges(paths: PathGeometry[]): BridgedPath[] {
  return paths.map((p) => {
    if (!p.isHole) {
      return {
        ...p,
        bridges: [],
      };
    }

    const bridge = createTopCenterBridge(p);

    return {
      ...p,
      bridges: [bridge],
    };
  });
}

/* -------------------------------------------------------
   BRIDGE POSITIONING STRATEGY (FIRST REAL VERSION)
   - Places bridge at top-center of bounding box
   - Width scales slightly with shape size
------------------------------------------------------- */
function createTopCenterBridge(p: PathGeometry): Bridge {
  const { minX, maxX, minY } = p.bbox;

  const width = Math.max(6, (maxX - minX) * 0.15);

  return {
    x: (minX + maxX) / 2,
    y: minY,
    width,
    type: "hole-bridge",
  };
}

/* -------------------------------------------------------
   APPLY BRIDGES INTO SVG (LIGHTWEIGHT PASS)
------------------------------------------------------- */
export function applyBridgesToSvg(svg: string, paths: BridgedPath[]) {
  let out = svg;

  for (const p of paths) {
    if (!p.bridges.length) continue;

    for (const b of p.bridges) {
      const bridgeRect = `
        <rect
          x="${b.x - b.width / 2}"
          y="${b.y}"
          width="${b.width}"
          height="2"
          fill="white"
        />
      `;

      out = out.replace("</svg>", `${bridgeRect}</svg>`);
    }
  }

  return out;
}
