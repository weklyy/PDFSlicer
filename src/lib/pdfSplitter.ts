import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

export type PaperSizeKey = 'a4' | 'a3' | 'letter' | 'legal' | 'auto';
export type OrientationKey = 'auto' | 'portrait' | 'landscape';
export type MarginPreset = 'none' | 'narrow' | 'normal' | 'wide';
export type ScaleType = 'fit' | 'fill' | 'original';
export type ImageFilterType = 'none' | 'grayscale' | 'bw' | 'enhance';
export type QualityPreset = 'original' | 'high' | 'balanced' | 'compact';
export type PageNumberPosition = 'none' | 'center' | 'right';

export const PAPER_SIZES_PT: Record<Exclude<PaperSizeKey, 'auto'>, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4 (210 × 297 mm)' },
  a3: { width: 841.89, height: 1190.55, label: 'A3 (297 × 420 mm)' },
  letter: { width: 612, height: 792, label: 'Letter (216 × 279 mm)' },
  legal: { width: 612, height: 1008, label: 'Legal (216 × 356 mm)' },
};

export const A4_PORTRAIT = { width: 595.28, height: 841.89 };
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

export const MM_TO_PT = 72 / 25.4; // ~2.83465 pt per mm

export const MARGIN_PT: Record<MarginPreset, number> = {
  none: 0,
  narrow: 10 * MM_TO_PT,
  normal: 20 * MM_TO_PT,
  wide: 30 * MM_TO_PT,
};

export interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

export interface ImageItem {
  id: string;
  file: File | null;
  isBlank?: boolean;
  name: string;
  size: number;
  lastModified: number;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  scaleType: 'global' | ScaleType;
  orientation: 'global' | 'portrait' | 'landscape';
  margin: 'global' | MarginPreset;
  filter: ImageFilterType;
  brightness: number; // 50..150, default 100
  contrast: number; // 50..150, default 100
  crop: CropRect | null;
}

export interface GlobalImagePdfSettings {
  paperSize: PaperSizeKey;
  orientation: OrientationKey;
  margin: MarginPreset;
  scaleType: ScaleType;
  quality: QualityPreset;
  pageNumbers: PageNumberPosition;
}

export interface SplitOptions {
  direction: 'auto' | 'horizontal' | 'vertical' | 'grid';
  scaleToFit: boolean;
  paperSize: Exclude<PaperSizeKey, 'auto'>;
  paperOrientation: 'portrait' | 'landscape';
  marginMm: number;
  overlapMm: number;
  showCutMarks: boolean;
}

export interface PdfPageMeta {
  pageNumber: number; // 1-based
  width: number; // visual width in pt (accounting for original rotation)
  height: number; // visual height in pt
  rawWidth: number;
  rawHeight: number;
  rotation: number;
}

export interface ExtractPageConfig {
  pageNumber: number; // 1-based original page index
  rotationDelta: number; // additional clockwise rotation 0, 90, 180, 270
}

export interface SlicePlan {
  cols: number;
  rows: number;
  totalTiles: number;
  effectiveDir: 'horizontal' | 'vertical' | 'grid';
  scale: number;
  pageW: number;
  pageH: number;
  marginPt: number;
  overlapPt: number;
  printableW: number;
  printableH: number;
  scaledW: number;
  scaledH: number;
  stepX: number; // in scaled space
  stepY: number; // in scaled space
  // Normalized 0..1 tile rectangles on the source page for crisp SVG overlay
  tiles: Array<{
    index: number;
    col: number;
    row: number;
    xNorm: number;
    yNorm: number;
    wNorm: number;
    hNorm: number;
  }>;
}

export function getPaperDimensions(
  paperSize: Exclude<PaperSizeKey, 'auto'>,
  orientation: 'portrait' | 'landscape'
): { width: number; height: number } {
  const base = PAPER_SIZES_PT[paperSize] || PAPER_SIZES_PT.a4;
  return orientation === 'portrait'
    ? { width: base.width, height: base.height }
    : { width: base.height, height: base.width };
}

