import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Camera,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileImage,
  FolderOpen,
  ImageIcon,
  Images,
  Paintbrush,
  Plus,
  Printer,
  Save,
  Sparkles,
  X,

} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  estimateColorCount,
  hexToRgb,
  quantize,
  renderLayerCumulative,
  renderLayerIsolated,
  renderQuantized,
  renderSilhouette,
  rgbToHex,
  type RGB,
} from "@/lib/stencil/quantize";
import { detectAndRemoveBackground } from "@/lib/stencil/bg-removal";
import { nameForHex } from "@/lib/stencil/color-name";
import { traceLayerToSvg, traceSilhouetteToSvg } from "@/lib/stencil/trace";
import { ZoomPanImage } from "@/components/ZoomPanImage";

function randomProjectName() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `JermSpray-Stencil-${n}`;
}

function imageDataToCanvas(img: ImageData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}

function imageDataToDataURL(img: ImageData, mime = "image/png") {
  return imageDataToCanvas(img).toDataURL(mime);
}

function imageDataToBlob(img: ImageData): Promise<Blob> {
  return new Promise((resolve) => {
    imageDataToCanvas(img).toBlob((b) => resolve(b!), "image/png");
  });
}

function svgWrapImage(width: number, height: number, dataUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${dataUrl}" width="${width}" height="${height}" />
</svg>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function drawMarkers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  size: number,
  inset: number,
  corners: { tl: boolean; tr: boolean; bl: boolean; br: boolean },
  color = "#000",
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size / 8);
  ctx.lineCap = "round";
  const positions: Array<[number, number]> = [];
  if (corners.tl) positions.push([inset, inset]);
  if (corners.tr) positions.push([width - inset, inset]);
  if (corners.bl) positions.push([inset, height - inset]);
  if (corners.br) positions.push([width - inset, height - inset]);
  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.moveTo(x - size / 2, y);
    ctx.lineTo(x + size / 2, y);
    ctx.moveTo(x, y - size / 2);
    ctx.lineTo(x, y + size / 2);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Background removal editing dialog ----------------------------------
