import type { CropRect, ImageFilterType, ImageItem } from './pdfSplitter';

export interface Point2D {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export type CropMode = 'none' | 'rect' | 'perspective' | 'polygon';
export type PerspectiveQuad = [Point2D, Point2D, Point2D, Point2D]; // TL, TR, BR, BL
export type PolygonFillMode = 'white' | 'transparent';
export type AiEnhanceMode = 'watermark' | 'hd' | 'both';

export interface WatermarkRemovalSettings {
  enabled: boolean;
  strength: number; // 0..100
  removeColorStamps: boolean;
}

export interface EraseStroke {
  points: Point2D[];
  radius: number; // normalized relative to min(width, height), e.g., 0.025
}

export interface AiEnhancedResult {
  url: string;
  mode: AiEnhanceMode;
  width: number;
  height: number;
  active: boolean;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImageCached(src: string): Promise<HTMLImageElement> {
  if (!src) return Promise.reject(new Error('Empty image URL'));
  const cached = imageCache.get(src);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      imageCache.delete(src);
      reject(e);
    };
    img.src = src;
  });
  imageCache.set(src, p);
  if (imageCache.size > 80) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) imageCache.delete(firstKey);
  }
  return p;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Checks whether an ImageItem has any non-default visual edits requiring pixel rendering.
 */
export function hasAdvancedPixelEdits(item: ImageItem): boolean {
  const cropMode = item.cropMode || (item.crop ? 'rect' : 'none');
  return (
    Boolean(item.aiEnhanced?.active) ||
    cropMode !== 'none' ||
    Boolean(item.crop) ||
    Boolean(item.perspectiveQuad) ||
    Boolean(item.polygon && item.polygon.length >= 3) ||
    item.rotation % 360 !== 0 ||
    item.flipH ||
    item.flipV ||
    item.filter !== 'none' ||
    item.brightness !== 100 ||
    item.contrast !== 100 ||
    (item.sharpen ?? 0) > 0 ||
    (item.denoiseShadow ?? 0) > 0 ||
    Boolean(item.localUpscale) ||
    Boolean(item.watermarkRemoval?.enabled) ||
    Boolean(item.eraseStrokes && item.eraseStrokes.length > 0)
  );
}

/**
 * Checks whether a 4-point quad is strictly convex and non-self-intersecting.
 */