export function computeSlicePlan(
  sourceW: number,
  sourceH: number,
  options: SplitOptions
): SlicePlan {
  const { width: pageW, height: pageH } = getPaperDimensions(
    options.paperSize,
    options.paperOrientation
  );
  const marginPt = Math.max(0, options.marginMm) * MM_TO_PT;
  const printableW = Math.max(40, pageW - marginPt * 2);
  const printableH = Math.max(40, pageH - marginPt * 2);
  const maxOverlap = Math.min(printableW, printableH) * 0.4;
  const overlapPt = Math.min(Math.max(0, options.overlapMm) * MM_TO_PT, maxOverlap);

  let effectiveDir: 'horizontal' | 'vertical' | 'grid';
  if (options.direction === 'auto') {
    effectiveDir = sourceW > sourceH * 1.15 ? 'horizontal' : 'vertical';
  } else {
    effectiveDir = options.direction;
  }

  let scale = 1;
  if (options.scaleToFit) {
    if (effectiveDir === 'horizontal') {
      scale = printableH / sourceH;
    } else if (effectiveDir === 'vertical') {
      scale = printableW / sourceW;
    } else {
      // In 2D grid mode, keep 1:1 unless smaller than one page
      scale = 1;
    }
  }

  const scaledW = sourceW * scale;
  const scaledH = sourceH * scale;

  const stepX = Math.max(10, printableW - overlapPt);
  const stepY = Math.max(10, printableH - overlapPt);

  let cols = 1;
  let rows = 1;

  if (effectiveDir === 'horizontal') {
    cols = scaledW <= printableW + 1 ? 1 : Math.ceil((scaledW - printableW) / stepX) + 1;
    rows = 1;
  } else if (effectiveDir === 'vertical') {
    cols = 1;
    rows = scaledH <= printableH + 1 ? 1 : Math.ceil((scaledH - printableH) / stepY) + 1;
  } else {
    cols = scaledW <= printableW + 1 ? 1 : Math.ceil((scaledW - printableW) / stepX) + 1;
    rows = scaledH <= printableH + 1 ? 1 : Math.ceil((scaledH - printableH) / stepY) + 1;
  }

  // Clamp to reasonable ceiling to prevent accidental OOM on bizarre custom files
  cols = Math.min(cols, 50);
  rows = Math.min(rows, 80);

  const tiles: SlicePlan['tiles'] = [];
  let idx = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const startX = c * stepX;
      const startY = r * stepY;
      const tileW = Math.min(printableW, Math.max(0, scaledW - startX));
      const tileH = Math.min(printableH, Math.max(0, scaledH - startY));
      tiles.push({
        index: idx++,
        col: c,
        row: r,
        xNorm: startX / scaledW,
        yNorm: startY / scaledH,
        wNorm: Math.min(1 - startX / scaledW, printableW / scaledW),
        hNorm: Math.min(1 - startY / scaledH, printableH / scaledH),
      });
      void tileW;
      void tileH;
    }
  }

  return {
    cols,
    rows,
    totalTiles: cols * rows,
    effectiveDir,
    scale,
    pageW,
    pageH,
    marginPt,
    overlapPt,
    printableW,
    printableH,
    scaledW,
    scaledH,
    stepX,
    stepY,
    tiles,
  };
}

export interface ResolvedImagePageLayout {
  pageW: number;
  pageH: number;
  paperAspect: number;
  effOri: 'portrait' | 'landscape';
  marginPt: number;
  padXPct: number;
  padYPct: number;
  effScale: ScaleType;
  effImgW: number;
  effImgH: number;
  drawW: number;
  drawH: number;
  drawWPct: number;
  drawHPct: number;
}

/**
 * Single source of truth for page dimensions, orientation, margins, and image placement
 * shared between thumbnail previews, lightbox editor, and PDF export.
 */
