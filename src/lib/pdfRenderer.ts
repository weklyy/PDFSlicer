import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;

export async function loadPdfDocument(source: File | Blob): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await source.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  return loadingTask.promise;
}

export async function renderPdfPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetWidth: number,
  extraRotation = 0
): Promise<{ width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNumber);
  const baseRotation = (page.rotate + extraRotation) % 360;
  const unscaledViewport = page.getViewport({ scale: 1, rotation: baseRotation });
  const scale = targetWidth / unscaledViewport.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: scale * dpr, rotation: baseRotation });

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${Math.floor(unscaledViewport.width * scale)}px`;
  canvas.style.height = `${Math.floor(unscaledViewport.height * scale)}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain canvas 2D context');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  }).promise;

  return {
    width: unscaledViewport.width * scale,
    height: unscaledViewport.height * scale,
  };
}
