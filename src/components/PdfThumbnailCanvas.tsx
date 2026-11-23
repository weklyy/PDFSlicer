import { useEffect, useRef, useState } from 'react';
import { PDFDocumentProxy, renderPdfPageToCanvas } from '../lib/pdfRenderer';
import { cn } from '../lib/utils';

interface PdfThumbnailCanvasProps {
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number;
  targetWidth?: number;
  extraRotation?: number;
  className?: string;
  aspectRatio?: number;
  eager?: boolean;
}

export function PdfThumbnailCanvas({
  pdfDoc,
  pageNumber,
  targetWidth = 240,
  extraRotation = 0,
  className,
  aspectRatio = 595 / 842,
  eager = false,
}: PdfThumbnailCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(eager);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (eager) {
      setIsVisible(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!isVisible || !pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    setRendered(false);

    renderPdfPageToCanvas(pdfDoc, pageNumber, canvasRef.current, targetWidth, extraRotation)
      .then(() => {
        if (!cancelled) setRendered(true);
      })
      .catch(() => {
        // Ignore cancelled/stale renders
      });

    return () => {
      cancelled = true;
    };
  }, [isVisible, pdfDoc, pageNumber, targetWidth, extraRotation]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center justify-center bg-white overflow-hidden select-none',
        className
      )}
      style={!rendered ? { aspectRatio: `${aspectRatio}` } : undefined}
    >
      {!rendered && (
        <div className="absolute inset-0 bg-slate-100 animate-pulse flex items-center justify-center">
          <span className="text-[11px] font-mono-num text-slate-400">{pageNumber}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={cn(
          'max-w-full max-h-full h-auto w-auto block transition-opacity duration-150',
          rendered ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