export function resolveImagePageLayout(
  item: ImageItem,
  settings: GlobalImagePdfSettings,
  overrideImgSize?: { width: number; height: number }
): ResolvedImagePageLayout {
  const effMarginPreset = item.margin === 'global' ? settings.margin : item.margin;
  const marginPt = MARGIN_PT[effMarginPreset];

  let effImgW: number;
  let effImgH: number;
  if (overrideImgSize) {
    effImgW = Math.max(1, overrideImgSize.width);
    effImgH = Math.max(1, overrideImgSize.height);
  } else {
    const baseW = item.naturalWidth || 595;
    const baseH = item.naturalHeight || 842;
    const cropW = item.crop ? item.crop.w * baseW : baseW;
    const cropH = item.crop ? item.crop.h * baseH : baseH;
    const rot = ((item.rotation % 360) + 360) % 360;
    const swapped = rot === 90 || rot === 270;
    effImgW = Math.max(1, swapped ? cropH : cropW);
    effImgH = Math.max(1, swapped ? cropW : cropH);
  }

  let pageW: number;
  let pageH: number;
  let effOri: 'portrait' | 'landscape';

  if (item.isBlank) {
    const sizeKey = settings.paperSize === 'auto' ? 'a4' : settings.paperSize;
    effOri =
      item.orientation !== 'global'
        ? item.orientation
        : settings.orientation === 'landscape'
        ? 'landscape'
        : 'portrait';
    const dims = getPaperDimensions(sizeKey, effOri);
    pageW = dims.width;
    pageH = dims.height;
  } else if (settings.paperSize === 'auto') {
    const ptScale = Math.min(1, 842 / Math.max(effImgW, effImgH));
    pageW = effImgW * ptScale + marginPt * 2;
    pageH = effImgH * ptScale + marginPt * 2;
    effOri = pageW > pageH ? 'landscape' : 'portrait';
  } else {
    if (item.orientation !== 'global') {
      effOri = item.orientation;
    } else if (settings.orientation === 'auto') {
      effOri = effImgW > effImgH ? 'landscape' : 'portrait';
    } else {
      effOri = settings.orientation;
    }
    const dims = getPaperDimensions(settings.paperSize, effOri);
    pageW = dims.width;
    pageH = dims.height;
  }

  const effScale = item.scaleType === 'global' ? settings.scaleType : item.scaleType;
  const availW = Math.max(20, pageW - marginPt * 2);
  const availH = Math.max(20, pageH - marginPt * 2);

  let drawW = effImgW;
  let drawH = effImgH;

  if (effScale === 'fit' || settings.paperSize === 'auto') {
    const s = Math.min(availW / effImgW, availH / effImgH);
    drawW = effImgW * s;
    drawH = effImgH * s;
  } else if (effScale === 'fill') {
    const s = Math.max(availW / effImgW, availH / effImgH);
    drawW = effImgW * s;
    drawH = effImgH * s;
  } else {
    // Original pixel size converted at 96dpi -> 72pt (0.75 pt/px), capped so huge photos stay legible unless larger than page
    drawW = effImgW * 0.75;
    drawH = effImgH * 0.75;
  }

  return {
    pageW,
    pageH,
    paperAspect: pageW / pageH,
    effOri,
    marginPt,
    padXPct: (marginPt / pageW) * 100,
    padYPct: (marginPt / pageH) * 100,
    effScale,
    effImgW,
    effImgH,
    drawW,
    drawH,
    drawWPct: (drawW / pageW) * 100,
    drawHPct: (drawH / pageH) * 100,
  };
}

/**
 * Checks if a JPEG buffer has an EXIF Orientation tag != 1 so pdf-lib doesn't embed it sideways.
 */
