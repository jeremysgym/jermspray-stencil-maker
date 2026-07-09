import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";

import type { BridgePoint } from "../geometry/bridgeEngine";
import type {
  LayerShape,
  LayerShapeStyle,
  RegistrationMark,
  StencilLayer,
  StencilLayerSet,
} from "../layers/layerBuilder";

const SVG_NS = "http://www.w3.org/2000/svg";
const BRIDGE_HEIGHT = 2;

export interface SvgExportSet {
  base: string;
  cut: string;
  detail: string;
  align: string;
}

export function layerToSvg(layer: StencilLayer): string {
  const doc = buildLayerDocument(layer);
  return serializeDocument(doc);
}

export function layersToSvgSet(layers: StencilLayerSet): SvgExportSet {
  return {
    base: layerToSvg(layers.base),
    cut: layerToSvg(layers.cut),
    detail: layerToSvg(layers.detail),
    align: layerToSvg(layers.align),
  };
}

function buildLayerDocument(layer: StencilLayer): Document {
  const impl = new DOMImplementation();
  const doc = impl.createDocument(SVG_NS, "svg", null);
  const root = doc.documentElement;

  const viewBox =
    layer.canvas.viewBox ?? `0 0 ${layer.canvas.width} ${layer.canvas.height}`;

  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("width", String(layer.canvas.width));
  root.setAttribute("height", String(layer.canvas.height));
  root.setAttribute("viewBox", viewBox);

  for (const shape of layer.shapes) {
    appendLayerShape(doc, root, shape);
  }

  if (layer.registrationMarks) {
    for (const mark of layer.registrationMarks) {
      appendRegistrationMark(doc, root, mark);
    }
  }

  return doc;
}

function appendLayerShape(
  doc: Document,
  root: Element,
  shape: LayerShape,
): void {
  const node = cloneShapeElement(doc, shape.path.element.element);
  applyStyle(node, shape.style);
  root.appendChild(node);

  for (const bridge of shape.bridges) {
    appendBridge(doc, root, bridge);
  }
}

function cloneShapeElement(doc: Document, source: Element): Element {
  const cloned = doc.importNode(source, true) as Element;

  if (cloned.ownerDocument === doc) {
    return cloned;
  }

  return manualClone(doc, source);
}

function manualClone(doc: Document, source: Element): Element {
  const element = doc.createElementNS(SVG_NS, source.tagName);
  const attributes = source.attributes;

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes.item(i);

    if (attribute) {
      element.setAttribute(attribute.name, attribute.value);
    }
  }

  return element;
}

function applyStyle(element: Element, style: LayerShapeStyle): void {
  if (style.fill !== null) {
    element.setAttribute("fill", style.fill);
  } else {
    element.removeAttribute("fill");
  }

  if (style.stroke !== null) {
    element.setAttribute("stroke", style.stroke);
  } else {
    element.removeAttribute("stroke");
  }

  if (style.strokeWidth !== undefined) {
    element.setAttribute("stroke-width", String(style.strokeWidth));
  } else {
    element.removeAttribute("stroke-width");
  }
}

function appendBridge(doc: Document, root: Element, bridge: BridgePoint): void {
  const rect = doc.createElementNS(SVG_NS, "rect");

  rect.setAttribute("x", String(bridge.x - bridge.width / 2));
  rect.setAttribute("y", String(bridge.y));
  rect.setAttribute("width", String(bridge.width));
  rect.setAttribute("height", String(BRIDGE_HEIGHT));
  rect.setAttribute("fill", "#ffffff");
  rect.setAttribute("data-bridge", "true");

  root.appendChild(rect);
}

function appendRegistrationMark(
  doc: Document,
  root: Element,
  mark: RegistrationMark,
): void {
  const rect = doc.createElementNS(SVG_NS, "rect");

  rect.setAttribute("x", String(mark.x));
  rect.setAttribute("y", String(mark.y));
  rect.setAttribute("width", String(mark.size));
  rect.setAttribute("height", String(mark.size));
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", "#000000");

  root.appendChild(rect);
}

function serializeDocument(doc: Document): string {
  const serializer = new XMLSerializer();
  const body = serializer.serializeToString(doc);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}