export function isConvexQuad(quad: PerspectiveQuad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/**
 * Computes area of polygon (normalized 0..1 space).
 */
export function polygonArea(pts: Point2D[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

/**
 * Estimates natural pixel dimensions of an unwarped perspective quad.
 */
export function estimateQuadOutputSize(
  quad: PerspectiveQuad,
  srcW: number,
  srcH: number
): { width: number; height: number } {
  const p = quad.map((pt) => ({ x: pt.x * srcW, y: pt.y * srcH }));
  const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);
  const topW = dist(p[0], p[1]);
  const botW = dist(p[3], p[2]);
  const leftH = dist(p[0], p[3]);
  const rightH = dist(p[1], p[2]);
  return {
    width: Math.max(16, Math.round(Math.max(topW, botW))),
    height: Math.max(16, Math.round(Math.max(leftH, rightH))),
  };
}

/**
 * Computes normalized bounding box of a polygon.
 */
export function getPolygonBounds(pts: Point2D[]): CropRect {
  if (pts.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  minX = clamp(minX, 0, 0.98);
  minY = clamp(minY, 0, 0.98);
  maxX = clamp(maxX, minX + 0.02, 1);
  maxY = clamp(maxY, minY + 0.02, 1);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Automatic white/light-paper border detection optimized for text documents & screenshots.
 * Uses perimeter color profiling + row/column ink density filtering to safely ignore speckles.
 */
export async function detectWhiteBorders(
  imageUrl: string,
  options?: { sensitivity?: number; paddingPct?: number }
): Promise<CropRect | null> {
  const sensitivity = clamp(options?.sensitivity ?? 55, 5, 95);
  const paddingPct = clamp(options?.paddingPct ?? 2, 0, 10) / 100;

  const img = await loadImageCached(imageUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (srcW < 16 || srcH < 16) return null;

  const maxScan = 560;
  const scale = Math.min(1, maxScan / Math.max(srcW, srcH));
  const w = Math.max(16, Math.round(srcW * scale));
  const h = Math.max(16, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Sample outer perimeter pixels (top/bottom/left/right 2px ring) to learn exact border paper color
  const rSamples: number[] = [];
  const gSamples: number[] = [];
  const bSamples: number[] = [];
  const samplePixel = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    if (data[idx + 3] < 20) {
      rSamples.push(255);
      gSamples.push(255);
      bSamples.push(255);
      return;
    }
    rSamples.push(data[idx]);
    gSamples.push(data[idx + 1]);
    bSamples.push(data[idx + 2]);
  };

  const stepX = Math.max(1, Math.floor(w / 80));
  const stepY = Math.max(1, Math.floor(h / 80));
  for (let x = 0; x < w; x += stepX) {
    samplePixel(x, 0);
    samplePixel(x, 1);
    samplePixel(x, h - 1);
    samplePixel(x, h - 2);
  }
  for (let y = 0; y < h; y += stepY) {
    samplePixel(0, y);
    samplePixel(1, y);
    samplePixel(w - 1, y);
    samplePixel(w - 2, y);
  }

  rSamples.sort((a, b) => a - b);
  gSamples.sort((a, b) => a - b);
  bSamples.sort((a, b) => a - b);
  const mid = Math.floor(rSamples.length * 0.65);
  const bgR = rSamples[mid] ?? 255;
  const bgG = gSamples[mid] ?? 255;
  const bgB = bSamples[mid] ?? 255;
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  // Higher sensitivity -> smaller color delta needed to consider a pixel as foreground content
  // sensitivity 55 -> delta ~ 26; sensitivity 90 -> delta ~ 10; sensitivity 15 -> delta ~ 54
  const colorTol = Math.round(64 - sensitivity * 0.58);
  const whiteFloor = bgLum >= 200 ? Math.max(175, bgLum - colorTol) : -1;

  const isForeground = (x: number, y: number): boolean => {
    const idx = (y * w + x) * 4;
    const a = data[idx + 3];
    if (a < 25) return false;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const diff = Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB));
    if (diff > colorTol) return true;
    if (whiteFloor > 0 && lum < whiteFloor) return true;
    return false;
  };

  // Row and column foreground counts (ignore extreme 2px scanner artifact rim if isolated)
  const rowCounts = new Uint32Array(h);
  const colCounts = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    let rc = 0;
    for (let x = 0; x < w; x++) {
      if (isForeground(x, y)) {
        rc++;
        colCounts[x]++;
      }
    }
    rowCounts[y] = rc;
  }

  // Require at least a small number of foreground pixels to ignore single dust specks,
  // while still catching narrow punctuation, page numbers, or thin rules.
  const minRowPx = Math.max(2, Math.round(w * 0.004));
  const minColPx = Math.max(2, Math.round(h * 0.004));

  const findEdge = (counts: Uint32Array, len: number, minPx: number, fromEnd: boolean): number => {
    const limit = Math.floor(len * 0.48);
    for (let offset = 0; offset < limit; offset++) {
      const idx = fromEnd ? len - 1 - offset : offset;
      if (counts[idx] >= minPx) {
        // Confirm it's not a 1px isolated scanner border line at the very edge (0..2px)
        if (offset <= 2) {
          const next1 = counts[fromEnd ? idx - 1 : idx + 1] ?? 0;
          const next2 = counts[fromEnd ? idx - 2 : idx + 2] ?? 0;
          if (next1 < minPx && next2 < minPx) continue;
        }
        return idx;
      }
    }
    return fromEnd ? len - 1 : 0;
  };

  const top = findEdge(rowCounts, h, minRowPx, false);
  const bottom = findEdge(rowCounts, h, minRowPx, true);
  const left = findEdge(colCounts, w, minColPx, false);
  const right = findEdge(colCounts, w, minColPx, true);

  if (bottom <= top + 8 || right <= left + 8) {
    return null;
  }

  // Add breathing padding so punctuation & ascenders never get clipped
  const padX = Math.round(w * paddingPct);
  const padY = Math.round(h * paddingPct);
  const x0 = clamp((left - padX) / w, 0, 0.92);
  const y0 = clamp((top - padY) / h, 0, 0.92);
  const x1 = clamp((right + 1 + padX) / w, x0 + 0.08, 1);
  const y1 = clamp((bottom + 1 + padY) / h, y0 + 0.08, 1);

  const rect: CropRect = {
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
  };

  // Only return a crop if we actually trimmed at least 2% margin on any edge
  const trimmedAny = rect.x > 0.015 || rect.y > 0.015 || rect.x + rect.w < 0.985 || rect.y + rect.h < 0.985;
  return trimmedAny ? rect : null;
}

/**
 * Automatically detects the 4 corners of a photographed/skewed document page.
 */
export async function detectDocumentQuad(imageUrl: string): Promise<PerspectiveQuad> {
  const defaultInset: PerspectiveQuad = [
    { x: 0.06, y: 0.06 },
    { x: 0.94, y: 0.06 },
    { x: 0.94, y: 0.94 },
    { x: 0.06, y: 0.94 },
  ];

  try {
    const img = await loadImageCached(imageUrl);
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    if (srcW < 32 || srcH < 32) return defaultInset;

    const maxDim = 360;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const w = Math.max(32, Math.round(srcW * scale));
    const h = Math.max(32, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return defaultInset;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Build grayscale buffer
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }

    // Estimate outer desk/background median color from perimeter
    const borderLums: number[] = [];
    for (let x = 0; x < w; x += 2) {
      borderLums.push(gray[x], gray[(h - 1) * w + x]);
    }
    for (let y = 0; y < h; y += 2) {
      borderLums.push(gray[y * w], gray[y * w + (w - 1)]);
    }
    borderLums.sort((a, b) => a - b);
    const borderMedian = borderLums[Math.floor(borderLums.length / 2)] ?? 128;

    // Collect strong edge & contrast-to-border points
    const pts: Array<{ x: number; y: number }> = [];
    const margin = 2;
    for (let y = margin; y < h - margin; y += 2) {
      for (let x = margin; x < w - margin; x += 2) {
        const idx = y * w + x;
        const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
        const gy = Math.abs(gray[idx + w] - gray[idx - w]);
        const grad = gx + gy;
        const diffFromBorder = Math.abs(gray[idx] - borderMedian);
        if (grad > 38 || diffFromBorder > 36) {
          pts.push({ x: x / w, y: y / h });
        }
      }
    }

    if (pts.length < 40) return defaultInset;

    // Use 1.5% trimmed extremal projections to reject isolated noise specks
    const pickExtreme = (scoreFn: (p: { x: number; y: number }) => number, wantMax: boolean) => {
      const scored = pts.map((p) => ({ p, s: scoreFn(p) }));
      scored.sort((a, b) => (wantMax ? b.s - a.s : a.s - b.s));
      const k = Math.min(scored.length - 1, Math.max(0, Math.floor(scored.length * 0.006)));
      return {
        x: clamp(scored[k].p.x, 0.01, 0.99),
        y: clamp(scored[k].p.y, 0.01, 0.99),
      };
    };

    const tl = pickExtreme((p) => p.x + p.y, false);
    const tr = pickExtreme((p) => p.x - p.y, true);
    const br = pickExtreme((p) => p.x + p.y, true);
    const bl = pickExtreme((p) => p.x - p.y, false);

    const quad: PerspectiveQuad = [tl, tr, br, bl];
    const area = polygonArea(quad);
    if (!isConvexQuad(quad) || area < 0.14 || area > 0.97) {
      // Fallback: if white-border rect is found, use its corners
      const rect = await detectWhiteBorders(imageUrl);
      if (rect) {
        return [
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.w, y: rect.y },
          { x: rect.x + rect.w, y: rect.y + rect.h },
          { x: rect.x, y: rect.y + rect.h },
        ];
      }
      return defaultInset;
    }

    return quad;
  } catch {
    return defaultInset;
  }
}

/**
 * Solves 3x3 homography matrix H mapping dst (u,v) -> src (x,y) using 8x8 Gaussian elimination.
 */
function solveHomography(
  dstPts: [Point2D, Point2D, Point2D, Point2D],
  srcPts: [Point2D, Point2D, Point2D, Point2D]
): Float64Array | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = dstPts[i].x;
    const v = dstPts[i].y;
    const x = srcPts[i].x;
    const y = srcPts[i].y;
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
    b.push(y);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(A[r][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-10) return null;

    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    const pivot = A[col][col];
    for (let c = col; c < n; c++) A[col][c] /= pivot;
    b[col] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }

  return new Float64Array([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], 1]);
}