function hasNonNormalExifOrientation(buffer: ArrayBuffer): boolean {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) return false;
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1) {
        if (view.getUint32(offset + 2, false) !== 0x45786966) return false;
        const little = view.getUint16(offset + 8, false) === 0x4949;
        const ifdOffset = offset + 8 + view.getUint32(offset + 12, little);
        if (ifdOffset + 2 > view.byteLength) return false;
        const entries = view.getUint16(ifdOffset, little);
        for (let i = 0; i < entries; i++) {
          const entry = ifdOffset + 2 + i * 12;
          if (entry + 10 > view.byteLength) break;
          if (view.getUint16(entry, little) === 0x0112) {
            return view.getUint16(entry + 8, little) !== 1;
          }
        }
        return false;
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else {
        offset += view.getUint16(offset, false);
      }
    }
  } catch {
    return false;
  }
  return false;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function renderProcessedImageBytes(
  item: ImageItem,
  quality: QualityPreset
): Promise<{ bytes: Uint8Array; format: 'jpg' | 'png'; width: number; height: number }> {
  let needsCanvas =
    Boolean(item.crop) ||
    item.flipH ||
    item.flipV ||
    item.rotation % 360 !== 0 ||
    item.filter !== 'none' ||
    item.brightness !== 100 ||
    item.contrast !== 100 ||
    quality !== 'original' ||
    !item.file ||
    !['image/jpeg', 'image/jpg', 'image/png'].includes(item.file.type.toLowerCase());

  if (!needsCanvas && item.file) {
    const buf = await item.file.arrayBuffer();
    const isPng = item.file.type.toLowerCase() === 'image/png';
    if (!isPng && hasNonNormalExifOrientation(buf)) {
      needsCanvas = true;
    } else {
      return {
        bytes: new Uint8Array(buf),
        format: isPng ? 'png' : 'jpg',
        width: item.naturalWidth || 1000,
        height: item.naturalHeight || 1000,
      };
    }
  }

  const htmlImg = await loadHtmlImage(item.url);
  const srcW = htmlImg.naturalWidth;
  const srcH = htmlImg.naturalHeight;

  // Source crop in pixel space
  const sx = item.crop ? Math.round(item.crop.x * srcW) : 0;
  const sy = item.crop ? Math.round(item.crop.y * srcH) : 0;
  const sw = item.crop ? Math.max(1, Math.round(item.crop.w * srcW)) : srcW;
  const sh = item.crop ? Math.max(1, Math.round(item.crop.h * srcH)) : srcH;

  // Resolution scaling for compact/balanced quality
  const maxDim =
    quality === 'compact' ? 1600 : quality === 'balanced' ? 2200 : quality === 'high' ? 3200 : 4096;
  const downscale = Math.min(1, maxDim / Math.max(sw, sh));
  const outBaseW = Math.max(1, Math.round(sw * downscale));
  const outBaseH = Math.max(1, Math.round(sh * downscale));

  const rot = ((item.rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const canvasW = swap ? outBaseH : outBaseW;
  const canvasH = swap ? outBaseW : outBaseH;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // White background for JPEG output (avoids black transparent areas)
  const useJpeg = quality !== 'original' || item.file?.type.toLowerCase() !== 'image/png';
  if (useJpeg) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // Build CSS filter chain
  const filters: string[] = [];
  if (item.filter === 'grayscale') {
    filters.push('grayscale(100%)');
  } else if (item.filter === 'bw') {
    filters.push('grayscale(100%)', 'contrast(185%)', 'brightness(112%)');
  } else if (item.filter === 'enhance') {
    filters.push('contrast(120%)', 'saturate(112%)', 'brightness(104%)');
  }
  if (item.brightness !== 100) filters.push(`brightness(${item.brightness}%)`);
  if (item.contrast !== 100) filters.push(`contrast(${item.contrast}%)`);
  if (filters.length > 0) {
    ctx.filter = filters.join(' ');
  }

  ctx.save();
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
  ctx.drawImage(htmlImg, sx, sy, sw, sh, -outBaseW / 2, -outBaseH / 2, outBaseW, outBaseH);
  ctx.restore();

  const jpegQuality =
    quality === 'compact' ? 0.58 : quality === 'balanced' ? 0.78 : quality === 'high' ? 0.91 : 0.95;

  const mime = useJpeg ? 'image/jpeg' : 'image/png';
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      mime,
      useJpeg ? jpegQuality : undefined
    );
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    format: useJpeg ? 'jpg' : 'png',
    width: canvasW,
    height: canvasH,
  };
}

