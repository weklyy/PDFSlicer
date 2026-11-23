import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  FileUp,
  FileText,
  RotateCw,
  RotateCcw,
  Copy,
  ZoomIn,
  Check,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Grid3x3,
  LayoutGrid,
  X,
} from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import {
  ExtractPageConfig,
  PdfPageMeta,
  extractPdfPagesAdvanced,
  formatBytes,
  formatPageRange,
  getPdfPagesMeta,
  parsePageNumbers,
} from '../lib/pdfSplitter';
import { loadPdfDocument, PDFDocumentProxy } from '../lib/pdfRenderer';
import { PdfThumbnailCanvas } from './PdfThumbnailCanvas';
import { PdfResultModal } from './PdfResultModal';
import { cn } from '../lib/utils';

interface ExtractPdfWorkspaceProps {
  t: Dictionary;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

interface ExtractPageItem {
  uid: string;
  pageNumber: number; // 1-based source page
  selected: boolean;
  rotationDelta: number;
  aspectRatio: number;
}

function makeUid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ExtractPdfWorkspace({ t, onNotify }: ExtractPdfWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [sourceMeta, setSourceMeta] = useState<PdfPageMeta[]>([]);
  const [pageItems, setPageItems] = useState<ExtractPageItem[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [rangeInput, setRangeInput] = useState('');
  const [keepCustomOrder, setKeepCustomOrder] = useState(true);
  const [density, setDensity] = useState<'compact' | 'standard'>('standard');
  const [filename, setFilename] = useState('extracted.pdf');

  const [inspectPage, setInspectPage] = useState<ExtractPageItem | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const lastClickedUidRef = useRef<string | null>(null);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ uid: string; side: 'before' | 'after' } | null>(
    null
  );

  const replaceInputRef = useRef<HTMLInputElement>(null);

  const clearResult = useCallback(() => {
    setResultBlob(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const loadFile = useCallback(
    async (pdfFile: File) => {
      setLoadingPdf(true);
      clearResult();
      setFile(pdfFile);
      setFilename(pdfFile.name.replace(/\.[^/.]+$/, '') + '_extracted.pdf');

      try {
        const [meta, doc] = await Promise.all([getPdfPagesMeta(pdfFile), loadPdfDocument(pdfFile)]);
        setPdfDoc((prev) => {
          prev?.destroy();
          return doc;
        });
        setSourceMeta(meta);
        const initial: ExtractPageItem[] = meta.map((m) => ({
          uid: makeUid(),
          pageNumber: m.pageNumber,
          selected: true,
          rotationDelta: 0,
          aspectRatio: m.width / m.height,
        }));
        setPageItems(initial);
        setRangeInput(meta.length > 0 ? `1-${meta.length}` : '');
      } catch (err) {
        console.error(err);
        onNotify('error', t.processError);
      } finally {
        setLoadingPdf(false);
      }
    },
    [clearResult, onNotify, t.processError]
  );

  useEffect(() => {
    return () => {
      pdfDoc?.destroy();
    };
  }, [pdfDoc]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (files[0]) loadFile(files[0]);
    },
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    maxFiles: 1,
    noClick: Boolean(file),
    noKeyboard: true,
    onDragEnter: undefined,
    onDragOver: undefined,
    onDragLeave: undefined,
  });

  // Sync range expression string whenever visual selection changes
  const syncRangeFromItems = (items: ExtractPageItem[]) => {
    const selectedNums = items.filter((i) => i.selected).map((i) => i.pageNumber);
    setRangeInput(formatPageRange(selectedNums));
  };

  // Apply typed range expression directly onto visual cards
  const handleRangeInputChange = (val: string) => {
    setRangeInput(val);
    clearResult();
    if (!sourceMeta.length) return;
    const parsed = new Set(parsePageNumbers(val, sourceMeta.length));
    setPageItems((prev) => prev.map((item) => ({ ...item, selected: parsed.has(item.pageNumber) })));
  };

  const toggleItem = (uid: string, e: React.MouseEvent) => {
    clearResult();
    setPageItems((prev) => {
      const next = [...prev];
      const idx = next.findIndex((x) => x.uid === uid);
      if (idx === -1) return prev;

      if (e.shiftKey && lastClickedUidRef.current) {
        const lastIdx = next.findIndex((x) => x.uid === lastClickedUidRef.current);
        if (lastIdx !== -1) {
          const [min, max] = idx < lastIdx ? [idx, lastIdx] : [lastIdx, idx];
          const targetState = !next[idx].selected;
          for (let i = min; i <= max; i++) {
            next[i] = { ...next[i], selected: targetState };
          }
          syncRangeFromItems(next);
          return next;
        }
      }

      next[idx] = { ...next[idx], selected: !next[idx].selected };
      syncRangeFromItems(next);
      return next;
    });
    lastClickedUidRef.current = uid;
  };

  const applyQuickSelect = (mode: 'all' | 'none' | 'invert' | 'odd' | 'even') => {
    clearResult();
    setPageItems((prev) => {
      const next = prev.map((item, idx) => {
        const pos = idx + 1;
        switch (mode) {
          case 'all':
            return { ...item, selected: true };
          case 'none':
            return { ...item, selected: false };
          case 'invert':
            return { ...item, selected: !item.selected };
          case 'odd':
            return { ...item, selected: pos % 2 === 1 };
          case 'even':
            return { ...item, selected: pos % 2 === 0 };
        }
      });
      syncRangeFromItems(next);
      return next;
    });
  };

  const rotateSelected = (delta: number) => {
    clearResult();
    setPageItems((prev) =>
      prev.map((item) =>
        item.selected
          ? { ...item, rotationDelta: (item.rotationDelta + delta + 360) % 360 }
          : item
      )
    );
  };

  const rotateSingle = (uid: string, delta: number) => {
    clearResult();
    setPageItems((prev) =>
      prev.map((item) =>
        item.uid === uid
          ? { ...item, rotationDelta: (item.rotationDelta + delta + 360) % 360 }
          : item
      )
    );
  };

  const duplicateSingle = (uid: string) => {
    clearResult();
    setPageItems((prev) => {
      const idx = prev.findIndex((x) => x.uid === uid);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], uid: makeUid(), selected: true };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      syncRangeFromItems(next);
      return next;
    });
  };