/**
 * Perspective unwarps a 4-point quadrilateral onto a crisp rectangular canvas using inverse homography + bilinear interpolation.
 */
function warpPerspectiveCanvas(
  img: HTMLImageElement,
  quad: PerspectiveQuad,
  outW: number,
  outH: number
): HTMLCanvasElement {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // Cap intermediate source raster for memory safety while preserving sharpness
  const srcScale = Math.min(1, 3200 / Math.max(srcW, srcH));
  const sw = Math.max(16, Math.round(srcW * srcScale));
  const sh = Math.max(16, Math.round(srcH * srcScale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sw;
  srcCanvas.height = sh;
  const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!sCtx) throw new Error('2D context unavailable');
  sCtx.drawImage(img, 0, 0, sw, sh);
  const srcData = sCtx.getImageData(0, 0, sw, sh).data;

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = outW;
  dstCanvas.height = outH;
  const dCtx = dstCanvas.getContext('2d');
  if (!dCtx) throw new Error('2D context unavailable');

  const dstPts: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const srcPts: [Point2D, Point2D, Point2D, Point2D] = [
    { x: quad[0].x * (sw - 1), y: quad[0].y * (sh - 1) },
    { x: quad[1].x * (sw - 1), y: quad[1].y * (sh - 1) },
    { x: quad[2].x * (sw - 1), y: quad[2].y * (sh - 1) },
    { x: quad[3].x * (sw - 1), y: quad[3].y * (sh - 1) },
  ];

  const H = solveHomography(dstPts, srcPts);
  if (!H) {
    dCtx.drawImage(img, 0, 0, outW, outH);
    return dstCanvas;
  }

  const outImg = dCtx.createImageData(outW, outH);
  const dst = outImg.data;
  const h0 = H[0], h1 = H[1], h2 = H[2];
  const h3 = H[3], h4 = H[4], h5 = H[5];
  const h6 = H[6], h7 = H[7], h8 = H[8];

  for (let v = 0; v < outH; v++) {
    const rowOff = v * outW;
    const hy1 = h1 * v + h2;
    const hy4 = h4 * v + h5;
    const hy7 = h7 * v + h8;
    for (let u = 0; u < outW; u++) {
      const denom = h6 * u + hy7;
      const sx = (h0 * u + hy1) / denom;
      const sy = (h3 * u + hy4) / denom;
      const di = (rowOff + u) * 4;

      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        dst[di] = 255;
        dst[di + 1] = 255;
        dst[di + 2] = 255;
        dst[di + 3] = 255;
        continue;
      }

      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const fx1 = 1 - fx;
      const fy1 = 1 - fy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;

      const w00 = fx1 * fy1;
      const w10 = fx * fy1;
      const w01 = fx1 * fy;
      const w11 = fx * fy;

      dst[di] = (srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11 + 0.5) | 0;
      dst[di + 1] = (srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11 + 0.5) | 0;
      dst[di + 2] = (srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11 + 0.5) | 0;
      dst[di + 3] = (srcData[i00 + 3] * w00 + srcData[i10 + 3] * w10 + srcData[i01 + 3] * w01 + srcData[i11 + 3] * w11 + 0.5) | 0;
    }
  }

  dCtx.putImageData(outImg, 0, 0);
  return dstCanvas;
}

