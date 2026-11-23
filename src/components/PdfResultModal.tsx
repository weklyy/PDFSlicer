import { useEffect, useState } from 'react';
import { X, Download, LayoutGrid, Rows3, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import { formatBytes } from '../lib/pdfSplitter';
import { loadPdfDocument, PDFDocumentProxy } from '../lib/pdfRenderer';
import { PdfThumbnailCanvas } from './PdfThumbnailCanvas';
import { cn } from '../lib/utils';

interface PdfResultModalProps {
  blob: Blob | null;
  filename: string;
  onClose: () => void;
  onDownload: () => void;
  t: Dictionary;
}

export function PdfResultModal({ blob, filename, onClose, onDownload, t }: PdfResultModalProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'scroll' | 'grid'>('scroll');
  const [zoom, setZoom] = useState(680);

  useEffect(() => {
    if (!blob) return;
    let active = true;
    let docInstance: PDFDocumentProxy | null = null;
    setLoading(true);

    loadPdfDocument(blob)
      .then((doc) => {
        if (!active) {
          doc.destroy();
          return;
        }
        docInstance = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      docInstance?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!blob) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-6xl h-[92vh] rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[260px] md:max-w-md">
              {filename}
            </h2>
            <span className="text-xs text-slate-500 font-mono-num whitespace-nowrap shrink-0">
              {numPages > 0 ? `${numPages} ${t.pagesUnit}` : '...'} · {formatBytes(blob.size)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
              <button
                onClick={() => setViewMode('scroll')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewMode === 'scroll'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                )}
                title="Scroll view"
              >
                <Rows3 size={15} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                )}
                title="Grid view"
              >
                <LayoutGrid size={15} />
              </button>
            </div>

            {viewMode === 'scroll' && (
              <div className="hidden sm:flex items-center gap-1 border border-slate-200 rounded-lg px-1.5 py-1">
                <button
                  onClick={() => setZoom((z) => Math.max(360, z - 120))}
                  className="p-1 text-slate-600 hover:text-slate-900 rounded"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-xs font-mono-num text-slate-600 w-10 text-center">
                  {Math.round((zoom / 680) * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(1040, z + 120))}
                  className="p-1 text-slate-600 hover:text-slate-900 rounded"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            )}

            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Download size={14} />
              {t.downloadPdf}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label={t.close}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 overflow-y-auto canvas-dot-bg p-6">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 size={24} className="animate-spin text-blue-600" />
              <span className="text-xs font-medium">{t.loadingPages}</span>
            </div>
          ) : viewMode === 'scroll' ? (
            <div className="flex flex-col items-center gap-6 pb-8">
              {Array.from({ length: numPages }, (_, i) => (
                <div key={i + 1} className="flex flex-col items-center gap-1.5 max-w-full">
                  <div className="shadow-md ring-1 ring-black/[0.08] bg-white overflow-hidden max-w-full">
                    <PdfThumbnailCanvas
                      pdfDoc={pdfDoc}
                      pageNumber={i + 1}
                      targetWidth={zoom}
                      eager={i < 3}
                    />
                  </div>
                  <span className="text-[11px] font-mono-num text-slate-500">
                    {i + 1} / {numPages}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 max-w-5xl mx-auto pb-8">
              {Array.from({ length: numPages }, (_, i) => (
                <div key={i + 1} className="flex flex-col items-center gap-1.5">
                  <div className="w-full shadow-xs ring-1 ring-black/[0.08] bg-white overflow-hidden rounded-sm">
                    <PdfThumbnailCanvas pdfDoc={pdfDoc} pageNumber={i + 1} targetWidth={260} />
                  </div>
                  <span className="text-[11px] font-mono-num text-slate-500">{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
