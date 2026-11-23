import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  FileUp,
  Scissors,
  ZoomIn,
  ZoomOut,
  Download,
  Eye,
  Loader2,
  Layers,
  Grid2x2,
} from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import {
  PaperSizeKey,
  PdfPageMeta,
  SplitOptions,
  computeSlicePlan,
  formatBytes,
  getPdfPagesMeta,
  processPdfSliceAdvanced,
  ptToMm,
} from '../lib/pdfSplitter';
import { loadPdfDocument, PDFDocumentProxy } from '../lib/pdfRenderer';
import { PdfThumbnailCanvas } from './PdfThumbnailCanvas';
import { PdfResultModal } from './PdfResultModal';
import { cn } from '../lib/utils';

interface SlicePdfWorkspaceProps {
  t: Dictionary;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function SlicePdfWorkspace({ t, onNotify }: SlicePdfWorkspaceProps) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceDoc, setSourceDoc] = useState<PDFDocumentProxy | null>(null);
  const [sourceMeta, setSourceMeta] = useState<PdfPageMeta[]>([]);
  const [activeSourcePage, setActiveSourcePage] = useState(1);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [canvasTab, setCanvasTab] = useState<'blueprint' | 'output'>('blueprint');
  const [zoomWidth, setZoomWidth] = useState(640);

  const [options, setOptions] = useState<SplitOptions>({
    direction: 'auto',
    scaleToFit: true,
    paperSize: 'a4',
    paperOrientation: 'portrait',
    marginMm: 0,
    overlapMm: 0,
    showCutMarks: false,
  });
  const [filename, setFilename] = useState('sliced.pdf');

  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [outputDoc, setOutputDoc] = useState<PDFDocumentProxy | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearResult = useCallback(() => {
    setResultBlob(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setOutputDoc((prev) => {
      prev?.destroy();
      return null;
    });
  }, []);

  const loadFile = useCallback(
    async (pdfFile: File) => {
      setLoadingPdf(true);
      clearResult();
      setFile(pdfFile);
      setCanvasTab('blueprint');
      setActiveSourcePage(1);
      setFilename(pdfFile.name.replace(/\.[^/.]+$/, '') + '_sliced.pdf');

      try {
        const [meta, doc] = await Promise.all([getPdfPagesMeta(pdfFile), loadPdfDocument(pdfFile)]);
        setSourceDoc((prev) => {
          prev?.destroy();
          return doc;
        });
        setSourceMeta(meta);
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
      sourceDoc?.destroy();
      outputDoc?.destroy();
    };
  }, [sourceDoc, outputDoc]);

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

  // Compute live cut plan for active page & total output page estimate across all source pages
  const activeMeta = sourceMeta[activeSourcePage - 1] || null;
  const activePlan = useMemo(() => {
    if (!activeMeta) return null;
    return computeSlicePlan(activeMeta.width, activeMeta.height, options);
  }, [activeMeta, options]);

  const totalEstimatedPages = useMemo(() => {
    return sourceMeta.reduce(
      (sum, m) => sum + computeSlicePlan(m.width, m.height, options).totalTiles,
      0
    );
  }, [sourceMeta, options]);

  const updateOptions = (patch: Partial<SplitOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }));
    clearResult();
  };

  const handleSlice = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const blob = await processPdfSliceAdvanced(file, options);
      setResultBlob(blob);
      const url = URL.createObjectURL(blob);
      setResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      const outDoc = await loadPdfDocument(blob);
      setOutputDoc((prev) => {
        prev?.destroy();
        return outDoc;
      });
      setCanvasTab('output');
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
      : `${filename.trim() || 'sliced'}.pdf`;
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
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) loadFile(e.target.files[0]);
          e.target.value = '';
        }}
      />

      {/* Main Stage */}
      <div
        {...getRootProps()}
        className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#F4F5F7] outline-none"
      >
        <input {...getInputProps()} />

        {/* Contextual Toolbar */}
        <div className="min-h-12 px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <FileUp size={14} />
              {file ? t.replacePdf : t.uploadPdf}
            </button>

            {file && (
              <>
                <div className="w-px h-5 bg-slate-200" />
                {/* Blueprint vs Output View Switcher */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
                  <button
                    onClick={() => setCanvasTab('blueprint')}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                      canvasTab === 'blueprint'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <Layers size={13} />
                    {t.tabBlueprint}
                  </button>
                  <button
                    onClick={() => setCanvasTab('output')}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                      canvasTab === 'output'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <Grid2x2 size={13} />
                    {t.tabOutput}
                    {outputDoc ? ` (${outputDoc.numPages})` : ''}
                  </button>
                </div>

                {canvasTab === 'blueprint' && sourceMeta.length > 1 && (
                  <select
                    value={activeSourcePage}
                    onChange={(e) => setActiveSourcePage(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white"
                  >
                    {sourceMeta.map((m) => (
                      <option key={m.pageNumber} value={m.pageNumber}>
                        {t.sourcePageSelect} #{m.pageNumber}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>

          {file && canvasTab === 'blueprint' && (
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1.5 py-1 bg-white">
              <button
                onClick={() => setZoomWidth((z) => Math.max(320, z - 120))}
                className="p-1 text-slate-600 hover:text-slate-900 rounded"
                aria-label="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-xs font-mono-num text-slate-600 w-10 text-center">
                {Math.round((zoomWidth / 640) * 100)}%
              </span>
              <button
                onClick={() => setZoomWidth((z) => Math.min(1120, z + 120))}
                className="p-1 text-slate-600 hover:text-slate-900 rounded"
                aria-label="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Canvas Viewport */}
        <div className="flex-1 overflow-auto canvas-dot-bg p-6">
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
                  <Scissors size={28} strokeWidth={1.6} />
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
                    fileInputRef.current?.click();
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
          ) : canvasTab === 'blueprint' && sourceDoc && activeMeta && activePlan ? (
            /* Live Cut-Line Blueprint Overlay */
            <div className="flex flex-col items-center pb-12">
              <div className="relative inline-block shadow-lg ring-1 ring-black/10 bg-white">
                <PdfThumbnailCanvas
                  pdfDoc={sourceDoc}
                  pageNumber={activeSourcePage}
                  targetWidth={zoomWidth}
                  aspectRatio={activeMeta.width / activeMeta.height}
                  eager
                />

                {/* SVG Cut-Line & Tile Overlay */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                >
                  {activePlan.tiles.map((tile) => {
                    const x = tile.xNorm * 1000;
                    const y = tile.yNorm * 1000;
                    const w = tile.wNorm * 1000;
                    const h = tile.hNorm * 1000;
                    return (
                      <g key={tile.index}>
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          fill={tile.index % 2 === 0 ? 'rgba(37, 99, 235, 0.04)' : 'transparent'}
                          stroke="#2563EB"
                          strokeWidth="2"
                          strokeDasharray="10 6"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Crisp HTML Tile Index Badges (not distorted by SVG preserveAspectRatio="none") */}
                <div className="absolute inset-0 pointer-events-none">
                  {activePlan.tiles.map((tile) => (
                    <div
                      key={tile.index}
                      className="absolute p-1.5"
                      style={{
                        left: `${tile.xNorm * 100}%`,
                        top: `${tile.yNorm * 100}%`,
                      }}
                    >
                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-600/90 text-white text-[10px] font-mono-num font-semibold shadow-xs">
                        P{tile.index}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : canvasTab === 'output' && outputDoc ? (
            /* Paginated Output Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 max-w-6xl mx-auto pb-10">
              {Array.from({ length: outputDoc.numPages }, (_, i) => (
                <div key={i + 1} className="flex flex-col items-center gap-1.5">
                  <div className="w-full shadow-sm ring-1 ring-black/[0.08] bg-white overflow-hidden rounded-xs">
                    <PdfThumbnailCanvas
                      pdfDoc={outputDoc}
                      pageNumber={i + 1}
                      targetWidth={320}
                      eager={i < 6}
                    />
                  </div>
                  <span className="text-[11px] font-mono-num text-slate-500">
                    {i + 1} / {outputDoc.numPages}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center gap-2 text-slate-500">
              <Scissors size={32} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">{t.noSliceOutputYet}</p>
              <p className="text-xs text-slate-500 max-w-sm">{t.noSliceOutputDesc}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Inspector */}
      <aside className="w-full lg:w-[320px] xl:w-[340px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="divide-y divide-slate-100">
          {/* Header & Live Metrics */}
          <div className="px-5 py-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">{t.sliceTitle}</h3>
            {file && activeMeta && activePlan && (
              <div className="space-y-1 text-xs text-slate-500 font-mono-num">
                <p className="truncate font-sans text-slate-700 font-medium">{file.name}</p>
                <p>
                  {t.sourceDimensions}: {ptToMm(activeMeta.width)} × {ptToMm(activeMeta.height)} mm ·{' '}
                  {formatBytes(file.size)}
                </p>
                <p className="text-blue-700 font-semibold">
                  {t.estimatedOutput}: {sourceMeta.length} → {totalEstimatedPages} {t.pagesUnit} (
                  {activePlan.cols}×{activePlan.rows})
                </p>
              </div>
            )}
          </div>

          {/* Direction & Paper Setup */}
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                {t.sliceDirection}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['auto', t.dirAuto],
                    ['vertical', t.dirVertical],
                    ['horizontal', t.dirHorizontal],
                    ['grid', t.dirGrid],
                  ] as const
                ).map(([dir, label]) => (
                  <button
                    key={dir}
                    onClick={() => updateOptions({ direction: dir })}
                    className={cn(
                      'py-2 px-2.5 rounded-lg border text-xs font-medium text-left transition-colors whitespace-nowrap truncate',
                      options.direction === dir
                        ? 'border-blue-600 bg-blue-50/70 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">{t.paperSize}</label>
                <select
                  value={options.paperSize}
                  onChange={(e) =>
                    updateOptions({
                      paperSize: e.target.value as Exclude<PaperSizeKey, 'auto'>,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:border-blue-600"
                >
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="letter">Letter</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t.orientation}
                </label>
                <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(
                    [
                      ['portrait', t.oriPortrait],
                      ['landscape', t.oriLandscape],
                    ] as const
                  ).map(([ori, label]) => (
                    <button
                      key={ori}
                      onClick={() => updateOptions({ paperOrientation: ori })}
                      className={cn(
                        'py-1 px-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                        options.paperOrientation === ori
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Print Precision: Scale, Margin, Overlap, Cut Marks */}
          <div className="px-5 py-4 space-y-4">
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-700 block">{t.scaleToFit}</span>
                <span className="text-[11px] text-slate-500 block leading-snug">
                  {t.scaleToFitDesc}
                </span>
              </div>
              <input
                type="checkbox"
                checked={options.scaleToFit}
                onChange={(e) => updateOptions({ scaleToFit: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-blue-600 rounded shrink-0"
              />
            </label>

            {/* Margin mm */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">{t.sliceMargin}</span>
                <span className="font-mono-num text-slate-500">{options.marginMm} mm</span>
              </div>
              <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
                {[0, 5, 10, 15].map((mm) => (
                  <button
                    key={mm}
                    onClick={() => updateOptions({ marginMm: mm })}
                    className={cn(
                      'py-1 rounded-md text-xs font-mono-num font-medium transition-colors',
                      options.marginMm === mm
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {mm}
                  </button>
                ))}
              </div>
            </div>

            {/* Overlap mm */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">{t.sliceOverlap}</span>
                <span className="font-mono-num text-slate-500">{options.overlapMm} mm</span>
              </div>
              <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
                {[0, 5, 10, 15].map((mm) => (
                  <button
                    key={mm}
                    onClick={() => updateOptions({ overlapMm: mm })}
                    className={cn(
                      'py-1 rounded-md text-xs font-mono-num font-medium transition-colors',
                      options.overlapMm === mm
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {mm}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">{t.sliceOverlapDesc}</p>
            </div>

            {/* Corner Cut Marks */}
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-700 block">{t.showCutMarks}</span>
                <span className="text-[11px] text-slate-500 block leading-snug">
                  {t.showCutMarksDesc}
                </span>
              </div>
              <input
                type="checkbox"
                checked={options.showCutMarks}
                onChange={(e) => updateOptions({ showCutMarks: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-blue-600 rounded shrink-0"
              />
            </label>
          </div>

          {/* Output Filename */}
          <div className="px-5 py-4 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">{t.outputFilename}</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Sticky Export CTA */}
        <div className="sticky bottom-0 p-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur-xs space-y-2.5 shrink-0">
          <button
            onClick={handleSlice}
            disabled={!file || isProcessing}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t.processing}
              </>
            ) : (
              <>
                {t.sliceAction}
                {totalEstimatedPages > 0 ? ` (${totalEstimatedPages})` : ''}
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

      {/* Output Preview Modal */}
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