/**
 * Applies freeform polygon clipping onto a tightly bounded canvas.
 */
function applyPolygonCropCanvas(
  img: HTMLImageElement,
  polygon: Point2D[],
  fillMode: PolygonFillMode,
  outW: number,
  outH: number
): HTMLCanvasElement {
  const bounds = getPolygonBounds(polygon);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  if (fillMode === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outW, outH);
  } else {
    ctx.clearRect(0, 0, outW, outH);
  }

  ctx.save();
  ctx.beginPath();
  polygon.forEach((pt, idx) => {
    const px = ((pt.x - bounds.x) / bounds.w) * outW;
    const py = ((pt.y - bounds.y) / bounds.h) * outH;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    img,
    bounds.x * srcW,
    bounds.y * srcH,
    bounds.w * srcW,
    bounds.h * srcH,
    0,
    0,
    outW,
    outH
  );
  ctx.restore();
  return canvas;
}

/**
 * Paints background-healing eraser strokes by sampling the bright local paper color around each stroke.
 */
function applyEraseStrokes(canvas: HTMLCanvasElement, strokes: EraseStroke[]) {
  if (!strokes || strokes.length === 0) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const minDim = Math.min(w, h);
  const imgData = ctx.getImageData(0, 0, w, h).data;

  const samplePaperColor = (cx: number, cy: number, r: number): string => {
    const sampleR = Math.max(4, Math.round(r * 1.45));
    const samples: Array<{ lum: number; r: number; g: number; b: number }> = [];
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const sx = clamp(Math.round(cx + Math.cos(ang) * sampleR), 0, w - 1);
      const sy = clamp(Math.round(cy + Math.sin(ang) * sampleR), 0, h - 1);
      const idx = (sy * w + sx) * 4;
      const pr = imgData[idx];
      const pg = imgData[idx + 1];
      const pb = imgData[idx + 2];
      const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
      samples.push({ lum, r: pr, g: pg, b: pb });
    }
    samples.sort((a, b) => a.lum - b.lum);
    // Pick 80th percentile brightest neighbor (paper tone rather than text ink)
    const pick = samples[Math.floor(samples.length * 0.8)] || { r: 255, g: 255, b: 255 };
    return `rgb(${pick.r}, ${pick.g}, ${pick.b})`;
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;
    const pxRadius = Math.max(3, stroke.radius * minDim);
    const midPt = stroke.points[Math.floor(stroke.points.length / 2)];
    const fillCol = samplePaperColor(midPt.x * w, midPt.y * h, pxRadius);

    ctx.strokeStyle = fillCol;
    ctx.fillStyle = fillCol;
    ctx.lineWidth = pxRadius * 2;
    ctx.shadowColor = fillCol;
    ctx.shadowBlur = Math.max(2, pxRadius * 0.35);

    if (stroke.points.length === 1) {
      const pt = stroke.points[0];
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, pxRadius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      stroke.points.forEach((pt, i) => {
        const px = pt.x * w;
        const py = pt.y * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Applies adaptive illumination flattening, local watermark removal, document filters,
 * brightness/contrast, and Unsharp Mask sharpening directly in pixel space.
 */
function applyPixelPipeline(
  canvas: HTMLCanvasElement,
  opts: {
    filter: ImageFilterType;
    brightness: number;
    contrast: number;
    sharpen: number;
    denoiseShadow: number;
    localUpscale: boolean;
    watermarkRemoval?: WatermarkRemovalSettings;
  }
) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const needShadow =
    opts.denoiseShadow > 0 || opts.filter === 'cleanDoc' || opts.filter === 'bw';
  const needWatermark = Boolean(opts.watermarkRemoval?.enabled && opts.watermarkRemoval.strength > 0);
  const needFilter = opts.filter !== 'none';
  const needTone = opts.brightness !== 100 || opts.contrast !== 100;
  const effectiveSharpen = clamp(opts.sharpen + (opts.localUpscale ? 28 : 0), 0, 120);

  if (!needShadow && !needWatermark && !needFilter && !needTone && effectiveSharpen === 0) {
    return;
  }

  // Optional illumination background map for shadow & yellowing removal
  let bgData: Uint8ClampedArray | null = null;
  const shadowStrength =
    opts.filter === 'cleanDoc'
      ? Math.max(0.72, opts.denoiseShadow / 100)
      : opts.filter === 'bw'
      ? Math.max(0.65, opts.denoiseShadow / 100)
      : opts.denoiseShadow / 100;

  if (needShadow && shadowStrength > 0.01) {
    const smallW = Math.max(12, Math.round(w / 24));
    const smallH = Math.max(12, Math.round(h / 24));
    const small = document.createElement('canvas');
    small.width = smallW;
    small.height = smallH;
    const sctx = small.getContext('2d');
    if (sctx) {
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(canvas, 0, 0, smallW, smallH);
      // Slight morphological brighten on coarse map so dark text blocks don't dim local background
      const smImg = sctx.getImageData(0, 0, smallW, smallH);
      const sd = smImg.data;
      const copy = new Uint8ClampedArray(sd);
      for (let y = 0; y < smallH; y++) {
        for (let x = 0; x < smallW; x++) {
          let maxR = 0, maxG = 0, maxB = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = clamp(y + dy, 0, smallH - 1);
            for (let dx = -1; dx <= 1; dx++) {
              const xx = clamp(x + dx, 0, smallW - 1);
              const idx = (yy * smallW + xx) * 4;
              if (copy[idx] > maxR) maxR = copy[idx];
              if (copy[idx + 1] > maxG) maxG = copy[idx + 1];
              if (copy[idx + 2] > maxB) maxB = copy[idx + 2];
            }
          }
          const o = (y * smallW + x) * 4;
          sd[o] = Math.max(120, maxR);
          sd[o + 1] = Math.max(120, maxG);
          sd[o + 2] = Math.max(120, maxB);
        }
      }
      sctx.putImageData(smImg, 0, 0);

      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = w;
      bgCanvas.height = h;
      const bctx = bgCanvas.getContext('2d', { willReadFrequently: true });
      if (bctx) {
        bctx.imageSmoothingEnabled = true;
        bctx.imageSmoothingQuality = 'high';
        bctx.drawImage(small, 0, 0, w, h);
        bgData = bctx.getImageData(0, 0, w, h).data;
      }
    }
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const totalPx = w * h;

  const wmStrength = needWatermark ? clamp(opts.watermarkRemoval!.strength, 0, 100) / 100 : 0;
  const removeColorStamps = Boolean(opts.watermarkRemoval?.removeColorStamps);
  // Watermark cutoff luminance: strength 0 -> 248, strength 100 -> 148
  const wmCutLow = 238 - wmStrength * 92;
  const wmCutHigh = Math.min(254, wmCutLow + 28);

  const brightFactor = opts.brightness / 100;
  const contrastFactor = opts.contrast / 100;

  for (let i = 0; i < totalPx; i++) {
    const idx = i * 4;
    const alpha = d[idx + 3];
    if (alpha === 0) continue;

    let r = d[idx];
    let g = d[idx + 1];
    let b = d[idx + 2];

    // 1. Adaptive shadow / illumination flattening
    if (bgData) {
      const bgR = Math.max(85, bgData[idx]);
      const bgG = Math.max(85, bgData[idx + 1]);
      const bgB = Math.max(85, bgData[idx + 2]);
      const nr = Math.min(255, (r / bgR) * 252);
      const ng = Math.min(255, (g / bgG) * 252);
      const nb = Math.min(255, (b / bgB) * 252);
      r = r * (1 - shadowStrength) + nr * shadowStrength;
      g = g * (1 - shadowStrength) + ng * shadowStrength;
      b = b * (1 - shadowStrength) + nb * shadowStrength;
    }

    // 2. Local watermark & light stamp removal
    if (needWatermark) {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Remove colored watermarks/stamps/grids when requested (red/blue/cyan/orange tinted marks)
      if (removeColorStamps && chroma > 24 && lum > 72) {
        const colorPush = clamp((chroma - 20) / 36, 0, 1) * clamp((lum - 68) / 55, 0, 1) * Math.min(1, wmStrength * 1.25);
        r = r + (255 - r) * colorPush;
        g = g + (255 - g) * colorPush;
        b = b + (255 - b) * colorPush;
      }

      // Smoothly lift light gray / translucent text watermarks to pure white while protecting dark ink
      const newLum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (newLum >= wmCutLow) {
        const t = clamp((newLum - wmCutLow) / Math.max(1, wmCutHigh - wmCutLow), 0, 1);
        const smooth = t * t * (3 - 2 * t);
        r = r + (255 - r) * smooth;
        g = g + (255 - g) * smooth;
        b = b + (255 - b) * smooth;
      }
    }

    // 3. Document Filter Presets
    if (opts.filter === 'grayscale') {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = y;
    } else if (opts.filter === 'bw') {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      // Soft S-curve document binarization (crisp ink + pure white paper, no jagged aliasing)
      const centered = (y - 168) * 3.1 + 168;
      const out = clamp(centered, 0, 255);
      r = g = b = out > 224 ? 255 : out;
    } else if (opts.filter === 'cleanDoc') {
      // Crisp white paper while preserving colored annotations/stamps and darkening dark ink
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      if (y > 218) {
        const lift = clamp((y - 218) / 22, 0, 1);
        r = r + (255 - r) * lift;
        g = g + (255 - g) * lift;
        b = b + (255 - b) * lift;
      } else {
        r = (r - 128) * 1.18 + 124;
        g = (g - 128) * 1.18 + 124;
        b = (b - 128) * 1.18 + 124;
      }
    } else if (opts.filter === 'enhance') {
      r = (r - 128) * 1.2 + 132;
      g = (g - 128) * 1.2 + 132;
      b = (b - 128) * 1.2 + 132;
      // Subtle saturation boost for crisp highlights/diagrams
      const avg = (r + g + b) / 3;
      r = avg + (r - avg) * 1.14;
      g = avg + (g - avg) * 1.14;
      b = avg + (b - avg) * 1.14;
    }

    // 4. Brightness & Contrast
    if (needTone) {
      r = ((r * brightFactor) - 128) * contrastFactor + 128;
      g = ((g * brightFactor) - 128) * contrastFactor + 128;
      b = ((b * brightFactor) - 128) * contrastFactor + 128;
    }

    d[idx] = clamp(r, 0, 255);
    d[idx + 1] = clamp(g, 0, 255);
    d[idx + 2] = clamp(b, 0, 255);
  }

  // 5. Unsharp Mask Convolution Sharpening (separable 3x3 Gaussian blur + thresholded residual)
  if (effectiveSharpen > 0 && w > 2 && h > 2) {
    const amount = (effectiveSharpen / 100) * 1.65;
    const threshold = 4; // Avoid amplifying flat paper noise
    const orig = new Uint8ClampedArray(d);
    const tmp = new Float32Array(totalPx * 3);

    // Horizontal 1-2-1 pass
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : 0;
        const xp = x < w - 1 ? x + 1 : w - 1;
        const i0 = (row + xm) * 4;
        const i1 = (row + x) * 4;
        const i2 = (row + xp) * 4;
        const o = (row + x) * 3;
        tmp[o] = (orig[i0] + orig[i1] * 2 + orig[i2]) * 0.25;
        tmp[o + 1] = (orig[i0 + 1] + orig[i1 + 1] * 2 + orig[i2 + 1]) * 0.25;
        tmp[o + 2] = (orig[i0 + 2] + orig[i1 + 2] * 2 + orig[i2 + 2]) * 0.25;
      }
    }

    // Vertical 1-2-1 pass + unsharp combine
    for (let y = 0; y < h; y++) {
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < h - 1 ? y + 1 : h - 1;
      for (let x = 0; x < w; x++) {
        const t0 = (ym * w + x) * 3;
        const t1 = (y * w + x) * 3;
        const t2 = (yp * w + x) * 3;
        const o = (y * w + x) * 4;
        if (orig[o + 3] === 0) continue;

        for (let c = 0; c < 3; c++) {
          const blur = (tmp[t0 + c] + tmp[t1 + c] * 2 + tmp[t2 + c]) * 0.25;
          const diff = orig[o + c] - blur;
          if (Math.abs(diff) >= threshold) {
            d[o + c] = clamp(orig[o + c] + diff * amount, 0, 255);
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export interface RenderCanvasOptions {
  maxDim: number;
  skipAiLayer?: boolean;
  skipEnhancements?: boolean;
  skipGeometry?: boolean;
  backgroundFill?: string;
}

/**
 * Single source of truth rendering pipeline shared by thumbnails, lightbox preview,
 * AI input baking, and final PDF generation.
 */
export async function renderProcessedImageCanvas(
  item: ImageItem,
  options: RenderCanvasOptions
): Promise<HTMLCanvasElement> {
  const useAi = !options.skipAiLayer && Boolean(item.aiEnhanced?.active && item.aiEnhanced.url);
  const sourceUrl = useAi ? item.aiEnhanced!.url : item.url;
  const img = await loadImageCached(sourceUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  let workingCanvas: HTMLCanvasElement;

  const cropMode: CropMode = useAi
    ? 'none'
    : options.skipGeometry
    ? 'none'
    : item.cropMode || (item.crop ? 'rect' : 'none');

  const upscaleFactor = !options.skipEnhancements && item.localUpscale && !useAi ? 2 : 1;

  if (cropMode === 'perspective' && item.perspectiveQuad && isConvexQuad(item.perspectiveQuad)) {
    const est = estimateQuadOutputSize(item.perspectiveQuad, srcW, srcH);
    const desiredMax = Math.max(est.width, est.height) * upscaleFactor;
    const scale = Math.min(1, options.maxDim / Math.max(1, desiredMax)) * upscaleFactor;
    const outW = Math.max(16, Math.round(est.width * scale));
    const outH = Math.max(16, Math.round(est.height * scale));
    workingCanvas = warpPerspectiveCanvas(img, item.perspectiveQuad, outW, outH);
  } else if (cropMode === 'polygon' && item.polygon && item.polygon.length >= 3) {
    const bounds = getPolygonBounds(item.polygon);
    const cropW = Math.max(1, bounds.w * srcW);
    const cropH = Math.max(1, bounds.h * srcH);
    const desiredMax = Math.max(cropW, cropH) * upscaleFactor;
    const scale = Math.min(1, options.maxDim / Math.max(1, desiredMax)) * upscaleFactor;
    const outW = Math.max(16, Math.round(cropW * scale));
    const outH = Math.max(16, Math.round(cropH * scale));
    workingCanvas = applyPolygonCropCanvas(
      img,
      item.polygon,
      item.polygonFill || 'white',
      outW,
      outH
    );
  } else {
    const rect = cropMode === 'rect' ? item.crop : null;
    const sx = rect ? Math.round(rect.x * srcW) : 0;
    const sy = rect ? Math.round(rect.y * srcH) : 0;
    const sw = rect ? Math.max(1, Math.round(rect.w * srcW)) : srcW;
    const sh = rect ? Math.max(1, Math.round(rect.h * srcH)) : srcH;

    const desiredMax = Math.max(sw, sh) * upscaleFactor;
    const scale = Math.min(1, options.maxDim / Math.max(1, desiredMax)) * upscaleFactor;
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));

    workingCanvas = document.createElement('canvas');
    workingCanvas.width = outW;
    workingCanvas.height = outH;
    const wctx = workingCanvas.getContext('2d');
    if (!wctx) throw new Error('2D context unavailable');
    if (options.backgroundFill) {
      wctx.fillStyle = options.backgroundFill;
      wctx.fillRect(0, 0, outW, outH);
    }
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = 'high';
    wctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  }

  // Apply rotation and flip when not using pre-baked AI layer (AI already received oriented geometry,
  // unless user rotated AFTER AI — wait: keeping rotation/flip always outside AI baking makes it reversible,
  // so we bake geometry + rotation/flip before AI only? No: apply rotation/flip uniformly if !useAi, OR apply always.
  // Actually applying rotation/flip BEFORE AI baking means AI sees upright text (crucial for OCR/restoration!).
  // Therefore, if !useAi, apply rotation & flip right here:
  if (!useAi && (item.rotation % 360 !== 0 || item.flipH || item.flipV)) {
    const rot = ((item.rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = swap ? workingCanvas.height : workingCanvas.width;
    rotCanvas.height = swap ? workingCanvas.width : workingCanvas.height;
    const rctx = rotCanvas.getContext('2d');
    if (rctx) {
      rctx.save();
      rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      rctx.rotate((rot * Math.PI) / 180);
      rctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
      rctx.drawImage(workingCanvas, -workingCanvas.width / 2, -workingCanvas.height / 2);
      rctx.restore();
      workingCanvas = rotCanvas;
    }
  }

  // Local manual healing brush strokes & pixel enhancement pipeline
  if (!options.skipEnhancements && !useAi) {
    if (item.eraseStrokes && item.eraseStrokes.length > 0) {
      applyEraseStrokes(workingCanvas, item.eraseStrokes);
    }

    applyPixelPipeline(workingCanvas, {
      filter: item.filter,
      brightness: item.brightness,
      contrast: item.contrast,
      sharpen: item.sharpen ?? 0,
      denoiseShadow: item.denoiseShadow ?? 0,
      localUpscale: Boolean(item.localUpscale),
      watermarkRemoval: item.watermarkRemoval,
    });
  }

  return workingCanvas;
}

/**
 * Generates a compact fingerprint of an ImageItem's visual state to avoid redundant thumbnail renders.
 */
export function getImageVisualSignature(item: ImageItem): string {
  return JSON.stringify([
    item.url,
    item.cropMode || (item.crop ? 'rect' : 'none'),
    item.crop,
    item.perspectiveQuad,
    item.polygon,
    item.polygonFill,
    item.rotation,
    item.flipH,
    item.flipV,
    item.filter,
    item.brightness,
    item.contrast,
    item.sharpen ?? 0,
    item.denoiseShadow ?? 0,
    Boolean(item.localUpscale),
    item.watermarkRemoval,
    item.eraseStrokes?.length ?? 0,
    item.aiEnhanced?.active ? item.aiEnhanced.url : null,
  ]);
}