function BgEditor({
  open,
  onOpenChange,
  source,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: ImageData | null;
  onApply: (mask: Uint8Array) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<Uint8Array | null>(null);
  const baseRef = useRef<ImageData | null>(null);
  const [mode, setMode] = useState<"erase" | "restore">("erase");
  const [brush, setBrush] = useState(24);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    if (!open || !source) return;
    baseRef.current = source;
    const mask = detectAndRemoveBackground(source.data, source.width, source.height, 36);
    maskRef.current = mask;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const base = baseRef.current;
    const mask = maskRef.current;
    if (!c || !base || !mask) return;
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext("2d")!;
    // checkerboard
    const tile = 12;
    for (let y = 0; y < c.height; y += tile) {
      for (let x = 0; x < c.width; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) | 0) % 2 ? "#ccc" : "#eee";
        ctx.fillRect(x, y, tile, tile);
      }
    }
    const out = new ImageData(base.width, base.height);
    for (let p = 0; p < mask.length; p++) {
      const i = p * 4;
      if (mask[p]) {
        out.data[i] = base.data[i];
        out.data[i + 1] = base.data[i + 1];
        out.data[i + 2] = base.data[i + 2];
        out.data[i + 3] = base.data[i + 3];
      } else {
        out.data[i + 3] = 0;
      }
    }
    const tmp = document.createElement("canvas");
    tmp.width = c.width;
    tmp.height = c.height;
    tmp.getContext("2d")!.putImageData(out, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }, []);

  const paint = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    const mask = maskRef.current;
    if (!c || !mask) return;
    const rect = c.getBoundingClientRect();
    const sx = c.width / rect.width;
    const sy = c.height / rect.height;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;
    const r = brush * Math.max(sx, sy);
    const r2 = r * r;
    const xMin = Math.max(0, Math.floor(x - r));
    const xMax = Math.min(c.width - 1, Math.ceil(x + r));
    const yMin = Math.max(0, Math.floor(y - r));
    const yMax = Math.min(c.height - 1, Math.ceil(y + r));
    for (let yy = yMin; yy <= yMax; yy++) {
      for (let xx = xMin; xx <= xMax; xx++) {
        const dx = xx - x, dy = yy - y;
        if (dx * dx + dy * dy <= r2) {
          mask[yy * c.width + xx] = mode === "restore" ? 1 : 0;
        }
      }
    }
    redraw();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="display text-2xl">Remove Background</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={mode === "erase" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("erase")}
          >
            <Eraser className="h-4 w-4 mr-1" /> Erase
          </Button>
          <Button
            variant={mode === "restore" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("restore")}
          >
            <Paintbrush className="h-4 w-4 mr-1" /> Restore
          </Button>
          <div className="flex items-center gap-2 min-w-[220px] flex-1">
            <Label className="text-xs whitespace-nowrap">Brush {brush}px</Label>
            <Slider value={[brush]} min={2} max={120} step={1} onValueChange={(v) => setBrush(v[0])} />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-muted rounded-md">
          <canvas
            ref={canvasRef}
            className="w-full h-auto touch-none cursor-crosshair block"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              setDrawing(true);
              paint(e);
            }}
            onPointerMove={(e) => drawing && paint(e)}
            onPointerUp={() => setDrawing(false)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            onClick={() => {
              if (maskRef.current) onApply(maskRef.current.slice());
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Main component -----------------------------------------------------
export function StencilMaker() {
  // Project
  const [projectName, setProjectName] = useState(randomProjectName());

  // Source image
  const [sourceData, setSourceData] = useState<ImageData | null>(null); // possibly large
  const [workData, setWorkData] = useState<ImageData | null>(null); // resized for processing
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [bgEditorOpen, setBgEditorOpen] = useState(false);
  const [bgRemovalEnabled, setBgRemovalEnabled] = useState(false);

  // Quantization
  const [numLayers, setNumLayers] = useState(5);
  const [detectedColors, setDetectedColors] = useState<number | null>(null);
  const [palette, setPalette] = useState<RGB[]>([]);
  const [labels, setLabels] = useState<Int32Array | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<Set<number>>(new Set());

  // Display options
  const [bgColor, setBgColor] = useState("#ffffff");
  const [showOriginal, setShowOriginal] = useState(false);
  const [includeSilhouette, setIncludeSilhouette] = useState(true);

  // Size
  const [outWidth, setOutWidth] = useState(800);
  const [outHeight, setOutHeight] = useState(800);
  const [aspect, setAspect] = useState(1);

  // Markers
  const [markersEnabled, setMarkersEnabled] = useState(false);
  const [markerCorners, setMarkerCorners] = useState({ tl: true, tr: true, bl: true, br: true });
  const [markerSize, setMarkerSize] = useState(20);
  const [markerInset, setMarkerInset] = useState(24);

  // Zoom dialog
  const [zoomLayer, setZoomLayer] = useState<number | null>(null);
  const [mainOpen, setMainOpen] = useState(false);
  const [imageMapOpen, setImageMapOpen] = useState(false);
  const [colorChartOpen, setColorChartOpen] = useState(false);
  const [imageMapUrl, setImageMapUrl] = useState<string | null>(null);
  const [colorChartUrl, setColorChartUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const projectLoadRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Keyboard navigation between layers while the zoom dialog is open.
  // Arrow Right/Down -> next, Arrow Left/Up -> previous. Silhouette (-1) is last.
  // Esc closes via Radix Dialog's built-in handler.
  useEffect(() => {
    if (zoomLayer === null) return;
    const handler = (e: KeyboardEvent) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      const order: number[] = palette.map((_, i) => i);
      if (includeSilhouette) order.push(-1);
      if (order.length === 0) return;
      const cur = order.indexOf(zoomLayer);
      if (cur === -1) return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      setZoomLayer(order[(cur + dir + order.length) % order.length]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomLayer, palette, includeSilhouette]);

  // --- Load image ---
  const loadFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Downscale to max 1000px for processing speed
      const maxDim = 1000;
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      setSourceData(data);
      setWorkData(data);
      setMask(null);
      setBgRemovalEnabled(false);
      setAspect(w / h);
      setOutWidth(800);
      setOutHeight(Math.round(800 / (w / h)));
      const detected = estimateColorCount(data.data);
      setDetectedColors(detected);
      setNumLayers(Math.min(25, Math.max(2, detected)));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  // --- Quantize whenever inputs change ---
  useEffect(() => {
    if (!workData) return;
    const t = setTimeout(() => {
      const result = quantize(
        workData.data,
        workData.width,
        workData.height,
        numLayers,
        bgRemovalEnabled ? mask ?? undefined : undefined,
      );
      setPalette(result.palette);
      setLabels(result.labels);
      setHiddenLayers(new Set());
    }, 30);
    return () => clearTimeout(t);
  }, [workData, numLayers, mask, bgRemovalEnabled]);

  // Preview rendering
  const previewUrl = useMemo(() => {
    if (!workData || !labels || palette.length === 0) return null;
    const visiblePalette = palette.map((c, i) => (hiddenLayers.has(i) ? hexToRgb(bgColor) : c));
    const img = renderQuantized(labels, visiblePalette, workData.width, workData.height, hexToRgb(bgColor));
    const canvas = imageDataToCanvas(img);
    if (markersEnabled) {
      const ctx = canvas.getContext("2d")!;
      drawMarkers(ctx, canvas.width, canvas.height, markerSize, markerInset, markerCorners);
    }
    return canvas.toDataURL("image/png");
  }, [workData, labels, palette, hiddenLayers, bgColor, markersEnabled, markerSize, markerInset, markerCorners]);

  const originalUrl = useMemo(() => {
    if (!sourceData) return null;
    return imageDataToDataURL(sourceData);
  }, [sourceData]);

  // --- Layer thumbnails ---
  const layerThumbs = useMemo(() => {
    if (!workData || !labels) return [];
    return palette.map((color, idx) => {
      const img = renderLayerIsolated(labels, palette, workData.width, workData.height, idx, hexToRgb(bgColor));
      return { idx, color, url: imageDataToDataURL(img) };
    });
  }, [workData, labels, palette, bgColor]);

  const silhouetteUrl = useMemo(() => {
    if (!workData || !labels) return null;
    const img = renderSilhouette(labels, workData.width, workData.height, [0, 0, 0], hexToRgb(bgColor));
    return imageDataToDataURL(img);
  }, [workData, labels, bgColor]);

  // --- Downloads ---
  const buildLayerImageData = (layerIdx: number, isolated = true) => {
    if (!workData || !labels) return null;
    return isolated
      ? renderLayerIsolated(labels, palette, workData.width, workData.height, layerIdx, hexToRgb(bgColor))
      : renderLayerCumulative(labels, palette, workData.width, workData.height, layerIdx, hexToRgb(bgColor));
  };

  const scaleToOutput = (img: ImageData): HTMLCanvasElement => {
    const src = imageDataToCanvas(img);
    const c = document.createElement("canvas");
    c.width = outWidth;
    c.height = outHeight;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, outWidth, outHeight);
    if (markersEnabled) drawMarkers(ctx, outWidth, outHeight, markerSize, markerInset, markerCorners);
    return c;
  };

  // Render an isolated layer at output resolution with a transparent background
  // so it can be vector-traced cleanly (Cricut / Silhouette friendly).
  const buildIsolatedScaledImageData = (layerIdx: number): ImageData | null => {
    if (!workData || !labels) return null;
    const img = renderLayerIsolated(labels, palette, workData.width, workData.height, layerIdx, null);
    const src = imageDataToCanvas(img);
    const c = document.createElement("canvas");
    c.width = outWidth;
    c.height = outHeight;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, outWidth, outHeight);
    return ctx.getImageData(0, 0, outWidth, outHeight);
  };

  const buildSilhouetteScaledImageData = (): ImageData | null => {
    if (!workData || !labels) return null;
    const img = renderSilhouette(labels, workData.width, workData.height, [0, 0, 0], null);
    const src = imageDataToCanvas(img);
    const c = document.createElement("canvas");
    c.width = outWidth;
    c.height = outHeight;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, outWidth, outHeight);
    return ctx.getImageData(0, 0, outWidth, outHeight);
  };

  const downloadLayer = async (layerIdx: number, format: "png" | "svg") => {
    const img = buildLayerImageData(layerIdx, true);
    if (!img) return;
    if (format === "png") {
      const c = scaleToOutput(img);
      c.toBlob((b) => b && downloadBlob(b, `${projectName}-layer-${layerIdx + 1}.png`));
    } else {
      const scaled = buildIsolatedScaledImageData(layerIdx);
      if (!scaled) return;
      const svg = traceLayerToSvg(scaled, palette[layerIdx]);
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${projectName}-layer-${layerIdx + 1}.svg`);
    }
  };

  const downloadSilhouette = async (format: "png" | "svg") => {
    if (!workData || !labels) return;
    if (format === "png") {
      const img = renderSilhouette(labels, workData.width, workData.height, [0, 0, 0], hexToRgb(bgColor));
      const c = scaleToOutput(img);
      c.toBlob((b) => b && downloadBlob(b, `${projectName}-silhouette.png`));
    } else {
      const scaled = buildSilhouetteScaledImageData();
      if (!scaled) return;
      const svg = traceSilhouetteToSvg(scaled);
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${projectName}-silhouette.svg`);
    }
  };

  // Image map: composite preview with thumbnails + labels
  const buildImageMapCanvas = (): HTMLCanvasElement | null => {
    if (!workData || !labels) return null;
    const cols = 2;
    const rows = Math.ceil((palette.length + (includeSilhouette ? 1 : 0)) / cols);
    const cellW = 360, cellH = 280, gap = 16, pad = 24;
    const headerH = 240;
    const W = pad * 2 + cols * cellW + (cols - 1) * gap;
    const H = pad * 2 + headerH + 24 + rows * cellH + (rows - 1) * gap;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#111";
    ctx.font = "bold 28px Inter, sans-serif";
    ctx.fillText(projectName, pad, pad + 30);
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText(`${palette.length} layers · ${workData.width}x${workData.height}`, pad, pad + 56);

    // Preview image
    const previewImg = renderQuantized(labels, palette, workData.width, workData.height, hexToRgb(bgColor));
    const pCanvas = imageDataToCanvas(previewImg);
    const ph = headerH - 80;
    const pw = (pCanvas.width / pCanvas.height) * ph;
    ctx.drawImage(pCanvas, pad, pad + 70, Math.min(pw, W - pad * 2), ph);

    // Layer thumbnails
    const startY = pad + headerH + 24;
    const drawCell = (i: number, name: string, hex: string, img: ImageData, label: string) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * (cellW + gap);
      const y = startY + row * (cellH + gap);
      ctx.fillStyle = "#f7f7f7";
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = "#ddd";
      ctx.strokeRect(x, y, cellW, cellH);
      const thumb = imageDataToCanvas(img);
      const th = cellH - 80;
      const tw = (thumb.width / thumb.height) * th;
      ctx.drawImage(thumb, x + (cellW - tw) / 2, y + 10, tw, th);
      ctx.fillStyle = hex;
      ctx.fillRect(x + 12, y + cellH - 56, 36, 36);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(x + 12, y + cellH - 56, 36, 36);
      ctx.fillStyle = "#111";
      ctx.font = "bold 18px Inter, sans-serif";
      ctx.fillText(label, x + 60, y + cellH - 36);
      ctx.font = "14px Inter, sans-serif";
      ctx.fillText(`${name} · ${hex.toUpperCase()}`, x + 60, y + cellH - 16);
    };

    palette.forEach((rgb, i) => {
      const hex = rgbToHex(rgb);
      const img = renderLayerIsolated(labels, palette, workData.width, workData.height, i, hexToRgb(bgColor));
      drawCell(i, nameForHex(hex), hex, img, `Layer ${i + 1}`);
    });
    if (includeSilhouette) {
      const img = renderSilhouette(labels, workData.width, workData.height, [0, 0, 0], hexToRgb(bgColor));
      drawCell(palette.length, "Silhouette", "#000000", img, `Layer ${palette.length + 1} (Silhouette)`);
    }
    return c;
  };

  const buildColorChartCanvas = (): HTMLCanvasElement | null => {
    if (palette.length === 0) return null;
    const rowH = 64, pad = 24, swatch = 48;
    const W = 560;
    const items = palette.map((rgb) => {
      const hex = rgbToHex(rgb);
      return { hex, name: nameForHex(hex) };
    });
    if (includeSilhouette) items.push({ hex: "#000000", name: "Silhouette (Black)" });
    const H = pad * 2 + 40 + items.length * (rowH + 8);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#111";
    ctx.font = "bold 24px Inter, sans-serif";
    ctx.fillText(`${projectName} — Color Chart`, pad, pad + 24);
    items.forEach((it, i) => {
      const y = pad + 40 + i * (rowH + 8);
      ctx.fillStyle = it.hex;
      ctx.fillRect(pad, y, swatch, swatch);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(pad, y, swatch, swatch);
      ctx.fillStyle = "#111";
      ctx.font = "bold 18px Inter, sans-serif";
      ctx.fillText(`${i + 1}. ${it.name}`, pad + swatch + 16, y + 26);
      ctx.font = "14px Inter, sans-serif";
      ctx.fillText(it.hex.toUpperCase(), pad + swatch + 16, y + 46);
    });
    return c;
  };

  const downloadImageMap = () => {
    const c = buildImageMapCanvas();
    if (!c) return;
    c.toBlob((b) => b && downloadBlob(b, `${projectName}-image-map.png`));
  };
  const downloadColorChart = () => {
    const c = buildColorChartCanvas();
    if (!c) return;
    c.toBlob((b) => b && downloadBlob(b, `${projectName}-color-chart.png`));
  };

  const printCanvas = (c: HTMLCanvasElement, title: string) => {
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: auto; margin: 12mm; }
  html,body { margin:0; padding:0; background:#fff; }
  .wrap { width:100%; text-align:center; padding:12px; box-sizing:border-box; }
  img { display:block; margin:0 auto; max-width:100%; height:auto; image-rendering: -webkit-optimize-contrast; }
  @media print {
    .wrap { padding:0; }
    img { max-width:100%; max-height:100vh; page-break-inside: avoid; }
  }
</style></head><body><div class="wrap"><img id="i" src="${url}" alt="${title}"/></div>
<script>
  (function(){
    var img=document.getElementById('i');
    function go(){ try{ window.focus(); window.print(); }catch(e){} }
    function after(){ setTimeout(go, 250); }
    if(img.complete && img.naturalWidth) after();
    else { img.onload = after; img.onerror = after; }
    window.onafterprint = function(){ setTimeout(function(){ URL.revokeObjectURL('${url}'); }, 500); };
  })();
</script></body></html>`;
      const w = window.open("", "_blank");
      if (!w) {
        // Popup blocked — fallback: open the image directly so user can print/save.
        window.open(url, "_blank");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    }, "image/png");
  };
  const printImageMap = () => {
    const c = buildImageMapCanvas();
    if (c) printCanvas(c, `${projectName} - Image Map`);
  };
  const printColorChart = () => {
    const c = buildColorChartCanvas();
    if (c) printCanvas(c, `${projectName} - Color Chart`);
  };

  const downloadAll = async (format: "png" | "svg") => {
    if (!workData || !labels) return;
    const zip = new JSZip();
    for (let i = 0; i < palette.length; i++) {
      const img = renderLayerIsolated(labels, palette, workData.width, workData.height, i, hexToRgb(bgColor));
      const c = scaleToOutput(img);
      if (format === "png") {
        const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
        zip.file(`layer-${String(i + 1).padStart(2, "0")}.png`, blob);
      } else {
        const svg = svgWrapImage(c.width, c.height, c.toDataURL("image/png"));
        zip.file(`layer-${String(i + 1).padStart(2, "0")}.svg`, svg);
      }
    }
    if (includeSilhouette) {
      const img = renderSilhouette(labels, workData.width, workData.height, [0, 0, 0], hexToRgb(bgColor));
      const c = scaleToOutput(img);
      if (format === "png") {
        const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
        zip.file(`layer-${String(palette.length + 1).padStart(2, "0")}-silhouette.png`, blob);
      } else {
        const svg = svgWrapImage(c.width, c.height, c.toDataURL("image/png"));
        zip.file(`layer-${String(palette.length + 1).padStart(2, "0")}-silhouette.svg`, svg);
      }
    }
    const map = buildImageMapCanvas();
    if (map) {
      const mb = await new Promise<Blob>((r) => map.toBlob((b) => r(b!), "image/png"));
      zip.file("image-map.png", mb);
    }
    const chart = buildColorChartCanvas();
    if (chart) {
      const cb = await new Promise<Blob>((r) => chart.toBlob((b) => r(b!), "image/png"));
      zip.file("color-chart.png", cb);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${projectName}-${format}.zip`);
  };

  // --- Project save/load ---
  const newProject = () => {
    setProjectName(randomProjectName());
    setSourceData(null);
    setWorkData(null);
    setMask(null);
    setBgRemovalEnabled(false);
    setPalette([]);
    setLabels(null);
    setDetectedColors(null);
    setHiddenLayers(new Set());
  };

  const saveProject = async () => {
    if (!sourceData) {
      downloadBlob(new Blob([JSON.stringify({ projectName, numLayers, bgColor })], { type: "application/json" }), `${projectName}.json`);
      return;
    }
    const url = imageDataToDataURL(sourceData);
    const payload = {
      projectName,
      numLayers,
      bgColor,
      includeSilhouette,
      markersEnabled,
      markerSize,
      markerInset,
      outWidth,
      outHeight,
      image: url,
    };
    downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), `${projectName}.json`);
  };

  const loadProjectFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.projectName) setProjectName(data.projectName);
        if (typeof data.numLayers === "number") setNumLayers(data.numLayers);
        if (data.bgColor) setBgColor(data.bgColor);
        if (typeof data.includeSilhouette === "boolean") setIncludeSilhouette(data.includeSilhouette);
        if (typeof data.markersEnabled === "boolean") setMarkersEnabled(data.markersEnabled);
        if (typeof data.markerSize === "number") setMarkerSize(data.markerSize);
        if (typeof data.markerInset === "number") setMarkerInset(data.markerInset);
        if (typeof data.outWidth === "number") setOutWidth(data.outWidth);
        if (typeof data.outHeight === "number") setOutHeight(data.outHeight);
        if (data.image) {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            c.getContext("2d")!.drawImage(img, 0, 0);
            const d = c.getContext("2d")!.getImageData(0, 0, img.width, img.height);
            setSourceData(d);
            setWorkData(d);
            setAspect(img.width / img.height);
            setDetectedColors(estimateColorCount(d.data));
          };
          img.src = data.image;
        }
      } catch (e) {
        console.error(e);
      }
    };
    reader.readAsText(file);
  };

  // --- Touch swipe navigation in zoom dialog ---
  const SWIPE_THRESHOLD = 50;
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
    touchStartY.current = e.changedTouches[0].screenY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].screenX;
    const endY = e.changedTouches[0].screenY;
    const dx = endX - touchStartX.current;
    const dy = endY - touchStartY.current;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    e.preventDefault();
    const order: number[] = palette.map((_, i) => i);
    if (includeSilhouette) order.push(-1);
    if (order.length === 0 || zoomLayer === null) return;
    const cur = order.indexOf(zoomLayer);
    if (cur === -1) return;
    const dir = dx > 0 ? -1 : 1; // swipe right = prev, swipe left = next
    setZoomLayer(order[(cur + dir + order.length) % order.length]);
  };

  // ----------------------------------------------------------------------
  return (
    <div className="min-h-screen pb-16">
      {/* Top toolbar */}
      <div className="no-print sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-3 py-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => projectLoadRef.current?.click()}>
            <FolderOpen className="h-4 w-4 mr-1" /> Load
          </Button>
          <Button variant="outline" size="sm" onClick={newProject}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
          <Button variant="outline" size="sm" onClick={saveProject}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
          <input
            ref={projectLoadRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && loadProjectFile(e.target.files[0])}
          />
          <div className="relative flex-1 min-w-[220px]">
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
              className="pr-9"
            />
            {projectName && (
              <button
                aria-label="Clear name"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setProjectName("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 pt-4 space-y-6">
        {/* Image box: upload + preview in one */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="display text-2xl">Image</h2>

            {!sourceData ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="w-full h-40 text-base font-semibold border-dashed" variant="outline">
                      <ImageIcon className="h-6 w-6 mr-2" /> Click to upload an image
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                      <Images className="h-4 w-4 mr-2" /> Image library
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                      <FileImage className="h-4 w-4 mr-2" /> Files
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                      <Camera className="h-4 w-4 mr-2" /> Camera
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground text-center">PNG, JPG, WEBP files</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Tap image to enlarge</span>
                  <Button size="sm" variant="outline" onClick={() => setShowOriginal((s) => !s)}>
                    {showOriginal ? "Show Stencil" : "Show Original"}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setMainOpen(true)}
                  className="block w-full rounded-md overflow-hidden border bg-muted/40"
                  aria-label="Open main picture"
                >
                  {(showOriginal ? originalUrl : previewUrl) && (
                    <img
                      src={(showOriginal ? originalUrl : previewUrl)!}
                      alt="Main picture"
                      className="w-full h-auto"
                    />
                  )}
                </button>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Switch
                    checked={bgRemovalEnabled}
                    onCheckedChange={(v) => {
                      setBgRemovalEnabled(v);
                      if (v) setBgEditorOpen(true);
                    }}
                    id="bg-rem"
                  />
                  <Label htmlFor="bg-rem" className="cursor-pointer flex items-center gap-1">
                    <Sparkles className="h-4 w-4" /> Remove background
                  </Label>
                  {bgRemovalEnabled && (
                    <Button size="sm" variant="outline" onClick={() => setBgEditorOpen(true)}>
                      Edit mask
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                </div>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
            />
          </CardContent>
        </Card>

        <BgEditor
          open={bgEditorOpen}
          onOpenChange={setBgEditorOpen}
          source={sourceData}
          onApply={(m) => setMask(m)}
        />

        {workData && (
          <>
            {/* Settings */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="display text-2xl">Layers & Colors</h2>
                <div className="flex items-center gap-3">
                  <Label className="min-w-[110px]">Layers</Label>
                  <Slider value={[numLayers]} min={1} max={25} step={1} onValueChange={(v) => setNumLayers(v[0])} />
                  <Input
                    type="number"
                    min={1}
                    max={25}
                    value={numLayers}
                    onChange={(e) => setNumLayers(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                </div>
                {detectedColors !== null && (
                  <p className="text-xs text-muted-foreground">
                    {detectedColors} dominant color{detectedColors === 1 ? "" : "s"} detected in the image.
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <Switch id="silh" checked={includeSilhouette} onCheckedChange={setIncludeSilhouette} />
                  <Label htmlFor="silh" className="cursor-pointer">
                    Add full silhouette layer (not blended into preview)
                  </Label>
                </div>


                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Width (px)</Label>
                    <Input
                      type="number"
                      value={outWidth}
                      onChange={(e) => {
                        const w = Math.max(64, Number(e.target.value) || 0);
                        setOutWidth(w);
                        setOutHeight(Math.round(w / aspect));
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Height (px) (auto)</Label>
                    <Input
                      type="number"
                      value={outHeight}
                      onChange={(e) => {
                        const h = Math.max(64, Number(e.target.value) || 0);
                        setOutHeight(h);
                        setOutWidth(Math.round(h * aspect));
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Label className="min-w-[110px]">Background</Label>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-12 h-9 rounded border border-border bg-transparent"
                  />
                  <span className="text-xs text-muted-foreground">{bgColor.toUpperCase()}</span>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-3">
                    <Switch id="mark" checked={markersEnabled} onCheckedChange={setMarkersEnabled} />
                    <Label htmlFor="mark" className="cursor-pointer">Corner markers ✚ for alignment</Label>
                  </div>
                  {markersEnabled && (
                    <>
                      <div className="flex items-center gap-3">
                        <Label className="min-w-[110px] text-xs">Marker size</Label>
                        <Slider value={[markerSize]} min={6} max={80} step={1} onValueChange={(v) => setMarkerSize(v[0])} />
                        <Input
                          type="number"
                          value={markerSize}
                          onChange={(e) => setMarkerSize(Math.max(2, Number(e.target.value) || 2))}
                          className="w-20"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="min-w-[110px] text-xs">Distance</Label>
                        <Slider value={[markerInset]} min={0} max={200} step={1} onValueChange={(v) => setMarkerInset(v[0])} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Corners</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ["tl", "Top Left"],
                            ["tr", "Top Right"],
                            ["bl", "Bottom Left"],
                            ["br", "Bottom Right"],
                          ] as const).map(([key, label]) => (
                            <Button
                              key={key}
                              type="button"
                              size="sm"
                              variant={markerCorners[key] ? "default" : "outline"}
                              onClick={() => setMarkerCorners((c) => ({ ...c, [key]: !c[key] }))}
                            >
                              {markerCorners[key] ? "✓ " : ""}{label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>


            {/* Layers grid */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h2 className="display text-2xl">Layers</h2>
                <div className="grid grid-cols-2 gap-3">
                  {layerThumbs.map(({ idx, color, url }) => {
                    const hex = rgbToHex(color);
                    const name = nameForHex(hex);
                    const hidden = hiddenLayers.has(idx);
                    return (
                      <div key={idx} className="border rounded-md overflow-hidden bg-card">
                        <button
                          onClick={() => setZoomLayer(idx)}
                          className="block w-full bg-muted/40"
                          aria-label={`Zoom layer ${idx + 1}`}
                        >
                          <img src={url} alt={`Layer ${idx + 1}`} className={`w-full h-auto ${hidden ? "opacity-30" : ""}`} />
                        </button>
                        <div className="p-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-5 h-5 rounded border" style={{ background: hex }} />
                            <div className="text-xs leading-tight flex-1 min-w-0">
                              <div className="font-semibold">Layer {idx + 1}</div>
                              <div className="text-muted-foreground truncate">{name}</div>
                              <div className="text-muted-foreground">{hex.toUpperCase()}</div>
                            </div>
                            <button
                              onClick={() =>
                                setHiddenLayers((s) => {
                                  const n = new Set(s);
                                  if (n.has(idx)) n.delete(idx);
                                  else n.add(idx);
                                  return n;
                                })
                              }
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={hidden ? "Show layer" : "Hide layer"}
                            >
                              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => downloadLayer(idx, "png")}>
                              PNG
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => downloadLayer(idx, "svg")}>
                              SVG
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {includeSilhouette && silhouetteUrl && (
                    <div className="border rounded-md overflow-hidden bg-card">
                      <button
                        onClick={() => setZoomLayer(-1)}
                        className="block w-full bg-muted/40"
                        aria-label="Zoom silhouette"
                      >
                        <img src={silhouetteUrl} alt="Silhouette" className="w-full h-auto" />
                      </button>
                      <div className="p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-5 h-5 rounded border" style={{ background: "#000" }} />
                          <div className="text-xs leading-tight flex-1 min-w-0">
                            <div className="font-semibold">Layer {palette.length + 1}</div>
                            <div className="text-muted-foreground">Silhouette (Black)</div>
                            <div className="text-muted-foreground">#000000</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => downloadSilhouette("png")}>
                            PNG
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => downloadSilhouette("svg")}>
                            SVG
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Downloads */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h2 className="display text-2xl">Export</h2>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => downloadAll("png")} variant="default">
                    <Download className="h-4 w-4 mr-1" /> All PNG (.zip)
                  </Button>
                  <Button onClick={() => downloadAll("svg")} variant="default">
                    <Download className="h-4 w-4 mr-1" /> All SVG (.zip)
                  </Button>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <Label className="text-sm font-semibold">Image Map</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const c = buildImageMapCanvas();
                        if (c) {
                          setImageMapUrl(c.toDataURL("image/png"));
                          setImageMapOpen(true);
                        }
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button variant="outline" onClick={downloadImageMap}>
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button variant="outline" onClick={printImageMap} className="col-span-2">
                      <Printer className="h-4 w-4 mr-1" /> Print
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <Label className="text-sm font-semibold">Color Chart</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const c = buildColorChartCanvas();
                        if (c) {
                          setColorChartUrl(c.toDataURL("image/png"));
                          setColorChartOpen(true);
                        }
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button variant="outline" onClick={downloadColorChart}>
                      <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button variant="outline" onClick={printColorChart} className="col-span-2">
                      <Printer className="h-4 w-4 mr-1" /> Print
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Main picture dialog */}
      <Dialog open={mainOpen} onOpenChange={setMainOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="display text-2xl">
              {showOriginal ? "Original Image" : "Stencil Preview"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {(showOriginal ? originalUrl : previewUrl) && (
              <img
                src={(showOriginal ? originalUrl : previewUrl)!}
                alt="Main picture"
                className="w-full h-auto"
              />
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setMainOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image map view dialog */}
      <Dialog open={imageMapOpen} onOpenChange={setImageMapOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="display text-2xl">Image Map</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {imageMapUrl && <img src={imageMapUrl} alt="Image map" className="w-full h-auto" />}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={printImageMap}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="outline" onClick={downloadImageMap}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button variant="outline" onClick={() => setImageMapOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Color chart view dialog */}
      <Dialog open={colorChartOpen} onOpenChange={setColorChartOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="display text-2xl">Color Chart</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {colorChartUrl && <img src={colorChartUrl} alt="Color chart" className="w-full h-auto" />}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={printColorChart}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="outline" onClick={downloadColorChart}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button variant="outline" onClick={() => setColorChartOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zoom dialog */}
      <Dialog open={zoomLayer !== null} onOpenChange={(o) => !o && setZoomLayer(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="display text-2xl">
              {zoomLayer === -1 ? `Layer ${palette.length + 1} — Silhouette` : zoomLayer !== null ? `Layer ${zoomLayer + 1}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div
            className="flex-1 min-h-0 overflow-auto touch-pan-y"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {zoomLayer === -1 && silhouetteUrl && (
              <img src={silhouetteUrl} alt="Silhouette" className="w-full h-auto" draggable={false} />
            )}
            {zoomLayer !== null && zoomLayer >= 0 && layerThumbs[zoomLayer] && (
              <img src={layerThumbs[zoomLayer].url} alt={`Layer ${zoomLayer + 1}`} className="w-full h-auto" draggable={false} />
            )}
          </div>
          {zoomLayer !== null && zoomLayer >= 0 && palette[zoomLayer] && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block w-6 h-6 rounded border" style={{ background: rgbToHex(palette[zoomLayer]) }} />
              <span className="font-semibold">{nameForHex(rgbToHex(palette[zoomLayer]))}</span>
              <span className="text-muted-foreground">{rgbToHex(palette[zoomLayer]).toUpperCase()}</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadLayer(zoomLayer, "png")}>PNG</Button>
                <Button size="sm" variant="outline" onClick={() => downloadLayer(zoomLayer, "svg")}>SVG</Button>
              </div>
            </div>
          )}
          {zoomLayer === -1 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadSilhouette("png")}>PNG</Button>
                <Button size="sm" variant="outline" onClick={() => downloadSilhouette("svg")}>SVG</Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Tip: use ← → arrows or swipe to switch layers</span>
            <div className="flex gap-2 ml-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const order: number[] = palette.map((_, i) => i);
                  if (includeSilhouette) order.push(-1);
                  if (order.length === 0 || zoomLayer === null) return;
                  const cur = order.indexOf(zoomLayer);
                  setZoomLayer(order[(cur - 1 + order.length) % order.length]);
                }}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const order: number[] = palette.map((_, i) => i);
                  if (includeSilhouette) order.push(-1);
                  if (order.length === 0 || zoomLayer === null) return;
                  const cur = order.indexOf(zoomLayer);
                  setZoomLayer(order[(cur + 1) % order.length]);
                }}
              >
                Next
              </Button>
              <Button variant="outline" onClick={() => setZoomLayer(null)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>




      

    </div>
  );
}