export async function imagesToPdfAdvanced(
  images: ImageItem[],
  settings: GlobalImagePdfSettings,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = settings.pageNumbers !== 'none' ? await pdfDoc.embedFont(StandardFonts.Helvetica) : null;

  const total = images.length;
  for (let i = 0; i < total; i++) {
    const item = images[i];
    onProgress?.(i + 1, total);

    const effMarginPreset = item.margin === 'global' ? settings.margin : item.margin;
    const marginPt = MARGIN_PT[effMarginPreset];

    if (item.isBlank || !item.file) {
      const sizeKey = settings.paperSize === 'auto' ? 'a4' : settings.paperSize;
      const ori =
        item.orientation !== 'global'
          ? item.orientation
          : settings.orientation === 'landscape'
          ? 'landscape'
          : 'portrait';
      const dims = getPaperDimensions(sizeKey, ori);
      const page = pdfDoc.addPage([dims.width, dims.height]);
      if (helvetica && settings.pageNumbers !== 'none') {
        const label = `${i + 1} / ${total}`;
        const textWidth = helvetica.widthOfTextAtSize(label, 9);
        const x =
          settings.pageNumbers === 'center'
            ? (dims.width - textWidth) / 2
            : dims.width - Math.max(marginPt, 24) - textWidth;
        page.drawText(label, { x, y: 14, size: 9, font: helvetica, color: rgb(0.45, 0.48, 0.54) });
      }
      continue;
    }

    const processed = await renderProcessedImageBytes(item, settings.quality);
    const pdfImage =
      processed.format === 'png'
        ? await pdfDoc.embedPng(processed.bytes)
        : await pdfDoc.embedJpg(processed.bytes);

    const layout = resolveImagePageLayout(item, settings, {
      width: pdfImage.width,
      height: pdfImage.height,
    });
    const { pageW, pageH, drawW, drawH } = layout;

    const page = pdfDoc.addPage([pageW, pageH]);
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    page.drawImage(pdfImage, { x, y, width: drawW, height: drawH });

    if (helvetica && settings.pageNumbers !== 'none') {
      const label = `${i + 1} / ${total}`;
      const textWidth = helvetica.widthOfTextAtSize(label, 9);
      const tx =
        settings.pageNumbers === 'center'
          ? (pageW - textWidth) / 2
          : pageW - Math.max(marginPt, 24) - textWidth;
      page.drawText(label, {
        x: tx,
        y: 14,
        size: 9,
        font: helvetica,
        color: rgb(0.45, 0.48, 0.54),
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

export async function getPdfPagesMeta(file: File): Promise<PdfPageMeta[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return pdfDoc.getPages().map((p, idx) => {
    const { width, height } = p.getSize();
    const rot = ((p.getRotation().angle % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    return {
      pageNumber: idx + 1,
      width: swap ? height : width,
      height: swap ? width : height,
      rawWidth: width,
      rawHeight: height,
      rotation: rot,
    };
  });
}

export async function getPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
}

export function parsePageNumbers(input: string, maxPage: number): number[] {
  const pages = new Set<number>();
  const normalizedInput = input
    .replace(/[，、；;\s]/g, ',')
    .replace(/[－—~～]/g, '-');

  const parts = normalizedInput.split(',').filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr, ...rest] = part.split('-');
      if (rest.length > 0) continue;
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          if (i > 0 && i <= maxPage) pages.add(i);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num > 0 && num <= maxPage) {
        pages.add(num);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export function formatPageRange(pages: number[]): string {
  if (pages.length === 0) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

export async function extractPdfPagesAdvanced(
  file: File,
  configs: ExtractPageConfig[]
): Promise<Blob> {
  if (configs.length === 0) {
    throw new Error('No valid pages selected.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const outPdf = await PDFDocument.create();
  const totalPages = pdfDoc.getPageCount();

  const validConfigs = configs.filter((c) => c.pageNumber >= 1 && c.pageNumber <= totalPages);
  if (validConfigs.length === 0) {
    throw new Error('No valid pages selected.');
  }

  const indices = validConfigs.map((c) => c.pageNumber - 1);
  const copiedPages = await outPdf.copyPages(pdfDoc, indices);

  copiedPages.forEach((page, i) => {
    const delta = validConfigs[i].rotationDelta;
    if (delta % 360 !== 0) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + delta) % 360));
    }
    outPdf.addPage(page);
  });

  const pdfBytes = await outPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

export async function processPdfSliceAdvanced(
  file: File,
  options: SplitOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const outPdf = await PDFDocument.create();
  const pages = pdfDoc.getPages();

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    onProgress?.(pIdx + 1, pages.length);
    const page = pages[pIdx];
    const { width, height } = page.getSize();
    const plan = computeSlicePlan(width, height, options);
    const embeddedPage = await outPdf.embedPage(page);

    for (let r = 0; r < plan.rows; r++) {
      for (let c = 0; c < plan.cols; c++) {
        const newPage = outPdf.addPage([plan.pageW, plan.pageH]);

        // Coordinates in pdf-lib have origin at bottom-left
        // Top of printable area = plan.pageH - plan.marginPt
        // Left of printable area = plan.marginPt
        const drawX = plan.marginPt - c * plan.stepX;
        const drawY = plan.pageH - plan.marginPt - plan.scaledH + r * plan.stepY;

        newPage.drawPage(embeddedPage, {
          x: drawX,
          y: drawY,
          width: plan.scaledW,
          height: plan.scaledH,
        });

        // Mask outer margin cleanly with white rectangles if margin > 0
        if (plan.marginPt > 0.5) {
          const m = plan.marginPt;
          const white = rgb(1, 1, 1);
          // Bottom margin
          newPage.drawRectangle({ x: 0, y: 0, width: plan.pageW, height: m, color: white });
          // Top margin
          newPage.drawRectangle({ x: 0, y: plan.pageH - m, width: plan.pageW, height: m, color: white });
          // Left margin
          newPage.drawRectangle({ x: 0, y: 0, width: m, height: plan.pageH, color: white });
          // Right margin
          newPage.drawRectangle({ x: plan.pageW - m, y: 0, width: m, height: plan.pageH, color: white });
        }

        // Optional alignment corner crop marks
        if (options.showCutMarks) {
          const m = Math.max(plan.marginPt, 6);
          const len = 8;
          const markColor = rgb(0.55, 0.6, 0.68);
          const corners = [
            { x: m, y: m, dx: -1, dy: -1 },
            { x: plan.pageW - m, y: m, dx: 1, dy: -1 },
            { x: m, y: plan.pageH - m, dx: -1, dy: 1 },
            { x: plan.pageW - m, y: plan.pageH - m, dx: 1, dy: 1 },
          ];
          for (const pt of corners) {
            newPage.drawLine({
              start: { x: pt.x, y: pt.y },
              end: { x: pt.x + pt.dx * len, y: pt.y },
              thickness: 0.5,
              color: markColor,
            });
            newPage.drawLine({
              start: { x: pt.x, y: pt.y },
              end: { x: pt.x, y: pt.y + pt.dy * len },
              thickness: 0.5,
              color: markColor,
            });
          }
        }
      }
    }
  }

  const pdfBytes = await outPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ptToMm(pt: number): number {
  return Math.round(pt / MM_TO_PT);
}
