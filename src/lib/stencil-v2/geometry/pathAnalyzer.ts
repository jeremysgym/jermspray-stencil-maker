// src/lib/stencil-v2/geometry/pathAnalyzer.ts

import { SVGPathData } from "svg-pathdata";
import { GeometryPath } from "./pathGeometry";

export function analyzePaths(paths: GeometryPath[]): GeometryPath[] {

  for (const path of paths) {

    const d = path.element.attributes["d"];

    if (!d)
      continue;

    try {

      const commands = new SVGPathData(d).commands;

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const cmd of commands) {

        if ("x" in cmd) {
          minX = Math.min(minX, cmd.x);
          maxX = Math.max(maxX, cmd.x);
        }

        if ("y" in cmd) {
          minY = Math.min(minY, cmd.y);
          maxY = Math.max(maxY, cmd.y);
        }

      }

      if (minX !== Number.POSITIVE_INFINITY) {

        path.bbox = {
          minX,
          minY,
          maxX,
          maxY,
        };

        path.area =
          (maxX - minX) *
          (maxY - minY);

      }

    }
    catch (err) {

      console.warn(
        "Unable to analyze path:",
        path.id,
        err,
      );

    }

  }

  return paths;

}
