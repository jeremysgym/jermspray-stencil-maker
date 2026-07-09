/**
 * Browser-safe SVG optimizer.
 *
 * The full SVGO package depends on Node.js modules and cannot run
 * in the browser. For now we simply return the SVG unchanged.
 *
 * Later, SVG optimization can be performed:
 *   - in a Node build step
 *   - in a server API
 *   - or inside a desktop version of EmberDragon Forge.
 */
export function optimizeSvg(svg: string): string {
  return svg;
}