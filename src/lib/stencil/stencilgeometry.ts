export type Point = {
  x: number;
  y: number;
};

export type SvgPath = {
  id: string;
  d: string;
};

export type PathGeometry = {
  id: string;
  path: SvgPath;
  bbox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  area: number;
  isHole: boolean;
  parentId: string | null;
};

export type GeometryResult = {
  paths: PathGeometry[];
  holes: PathGeometry[];
  solids: PathGeometry[];
};

/* -------------------------------------------------------
   STEP 1 — Extract raw <path d="">
------------------------------------------------------- */
export function parseSvgPaths(svg: string): SvgPath[] {
  const matches = svg.match(/<path[^>]*d="([^"]+)"/g) || [];

  return matches.map((m, i) => {
    const dMatch = m.match(/d="([^"]+)"/);
    return {
      id: `p${i}`,
      d: dMatch ? dMatch[1] : "",
    };
  });
}

/* -------------------------------------------------------
   STEP 2 — VERY LIGHT BBOX ESTIMATION (no heavy libs yet)
   (We upgrade this later to real SVG path math)
------------------------------------------------------- */
function estimateBBox(d: string) {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x == null || y == null) continue;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!isFinite(minX)) {
    minX = minY = maxX = maxY = 0;
  }

  return { minX, minY, maxX, maxY };
}

/* -------------------------------------------------------
   STEP 3 — AREA ESTIMATION (heuristic for now)
------------------------------------------------------- */
function estimateArea(bbox: ReturnType<typeof estimateBBox>) {
  return (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY);
}

/* -------------------------------------------------------
   STEP 4 — BUILD GEOMETRY OBJECTS
------------------------------------------------------- */
export function analyzeGeometry(paths: SvgPath[]): GeometryResult {
  const geometries: PathGeometry[] = paths.map((p) => {
    const bbox = estimateBBox(p.d);
    const area = estimateArea(bbox);

    return {
      id: p.id,
      path: p,
      bbox,
      area,
      isHole: false,
      parentId: null,
    };
  });

  /* -----------------------------------------------------
     STEP 5 — HOLE DETECTION (FIRST REAL VERSION)
     Rule:
     - small area inside big area => likely hole
  ----------------------------------------------------- */
  const sorted = [...geometries].sort((a, b) => b.area - a.area);

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const parent = sorted[i];
      const child = sorted[j];

      const inside =
        child.bbox.minX >= parent.bbox.minX &&
        child.bbox.minY >= parent.bbox.minY &&
        child.bbox.maxX <= parent.bbox.maxX &&
        child.bbox.maxY <= parent.bbox.maxY;

      if (inside && child.area < parent.area * 0.5) {
        child.isHole = true;
        child.parentId = parent.id;
      }
    }
  }

  return {
    paths: geometries,
    holes: geometries.filter((p) => p.isHole),
    solids: geometries.filter((p) => !p.isHole),
  };
}

/* -------------------------------------------------------
   STEP 6 — BRIDGE ENGINE (FIRST VERSION)
------------------------------------------------------- */
export function generateBridges(geometry: GeometryResult) {
  return geometry.paths.map((p) => {
    if (!p.isHole) return p;

    // place a simple top-center bridge marker (placeholder)
    return {
      ...p,
      path: {
        ...p.path,
        d: p.path.d + " /*bridge*/",
      },
    };
  });
}

/* -------------------------------------------------------
   STEP 7 — STENCIL LAYERS (STRUCTURE ONLY)
------------------------------------------------------- */
export function buildStencilLayers(
  svg: string,
  geometry: any,
  opts: { width: number; height: number },
) {
  return {
    base: svg,
    cut: svg,
    detail: svg,
    align: `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="${opts.width}"
           height="${opts.height}"
           viewBox="0 0 ${opts.width} ${opts.height}">
        <rect x="10" y="10" width="10" height="10" fill="none" stroke="black"/>
        <rect x="${opts.width - 20}" y="10" width="10" height="10" fill="none" stroke="black"/>
        <rect x="10" y="${opts.height - 20}" width="10" height="10" stroke="black" fill="none"/>
        <rect x="${opts.width - 20}" y="${opts.height - 20}" width="10" height="10" stroke="black" fill="none"/>
      </svg>
    `,
  };
}