  const resetOrderAndEdits = () => {
    clearResult();
    const fresh: ExtractPageItem[] = sourceMeta.map((m) => ({
      uid: makeUid(),
      pageNumber: m.pageNumber,
      selected: true,
      rotationDelta: 0,
      aspectRatio: m.width / m.height,
    }));
    setPageItems(fresh);
    setRangeInput(sourceMeta.length > 0 ? `1-${sourceMeta.length}` : '');
  };

  // Drag & Drop reordering
  const onDragStart = (uid: string, e: React.DragEvent) => {
    setDraggingUid(uid);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (targetUid: string, e: React.DragEvent) => {
    if (!draggingUid || draggingUid === targetUid) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = (e.clientX - rect.left) / rect.width < 0.5 ? 'before' : 'after';
    setDropTarget({ uid: targetUid, side });
  };

  const onDrop = (targetUid: string, e: React.DragEvent) => {
    if (!draggingUid || draggingUid === targetUid || !dropTarget) return;
    e.preventDefault();
    e.stopPropagation();
    clearResult();
    setPageItems((prev) => {
      const fromIdx = prev.findIndex((x) => x.uid === draggingUid);
      if (fromIdx === -1) return prev;
      const moving = prev[fromIdx];
      const remaining = prev.filter((x) => x.uid !== draggingUid);
      const toIdx = remaining.findIndex((x) => x.uid === targetUid);
      if (toIdx === -1) return prev;
      const insertIdx = dropTarget.side === 'after' ? toIdx + 1 : toIdx;
      const next = [...remaining];
      next.splice(insertIdx, 0, moving);
      return next;
    });
    setDraggingUid(null);
    setDropTarget(null);
  };

  const selectedItems = useMemo(() => pageItems.filter((p) => p.selected), [pageItems]);

  const handleExtract = async () => {
    if (!file || selectedItems.length === 0) {
      onNotify('error', t.invalidPagesInfo);
      return;
    }
    setIsProcessing(true);
    try {
      const configs: ExtractPageConfig[] = (
        keepCustomOrder
          ? selectedItems
          : [...selectedItems].sort((a, b) => a.pageNumber - b.pageNumber)
      ).map((p) => ({
        pageNumber: p.pageNumber,
        rotationDelta: p.rotationDelta,
      }));
      const blob = await extractPdfPagesAdvanced(file, configs);
      setResultBlob(blob);
      const url = URL.createObjectURL(blob);
      setResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      onNotify('success', t.generatedSuccess);
    } catch (err) {
      console.error(err);
      onNotify('error', t.processError);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const safeName = filename.trim().endsWith('.pdf')
      ? filename.trim()
      : `${filename.trim() || 'extracted'}.pdf`;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
      <input
        ref={replaceInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) loadFile(e.target.files[0]);
          e.target.value = '';
        }}
      />

      {/* Main Canvas Stage */}
      <div
        {...getRootProps()}
        className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#F4F5F7] outline-none"
      >
        <input {...getInputProps()} />

        {/* Contextual Toolbar */}
        <div className="min-h-12 px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => replaceInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <FileUp size={14} />
              {file ? t.replacePdf : t.uploadPdf}
            </button>

            {pageItems.length > 0 && (
              <>
                <div className="w-px h-5 bg-slate-200 mx-1" />

                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
                  {(
                    [
                      ['all', t.selectAll],
                      ['none', t.deselectAll],
                      ['invert', t.invertSelection],
                      ['odd', t.selectOdd],
                      ['even', t.selectEven],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => applyQuickSelect(key)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white transition-colors whitespace-nowrap"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                <button
                  onClick={() => rotateSelected(-90)}
                  disabled={selectedItems.length === 0}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-medium transition-colors"
                  title={t.rotateLeft}
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  onClick={() => rotateSelected(90)}
                  disabled={selectedItems.length === 0}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-medium transition-colors"
                  title={t.rotateRight}
                >
                  <RotateCw size={13} />
                </button>
                <button
                  onClick={resetOrderAndEdits}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <RefreshCw size={13} />
                  <span className="hidden md:inline">{t.resetOrder}</span>
                </button>
              </>
            )}
          </div>

          {pageItems.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="hidden xl:inline text-xs text-slate-400">
                {t.dragToReorderHint}
              </span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
                <button
                  onClick={() => setDensity('compact')}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    density === 'compact'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  )}
                  title={t.viewCompact}
                >
                  <Grid3x3 size={14} />
                </button>
                <button
                  onClick={() => setDensity('standard')}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    density === 'standard'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  )}
                  title={t.viewStandard}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Visual PDF Page Grid */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          {!file ? (
            <div className="h-full min-h-[420px] flex items-center justify-center">
              <div
                className={cn(
                  'w-full max-w-xl rounded-xl border-2 border-dashed p-12 text-center transition-colors bg-white cursor-pointer flex flex-col items-center gap-4',
                  isDragActive
                    ? 'border-blue-500 bg-blue-50/40'
                    : 'border-slate-300 hover:border-blue-400'
                )}
              >
                <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <FileText size={28} strokeWidth={1.6} />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-base font-semibold text-slate-900">{t.dropPdfHere}</h2>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {t.dropPdfHint}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    replaceInputRef.current?.click();
                  }}
                  className="mt-1 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                >
                  {t.uploadPdf}
                </button>
              </div>
            </div>
          ) : loadingPdf ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 size={26} className="animate-spin text-blue-600" />
              <span className="text-xs font-medium">{t.loadingPages}</span>
            </div>
          ) : (
            <div
              className={cn('grid pb-10', density === 'compact' ? 'gap-3' : 'gap-4')}
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${
                  density === 'compact' ? 168 : 220
                }px, 1fr))`,
              }}
            >
              {pageItems.map((item, visualIdx) => {
                const isDragging = draggingUid === item.uid;
                const dropSide = dropTarget?.uid === item.uid ? dropTarget.side : null;

                return (
                  <div
                    key={item.uid}
                    draggable
                    onDragStart={(e) => onDragStart(item.uid, e)}
                    onDragOver={(e) => onDragOver(item.uid, e)}
                    onDrop={(e) => onDrop(item.uid, e)}
                    onDragEnd={() => {
                      setDraggingUid(null);
                      setDropTarget(null);
                    }}
                    onClick={(e) => toggleItem(item.uid, e)}
                    className={cn(
                      'group relative flex flex-col rounded-xl bg-white border transition-all select-none cursor-grab active:cursor-grabbing',
                      item.selected
                        ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-xs'
                        : 'border-slate-200/80 opacity-60 hover:opacity-90',
                      isDragging && 'opacity-30 scale-[0.97]'
                    )}
                  >
                    {dropSide === 'before' && (
                      <div className="absolute -left-2.5 inset-y-1 w-1 rounded-full bg-blue-600 z-20 pointer-events-none" />
                    )}
                    {dropSide === 'after' && (
                      <div className="absolute -right-2.5 inset-y-1 w-1 rounded-full bg-blue-600 z-20 pointer-events-none" />
                    )}

                    {/* Header row */}
                    <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
                      <span
                        className={cn(
                          'w-5 h-5 rounded flex items-center justify-center border transition-colors',
                          item.selected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-300 text-transparent'
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <span className="text-[11px] font-mono-num text-slate-500">
                        {visualIdx + 1 !== item.pageNumber
                          ? `#${visualIdx + 1} (P${item.pageNumber})`
                          : `P${item.pageNumber}`}
                      </span>
                    </div>

                    {/* PDF Page Thumbnail */}
                    <div className="px-2.5 pb-2.5 flex-1 flex items-center justify-center relative">
                      <div className="w-full shadow-xs ring-1 ring-black/[0.08] bg-white overflow-hidden rounded-xs relative">
                        <PdfThumbnailCanvas
                          pdfDoc={pdfDoc}
                          pageNumber={item.pageNumber}
                          targetWidth={density === 'compact' ? 190 : 270}
                          extraRotation={item.rotationDelta}
                          aspectRatio={
                            item.rotationDelta % 180 === 90
                              ? 1 / item.aspectRatio
                              : item.aspectRatio
                          }
                        />

                        {/* Hover Actions */}
                        <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 backdrop-blur-xs rounded-lg p-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectPage(item);
                            }}
                            className="p-1.5 rounded text-white/90 hover:text-white hover:bg-white/15 transition-colors"
                            title={t.inspectPage}
                          >
                            <ZoomIn size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              rotateSingle(item.uid, 90);
                            }}
                            className="p-1.5 rounded text-white/90 hover:text-white hover:bg-white/15 transition-colors"
                            title={t.rotateRight}
                          >
                            <RotateCw size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateSingle(item.uid);
                            }}
                            className="p-1.5 rounded text-white/90 hover:text-white hover:bg-white/15 transition-colors"
                            title={t.duplicate}
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Inspector */}
      <aside className="w-full lg:w-[320px] xl:w-[340px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="divide-y divide-slate-100">
          <div className="px-5 py-4 space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">{t.extractTitle}</h3>
            {file && (
              <p className="text-xs text-slate-500 font-mono-num truncate">
                {file.name} · {sourceMeta.length} {t.pagesUnit} · {formatBytes(file.size)}
              </p>
            )}
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">{t.pageRangeLabel}</label>
              <span className="text-xs font-mono-num text-blue-600 font-medium">
                {selectedItems.length} / {pageItems.length} {t.pagesUnit}
              </span>
            </div>
            <input
              type="text"
              value={rangeInput}
              disabled={!file}
              onChange={(e) => handleRangeInputChange(e.target.value)}
              placeholder={t.pageRangePlaceholder}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono-num text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:border-blue-600 disabled:bg-slate-50"
            />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {t.dragToReorderHint}
            </p>
          </div>

          <div className="px-5 py-4 space-y-4">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-xs font-medium text-slate-700">{t.keepCustomOrder}</span>
              <input
                type="checkbox"
                checked={keepCustomOrder}
                onChange={(e) => {
                  setKeepCustomOrder(e.target.checked);
                  clearResult();
                }}
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                {t.outputFilename}
              </label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Sticky Export CTA */}
        <div className="sticky bottom-0 p-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur-xs space-y-2.5 shrink-0">
          <button
            onClick={handleExtract}
            disabled={!file || selectedItems.length === 0 || isProcessing}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t.processing}
              </>
            ) : (
              <>
                {t.extractAction} ({selectedItems.length})
              </>
            )}
          </button>

          {resultBlob && resultUrl && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowResultModal(true)}
                className="py-2 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Eye size={14} />
                {t.previewResult}
              </button>
              <button
                onClick={handleDownload}
                className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download size={14} />
                {t.downloadPdf}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Single Page Zoom Inspect Lightbox */}
      {inspectPage && pdfDoc && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center p-4 md:p-8"
          onClick={() => setInspectPage(null)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-slate-800 font-mono-num">
                P{inspectPage.pageNumber}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    rotateSingle(inspectPage.uid, 90);
                    setInspectPage((p) =>
                      p ? { ...p, rotationDelta: (p.rotationDelta + 90) % 360 } : null
                    );
                  }}
                  className="px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                >
                  <RotateCw size={13} />
                  +90°
                </button>
                <button
                  onClick={() => setInspectPage(null)}
                  className="p-1 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-auto canvas-dot-bg flex justify-center">
              <div className="shadow-lg ring-1 ring-black/10 bg-white">
                <PdfThumbnailCanvas
                  pdfDoc={pdfDoc}
                  pageNumber={inspectPage.pageNumber}
                  targetWidth={720}
                  extraRotation={inspectPage.rotationDelta}
                  eager
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result Preview Modal */}
      {showResultModal && resultBlob && (
        <PdfResultModal
          blob={resultBlob}
          filename={filename.endsWith('.pdf') ? filename : `${filename}.pdf`}
          onClose={() => setShowResultModal(false)}
          onDownload={handleDownload}
          t={t}
        />
      )}
    </div>
  );
}
