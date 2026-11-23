import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Crop,
  SlidersHorizontal,
  LayoutTemplate,
  ChevronLeft,
  ChevronRight,
  RotateCcw as ResetIcon,
  Sparkles,
  Check,
  Wand2,
  Scan,
  Hexagon,
  Eraser,
  Columns2,
  Loader2,
  AlertCircle,
  Trash2,
  Undo2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import {
  CropRect,
  GlobalImagePdfSettings,
  ImageFilterType,
  ImageItem,
  MarginPreset,
  ScaleType,
  formatBytes,
  resolveImagePageLayout,
} from '../lib/pdfSplitter';
import {
  AiEnhanceMode,
  AiEnhancedResult,
  EraseStroke,
  PerspectiveQuad,
  Point2D,
  PolygonFillMode,
  detectDocumentQuad,
  detectWhiteBorders,
  estimateQuadOutputSize,
  getImageVisualSignature,
  isConvexQuad,
  renderProcessedImageCanvas,
} from '../lib/imageProcessor';
import { AiEnhanceClientError, requestAiEnhancement } from '../lib/aiEnhanceClient';
import { InteractiveCropStage } from './InteractiveCropStage';
import { BeforeAfterCompareStage } from './BeforeAfterCompareStage';
import { cn } from '../lib/utils';

export type EditorTab = 'transform' | 'crop' | 'enhance';
type CropSubMode = 'rect' | 'perspective' | 'polygon';

export interface LocalEnhanceSyncPayload {
  filter: ImageFilterType;
  brightness: number;
  contrast: number;
  sharpen: number;
  denoiseShadow: number;
  localUpscale: boolean;
  watermarkRemoval: {
    enabled: boolean;
    strength: number;
    removeColorStamps: boolean;
  };
}

interface ImageDetailModalProps {
  items: ImageItem[];
  activeId: string;
  initialTab?: EditorTab;
  globalSettings: GlobalImagePdfSettings;
  onSelectId: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ImageItem>) => void;
  onApplyEnhanceToAll: (payload: LocalEnhanceSyncPayload) => void;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
  onClose: () => void;
  t: Dictionary;
}

export function buildImageCssFilter(
  filter: ImageFilterType,
  brightness: number,
  contrast: number
): string {
  const parts: string[] = [];
  if (filter === 'grayscale') parts.push('grayscale(100%)');
  else if (filter === 'bw') parts.push('grayscale(100%)', 'contrast(185%)', 'brightness(112%)');
  else if (filter === 'enhance') parts.push('contrast(120%)', 'saturate(112%)', 'brightness(104%)');
  else if (filter === 'cleanDoc') parts.push('contrast(118%)', 'brightness(106%)');
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

const DEFAULT_QUAD: PerspectiveQuad = [
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

export function ImageDetailModal({
  items,
  activeId,
  initialTab = 'transform',
  globalSettings,
  onSelectId,
  onUpdate,
  onApplyEnhanceToAll,
  onNotify,
  onClose,
  t,
}: ImageDetailModalProps) {
  const currentIndex = items.findIndex((i) => i.id === activeId);
  const item = items[currentIndex];

  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [cropSubMode, setCropSubMode] = useState<CropSubMode>('rect');

  // Draft Crop States
  const [draftRect, setDraftRect] = useState<CropRect>(item?.crop || { x: 0, y: 0, w: 1, h: 1 });
  const [trimSensitivity, setTrimSensitivity] = useState<number>(item?.autoTrimSensitivity ?? 55);
  const [trimPadding, setTrimPadding] = useState<number>(item?.autoTrimPadding ?? 2);
  const [isDetectingCrop, setIsDetectingCrop] = useState(false);

  const [draftQuad, setDraftQuad] = useState<PerspectiveQuad>(
    item?.perspectiveQuad || DEFAULT_QUAD
  );
  const [draftPolygon, setDraftPolygon] = useState<Point2D[]>(item?.polygon || []);
  const [polygonClosed, setPolygonClosed] = useState<boolean>(
    Boolean(item?.polygon && item.polygon.length >= 3)
  );
  const [polygonFill, setPolygonFill] = useState<PolygonFillMode>(item?.polygonFill || 'white');

  // Enhance & Watermark Studio States
  const [compareMode, setCompareMode] = useState(false);
  const [brushActive, setBrushActive] = useState(false);
  const [brushRadius, setBrushRadius] = useState(0.028);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);
  const activeStrokeRef = useRef<Point2D[] | null>(null);
  const brushOverlayRef = useRef<HTMLDivElement>(null);

  // Before/After generated data URLs
  const [compareUrls, setCompareUrls] = useState<{ before: string; after: string } | null>(null);

  // AI Enhancement States
  const [aiLoadingMode, setAiLoadingMode] = useState<AiEnhanceMode | null>(null);
  const [aiDraft, setAiDraft] = useState<AiEnhancedResult | null>(null);
  const [aiErrorBanner, setAiErrorBanner] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  // Sync draft state when switching page
  useEffect(() => {
    if (!item) return;
    setDraftRect(item.crop || { x: 0, y: 0, w: 1, h: 1 });
    setTrimSensitivity(item.autoTrimSensitivity ?? 55);
    setTrimPadding(item.autoTrimPadding ?? 2);
    setDraftQuad(item.perspectiveQuad || DEFAULT_QUAD);
    setDraftPolygon(item.polygon || []);
    setPolygonClosed(Boolean(item.polygon && item.polygon.length >= 3));
    setPolygonFill(item.polygonFill || 'white');

    const mode = item.cropMode || (item.crop ? 'rect' : 'none');
    if (mode === 'perspective') setCropSubMode('perspective');
    else if (mode === 'polygon') setCropSubMode('polygon');
    else setCropSubMode('rect');

    setAiDraft(null);
    setAiErrorBanner(null);
    setBrushActive(false);
    setCompareMode(false);
  }, [item?.id]);

  // Cancel in-flight AI request on unmount
  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (brushActive) setBrushActive(false);
        else onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0 && !aiLoadingMode) {
        onSelectId(items[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && currentIndex < items.length - 1 && !aiLoadingMode) {
        onSelectId(items[currentIndex + 1].id);
      } else if (
        (e.key === 'r' || e.key === 'R') &&
        !e.metaKey &&
        !e.ctrlKey &&
        item &&
        !item.isBlank &&
        tab === 'transform'
      ) {
        onUpdate(item.id, { rotation: (item.rotation + 90) % 360 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items, item, tab, brushActive, aiLoadingMode, onClose, onSelectId, onUpdate]);

  // Render Before / After images whenever split comparison or AI draft is active
  const itemVisualSig = item ? getImageVisualSignature(item) : '';
  useEffect(() => {
    if (!item || item.isBlank || (!compareMode && !aiDraft)) {
      setCompareUrls(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const beforeCanvas = await renderProcessedImageCanvas(item, {
          maxDim: 1100,
          skipAiLayer: true,
          skipEnhancements: true,
          backgroundFill: '#FFFFFF',
        });
        const beforeUrl = beforeCanvas.toDataURL('image/jpeg', 0.9);
        let afterUrl: string;
        if (aiDraft) {
          afterUrl = aiDraft.url;
        } else {
          const afterCanvas = await renderProcessedImageCanvas(item, {
            maxDim: 1100,
            backgroundFill: '#FFFFFF',
          });
          afterUrl = afterCanvas.toDataURL('image/jpeg', 0.92);
        }
        if (alive) {
          setCompareUrls({ before: beforeUrl, after: afterUrl });
        }
      } catch (err) {
        console.error(err);
      }
    }, 60);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [itemVisualSig, compareMode, aiDraft]);

  if (!item) return null;

  const wmSettings = item.watermarkRemoval ?? {
    enabled: false,
    strength: 55,
    removeColorStamps: false,
  };
  const eraseStrokes = item.eraseStrokes ?? [];

  // Rect Auto White-Border Detection
  const runAutoDetectWhiteBorders = async (sens = trimSensitivity, pad = trimPadding) => {
    if (item.isBlank) return;
    setIsDetectingCrop(true);
    try {
      const detected = await detectWhiteBorders(item.url, {
        sensitivity: sens,
        paddingPct: pad,
      });
      if (detected) {
        setDraftRect(detected);
        onUpdate(item.id, {
          cropMode: 'rect',
          crop: detected,
          autoTrimApplied: true,
          autoTrimSensitivity: sens,
          autoTrimPadding: pad,
          aiEnhanced: item.aiEnhanced ? { ...item.aiEnhanced, active: false } : null,
        });
      } else {
        setDraftRect({ x: 0, y: 0, w: 1, h: 1 });
        onNotify('info', t.autoTrimNoneFound);
      }
    } finally {
      setIsDetectingCrop(false);
    }
  };

  // Auto-detect 4 corners for perspective deskew
  const runAutoDetectQuad = async () => {
    if (item.isBlank) return;
    setIsDetectingCrop(true);
    try {
      const detected = await detectDocumentQuad(item.url);
      setDraftQuad(detected);
    } finally {
      setIsDetectingCrop(false);
    }
  };

  const applyAspectCrop = (ratio: number | null) => {
    if (!ratio || !item.naturalWidth || !item.naturalHeight) {
      setDraftRect({ x: 0, y: 0, w: 1, h: 1 });
      onUpdate(item.id, { cropMode: 'none', crop: null, autoTrimApplied: false });
      return;
    }
    const imgRatio = item.naturalWidth / item.naturalHeight;
    let w = 1;
    let h = 1;
    if (imgRatio > ratio) w = ratio / imgRatio;
    else h = imgRatio / ratio;
    const rect: CropRect = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    setDraftRect(rect);
    onUpdate(item.id, { cropMode: 'rect', crop: rect, autoTrimApplied: false });
  };

  const commitActiveCrop = (goTransform = false) => {
    if (cropSubMode === 'rect') {
      const isFull =
        draftRect.x < 0.005 &&
        draftRect.y < 0.005 &&
        draftRect.w > 0.99 &&
        draftRect.h > 0.99;
      onUpdate(item.id, {
        cropMode: isFull ? 'none' : 'rect',
        crop: isFull ? null : draftRect,
        autoTrimSensitivity: trimSensitivity,
        autoTrimPadding: trimPadding,
        ...(isFull ? { autoTrimApplied: false } : {}),
        aiEnhanced: item.aiEnhanced ? { ...item.aiEnhanced, active: false } : null,
      });
    } else if (cropSubMode === 'perspective') {
      if (isConvexQuad(draftQuad)) {
        onUpdate(item.id, {
          cropMode: 'perspective',
          perspectiveQuad: draftQuad,
          autoTrimApplied: false,
          aiEnhanced: item.aiEnhanced ? { ...item.aiEnhanced, active: false } : null,
        });
      }
    } else if (cropSubMode === 'polygon') {
      if (draftPolygon.length >= 3) {
        setPolygonClosed(true);
        onUpdate(item.id, {
          cropMode: 'polygon',
          polygon: draftPolygon,
          polygonFill,
          autoTrimApplied: false,
          aiEnhanced: item.aiEnhanced ? { ...item.aiEnhanced, active: false } : null,
        });
      }
    }
    if (goTransform) setTab('transform');
  };

  const resetAllCrop = () => {
    setDraftRect({ x: 0, y: 0, w: 1, h: 1 });
    setDraftQuad(DEFAULT_QUAD);
    setDraftPolygon([]);
    setPolygonClosed(false);
    onUpdate(item.id, {
      cropMode: 'none',
      crop: null,
      autoTrimApplied: false,
      perspectiveQuad: null,
      polygon: null,
    });
  };

  // Manual Healing Brush Pointer Handlers
  const getNormalizedBrushPoint = (e: React.PointerEvent): Point2D | null => {
    const el = brushOverlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleBrushDown = (e: React.PointerEvent) => {
    if (!brushActive) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pt = getNormalizedBrushPoint(e);
    if (!pt) return;
    activeStrokeRef.current = [pt];
    setBrushCursor({ x: e.clientX, y: e.clientY });
  };

  const handleBrushMove = (e: React.PointerEvent) => {
    if (!brushActive) return;
    setBrushCursor({ x: e.clientX, y: e.clientY });
    if (!activeStrokeRef.current) return;
    const pt = getNormalizedBrushPoint(e);
    if (!pt) return;
    const last = activeStrokeRef.current[activeStrokeRef.current.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) > 0.005) {
      activeStrokeRef.current.push(pt);
    }
  };

  const handleBrushUp = () => {
    if (!activeStrokeRef.current) return;
    const points = activeStrokeRef.current;
    activeStrokeRef.current = null;
    const newStroke: EraseStroke = { points, radius: brushRadius };
    onUpdate(item.id, {
      eraseStrokes: [...eraseStrokes, newStroke],
      aiEnhanced: item.aiEnhanced ? { ...item.aiEnhanced, active: false } : null,
    });
  };

  // AI Deep Restoration Handler
  const handleRunAi = async (mode: AiEnhanceMode) => {
    if (item.isBlank || aiLoadingMode) return;
    setAiErrorBanner(null);
    setAiDraft(null);
    setBrushActive(false);
    setAiLoadingMode(mode);

    const controller = new AbortController();
    aiAbortRef.current = controller;

    try {
      const result = await requestAiEnhancement(item, mode, controller.signal);
      setAiDraft(result);
      setCompareMode(true);
      onNotify('success', t.aiDoneToast);
    } catch (err: unknown) {
      const e = err as AiEnhanceClientError;
      if (e.errorCode === 'ABORTED') return;
      let localizedMsg = e.message;
      if (e.errorCode === 'API_KEY_MISSING') localizedMsg = t.aiKeyMissingTip;
      else if (e.errorCode === 'API_KEY_INVALID') localizedMsg = t.aiKeyInvalidTip;
      else if (e.errorCode === 'QUOTA_EXCEEDED') localizedMsg = t.aiQuotaTip;
      setAiErrorBanner(localizedMsg);
      onNotify('error', localizedMsg);
    } finally {
      setAiLoadingMode(null);
      aiAbortRef.current = null;
    }
  };

  const handleAcceptAiDraft = () => {
    if (!aiDraft) return;
    onUpdate(item.id, { aiEnhanced: { ...aiDraft, active: true } });
    setAiDraft(null);
    setCompareMode(false);
  };

  const quadOutputEst = useMemo(
    () => estimateQuadOutputSize(draftQuad, item.naturalWidth || 1000, item.naturalHeight || 1000),
    [draftQuad, item.naturalWidth, item.naturalHeight]
  );

  const layout = resolveImagePageLayout(item, globalSettings);
  const { paperAspect, effOri, effScale, padXPct, padYPct } = layout;

  const aiProcessingLabel =
    aiLoadingMode === 'watermark'
      ? t.aiProcessingWatermark
      : aiLoadingMode === 'hd'
      ? t.aiProcessingHd
      : t.aiProcessingBoth;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-6xl h-[92vh] rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">
              {t.editorTitle}
            </span>
            <span className="text-xs text-slate-500 font-mono-num truncate">
              #{currentIndex + 1} / {items.length} · {item.name}
              {!item.isBlank && item.naturalWidth > 0
                ? ` · ${item.naturalWidth}×${item.naturalHeight} · ${formatBytes(item.size)}`
                : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => currentIndex > 0 && onSelectId(items[currentIndex - 1].id)}
                disabled={currentIndex <= 0 || Boolean(aiLoadingMode)}
                className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-35 transition-colors flex items-center gap-1 text-xs font-medium whitespace-nowrap"
                title={t.prevPage}
              >
                <ChevronLeft size={15} />
                <span className="hidden sm:inline">{t.prevPage}</span>
              </button>
              <div className="w-px h-5 bg-slate-200" />
              <button
                onClick={() =>
                  currentIndex < items.length - 1 && onSelectId(items[currentIndex + 1].id)
                }
                disabled={currentIndex >= items.length - 1 || Boolean(aiLoadingMode)}
                className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-35 transition-colors flex items-center gap-1 text-xs font-medium whitespace-nowrap"
                title={t.nextPage}
              >
                <span className="hidden sm:inline">{t.nextPage}</span>
                <ChevronRight size={15} />
              </button>
            </div>

            <button
              onClick={() => {
                if (tab === 'crop') commitActiveCrop(false);
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {t.save}
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

        {/* Body Split */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left/Center Main Stage */}
          <div className="flex-1 canvas-dot-bg flex flex-col items-center justify-center p-5 md:p-8 overflow-hidden relative min-h-[320px]">
            {/* Top floating bar inside stage when in Enhance tab */}
            {tab === 'enhance' && !item.isBlank && (
              <div className="absolute top-3 inset-x-4 z-20 flex items-center justify-between gap-2 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                  {!aiDraft && (
                    <button
                      type="button"
                      onClick={() => {
                        setBrushActive(false);
                        setCompareMode((v) => !v);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium shadow-xs transition-colors whitespace-nowrap',
                        compareMode
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-white'
                      )}
                    >
                      <Columns2 size={14} />
                      {t.compareBeforeAfter}
                    </button>
                  )}

                  {brushActive && (
                    <span className="px-2.5 py-1.5 rounded-lg bg-slate-900/85 text-white text-xs font-medium">
                      {t.eraserBrushHint}
                    </span>
                  )}
                </div>

                {/* AI Draft Accept / Discard Bar */}
                {aiDraft && (
                  <div className="flex items-center gap-2 bg-white border border-blue-200 shadow-md rounded-lg px-2.5 py-1.5 pointer-events-auto">
                    <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">
                      {t.tagAi} · {aiDraft.width}×{aiDraft.height}
                    </span>
                    <button
                      type="button"
                      onClick={handleAcceptAiDraft}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      <Check size={13} />
                      {t.aiAcceptResult}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiDraft(null);
                        setCompareMode(false);
                      }}
                      className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium whitespace-nowrap transition-colors"
                    >
                      {t.aiDiscardResult}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AI Loading Overlay */}
            {aiLoadingMode && (
              <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 p-6">
                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Loader2 size={22} className="animate-spin" />
                </div>
                <p className="text-sm font-semibold text-slate-900">{aiProcessingLabel}</p>
                <button
                  type="button"
                  onClick={() => aiAbortRef.current?.abort()}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            )}

            {item.isBlank ? (
              <div
                className="bg-white shadow-md ring-1 ring-black/[0.08] flex items-center justify-center text-slate-400 text-sm"
                style={{
                  aspectRatio: `${paperAspect}`,
                  height: 'min(100%, 560px)',
                  maxWidth: '100%',
                }}
              >
                {t.blankPage}
              </div>
            ) : tab === 'crop' ? (
              <InteractiveCropStage
                imageUrl={item.url}
                imageName={item.name}
                mode={cropSubMode}
                draftRect={draftRect}
                onChangeRect={setDraftRect}
                draftQuad={draftQuad}
                onChangeQuad={setDraftQuad}
                draftPolygon={draftPolygon}
                polygonClosed={polygonClosed}
                onChangePolygon={(pts, closed) => {
                  setDraftPolygon(pts);
                  setPolygonClosed(closed);
                }}
                hintText={
                  cropSubMode === 'perspective'
                    ? t.perspectiveHint
                    : cropSubMode === 'polygon'
                    ? t.polygonHint
                    : t.cropHint
                }
              />
            ) : (compareMode || aiDraft) && compareUrls ? (
              <BeforeAfterCompareStage
                beforeUrl={compareUrls.before}
                afterUrl={compareUrls.after}
                beforeLabel={t.beforeLabel}
                afterLabel={aiDraft ? t.tagAi : t.afterLabel}
                alt={item.name}
              />
            ) : tab === 'enhance' && brushActive ? (
              /* Interactive Manual Healing Brush Canvas Stage */
              <div
                ref={brushOverlayRef}
                onPointerDown={handleBrushDown}
                onPointerMove={handleBrushMove}
                onPointerUp={handleBrushUp}
                onPointerLeave={() => setBrushCursor(null)}
                className="relative inline-flex items-center justify-center max-h-[64vh] max-w-[66vw] shadow-md ring-1 ring-blue-500/40 bg-white overflow-hidden cursor-none touch-none select-none"
              >
                <CroppedPreviewImage item={item} fitMode="fit" maxPreview={1100} />
                {brushCursor && (
                  <div
                    className="fixed pointer-events-none rounded-full border-2 border-blue-600 bg-blue-500/15 z-50 -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: brushCursor.x,
                      top: brushCursor.y,
                      width: `${Math.max(12, Math.round(brushRadius * 900))}px`,
                      height: `${Math.max(12, Math.round(brushRadius * 900))}px`,
                    }}
                  />
                )}
              </div>
            ) : (
              /* Paper-Framed WYSIWYG Preview */
              <div
                className="bg-white shadow-md ring-1 ring-black/[0.09] relative overflow-hidden flex items-center justify-center"
                style={{
                  aspectRatio: `${paperAspect}`,
                  height: effOri === 'portrait' ? 'min(100%, 580px)' : 'auto',
                  width: effOri === 'landscape' ? 'min(100%, 650px)' : 'auto',
                  maxHeight: '100%',
                  maxWidth: '100%',
                  paddingLeft: `${padXPct}%`,
                  paddingRight: `${padXPct}%`,
                  paddingTop: `${padYPct}%`,
                  paddingBottom: `${padYPct}%`,
                }}
              >
                <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
                  <CroppedPreviewImage
                    item={item}
                    fitMode={globalSettings.paperSize === 'auto' ? 'fit' : effScale}
                    maxPreview={1100}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Controls Sidebar */}
          <div className="w-full lg:w-[350px] border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
            {!item.isBlank && (
              <div className="grid grid-cols-3 border-b border-slate-200 px-2 pt-2 bg-slate-50/70 shrink-0">
                {(
                  [
                    ['transform', t.tabTransform, LayoutTemplate],
                    ['crop', t.tabCrop, Crop],
                    ['enhance', t.tabEnhance, SlidersHorizontal],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (tab === 'crop' && key !== 'crop') commitActiveCrop(false);
                      setBrushActive(false);
                      setTab(key);
                    }}
                    className={cn(
                      'flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                      tab === key
                        ? 'border-blue-600 text-blue-600 bg-white rounded-t-md'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="p-5 space-y-5 flex-1">
              {/* TAB 1: TRANSFORM & LAYOUT */}
              {tab === 'transform' && (
                <>
                  {!item.isBlank && (
                    <div className="space-y-2.5">
                      <label className="text-xs font-semibold text-slate-700 block">
                        {t.tabTransform}
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        <button
                          onClick={() =>
                            onUpdate(item.id, { rotation: (item.rotation + 270) % 360 })
                          }
                          className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium transition-colors"
                          title={t.rotateLeft}
                        >
                          <RotateCcw size={15} />
                          <span>-90°</span>
                        </button>
                        <button
                          onClick={() =>
                            onUpdate(item.id, { rotation: (item.rotation + 90) % 360 })
                          }
                          className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium transition-colors"
                          title={t.rotateRight}
                        >
                          <RotateCw size={15} />
                          <span>+90°</span>
                        </button>
                        <button
                          onClick={() => onUpdate(item.id, { flipH: !item.flipH })}
                          className={cn(
                            'flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border text-[11px] font-medium transition-colors',
                            item.flipH
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          )}
                          title={t.flipH}
                        >
                          <FlipHorizontal size={15} />
                          <span>H</span>
                        </button>
                        <button
                          onClick={() => onUpdate(item.id, { flipV: !item.flipV })}
                          className={cn(
                            'flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border text-[11px] font-medium transition-colors',
                            item.flipV
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          )}
                          title={t.flipV}
                        >
                          <FlipVertical size={15} />
                          <span>V</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t.orientation}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg">
                      {(
                        [
                          ['global', t.followGlobal],
                          ['portrait', t.oriPortrait],
                          ['landscape', t.oriLandscape],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => onUpdate(item.id, { orientation: val })}
                          className={cn(
                            'py-1.5 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap truncate',
                            item.orientation === val
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!item.isBlank && (
                    <div className="space-y-2 pt-4 border-t border-slate-100">
                      <label className="text-xs font-semibold text-slate-700 block">
                        {t.scaleMode}
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            ['global', t.followGlobal],
                            ['fit', t.scaleFit],
                            ['fill', t.scaleFill],
                            ['original', t.scaleOriginal],
                          ] as Array<['global' | ScaleType, string]>
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => onUpdate(item.id, { scaleType: val })}
                            className={cn(
                              'py-2 px-3 rounded-lg border text-xs font-medium transition-colors text-left',
                              item.scaleType === val
                                ? 'border-blue-600 bg-blue-50/70 text-blue-700'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t.margins}
                    </label>
                    <select
                      value={item.margin}
                      onChange={(e) =>
                        onUpdate(item.id, { margin: e.target.value as 'global' | MarginPreset })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:border-blue-600"
                    >
                      <option value="global">{t.followGlobal}</option>
                      <option value="none">{t.marginNone}</option>
                      <option value="narrow">{t.marginNarrow}</option>
                      <option value="normal">{t.marginNormal}</option>
                      <option value="wide">{t.marginWide}</option>
                    </select>
                  </div>
                </>
              )}

              {/* TAB 2: SMART CROP (RECT + 4-PT PERSPECTIVE + FREEFORM POLYGON) */}
              {tab === 'crop' && !item.isBlank && (
                <div className="space-y-4">
                  {/* 3-Mode Segmented Switcher */}
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                    {(
                      [
                        ['rect', t.cropModeRect, Crop],
                        ['perspective', t.cropModePerspective, Scan],
                        ['polygon', t.cropModePolygon, Hexagon],
                      ] as const
                    ).map(([mKey, label, Icon]) => (
                      <button
                        key={mKey}
                        onClick={() => {
                          setCropSubMode(mKey);
                          if (mKey === 'perspective' && !item.perspectiveQuad) {
                            runAutoDetectQuad();
                          }
                        }}
                        className={cn(
                          'flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap',
                          cropSubMode === mKey
                            ? 'bg-white text-slate-900 shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        )}
                      >
                        <Icon size={12} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>

                  {/* SUBMODE A: RECT + AUTO WHITE-BORDER TRIM */}
                  {cropSubMode === 'rect' && (
                    <div className="space-y-4">
                      <div className="space-y-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/60">
                        <button
                          onClick={() => runAutoDetectWhiteBorders()}
                          disabled={isDetectingCrop}
                          className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {isDetectingCrop ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Wand2 size={13} />
                          )}
                          {t.autoTrimDetect}
                        </button>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-medium text-slate-700">
                              {t.autoTrimSensitivity}
                            </span>
                            <span className="font-mono-num text-slate-500">{trimSensitivity}%</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={92}
                            value={trimSensitivity}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setTrimSensitivity(v);
                            }}
                            onMouseUp={() => runAutoDetectWhiteBorders(trimSensitivity, trimPadding)}
                            onTouchEnd={() => runAutoDetectWhiteBorders(trimSensitivity, trimPadding)}
                            className="w-full accent-blue-600"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-medium text-slate-700">{t.autoTrimPadding}</span>
                            <span className="font-mono-num text-slate-500">{trimPadding}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={8}
                            step={0.5}
                            value={trimPadding}
                            onChange={(e) => setTrimPadding(Number(e.target.value))}
                            onMouseUp={() => runAutoDetectWhiteBorders(trimSensitivity, trimPadding)}
                            onTouchEnd={() => runAutoDetectWhiteBorders(trimSensitivity, trimPadding)}
                            className="w-full accent-blue-600"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => applyAspectCrop(null)}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                        >
                          {t.cropReset}
                        </button>
                        <button
                          onClick={() => applyAspectCrop(210 / 297)}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                        >
                          A4 {t.oriPortrait}
                        </button>
                        <button
                          onClick={() => applyAspectCrop(297 / 210)}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                        >
                          A4 {t.oriLandscape}
                        </button>
                        <button
                          onClick={() => applyAspectCrop(1)}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                        >
                          1 : 1
                        </button>
                        <button
                          onClick={() => applyAspectCrop(4 / 3)}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                        >
                          4 : 3
                        </button>
                        <button
                          onClick={() => applyAspectCrop(16 / 9)}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                        >
                          16 : 9
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono-num text-slate-500">
                        <span>
                          {Math.round(draftRect.w * item.naturalWidth)} ×{' '}
                          {Math.round(draftRect.h * item.naturalHeight)} px
                        </span>
                        <span>
                          {Math.round(draftRect.w * 100)}% × {Math.round(draftRect.h * 100)}%
                        </span>
                      </div>

                      <button
                        onClick={() => commitActiveCrop(true)}
                        className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Check size={14} />
                        {t.apply}
                      </button>
                    </div>
                  )}

                  {/* SUBMODE B: 4-POINT PERSPECTIVE DESKEW */}
                  {cropSubMode === 'perspective' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={runAutoDetectQuad}
                          disabled={isDetectingCrop}
                          className="py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {isDetectingCrop ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Scan size={13} />
                          )}
                          {t.perspectiveDetect}
                        </button>
                        <button
                          onClick={() => setDraftQuad(DEFAULT_QUAD)}
                          className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
                        >
                          {t.perspectiveReset}
                        </button>
                      </div>

                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>{t.sourceDimensions}</span>
                          <span className="font-mono-num text-slate-900 font-semibold">
                            {quadOutputEst.width} × {quadOutputEst.height} px
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => commitActiveCrop(true)}
                          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Check size={14} />
                          {t.perspectiveApply}
                        </button>
                        <button
                          onClick={resetAllCrop}
                          className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors"
                        >
                          {t.restoreCrop}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUBMODE C: FREEFORM POLYGON IRREGULAR CROP */}
                  {cropSubMode === 'polygon' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => {
                            setDraftPolygon([
                              { x: 0.1, y: 0.1 },
                              { x: 0.9, y: 0.1 },
                              { x: 0.9, y: 0.9 },
                              { x: 0.1, y: 0.9 },
                            ]);
                            setPolygonClosed(true);
                          }}
                          className="py-2 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium"
                        >
                          {t.polygonInitQuad}
                        </button>
                        <button
                          onClick={() => {
                            if (draftPolygon.length >= 3 && !polygonClosed) {
                              setPolygonClosed(true);
                            }
                          }}
                          disabled={polygonClosed || draftPolygon.length < 3}
                          className="py-2 px-2.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-50 disabled:opacity-40 text-blue-700 text-xs font-semibold"
                        >
                          {t.polygonCloseShape}
                        </button>
                        <button
                          onClick={() => {
                            const next = draftPolygon.slice(0, -1);
                            setDraftPolygon(next);
                            if (next.length < 3) setPolygonClosed(false);
                          }}
                          disabled={draftPolygon.length === 0}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-medium"
                        >
                          {t.polygonUndoPoint}
                        </button>
                        <button
                          onClick={() => {
                            setDraftPolygon([]);
                            setPolygonClosed(false);
                          }}
                          disabled={draftPolygon.length === 0}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-medium"
                        >
                          {t.polygonClear}
                        </button>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <label className="text-xs font-semibold text-slate-700 block">
                          {t.polygonFillLabel}
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-lg">
                          {(
                            [
                              ['white', t.polygonFillWhite],
                              ['transparent', t.polygonFillTransparent],
                            ] as const
                          ).map(([fVal, label]) => (
                            <button
                              key={fVal}
                              onClick={() => setPolygonFill(fVal)}
                              className={cn(
                                'py-1.5 px-2 rounded-md text-xs font-medium transition-colors',
                                polygonFill === fVal
                                  ? 'bg-white text-slate-900 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 font-mono-num">
                        <span>{t.polygonPointsCount}</span>
                        <span>{draftPolygon.length}</span>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => commitActiveCrop(true)}
                          disabled={draftPolygon.length < 3}
                          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Check size={14} />
                          {t.polygonApply}
                        </button>
                        <button
                          onClick={resetAllCrop}
                          className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors"
                        >
                          {t.restoreCrop}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ENHANCE, SHARPEN, HD, LOCAL & AI WATERMARK REMOVAL */}
              {tab === 'enhance' && !item.isBlank && (
                <div className="space-y-5">
                  {/* SECTION A: LOCAL FAST ENGINE */}
                  <div className="space-y-4">
                    <div className="text-xs font-semibold text-slate-900">
                      {t.localEngineTitle}
                    </div>

                    {/* Active AI Layer Pause/Remove Banner */}
                    {item.aiEnhanced && (
                      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/60 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-blue-900">
                            {item.aiEnhanced.active ? t.aiLayerActive : t.aiLayerPaused}
                          </span>
                          <span className="font-mono-num text-[11px] text-blue-700">
                            {item.aiEnhanced.width}×{item.aiEnhanced.height}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              onUpdate(item.id, {
                                aiEnhanced: {
                                  ...item.aiEnhanced!,
                                  active: !item.aiEnhanced!.active,
                                },
                              })
                            }
                            className="flex-1 py-1.5 px-2 rounded-md border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 text-[11px] font-medium flex items-center justify-center gap-1"
                          >
                            {item.aiEnhanced.active ? <EyeOff size={12} /> : <Eye size={12} />}
                            {item.aiEnhanced.active ? t.aiLayerPaused : t.aiLayerActive}
                          </button>
                          <button
                            onClick={() => onUpdate(item.id, { aiEnhanced: null })}
                            className="py-1.5 px-2 rounded-md border border-red-200 bg-white hover:bg-red-50 text-red-600 text-[11px] font-medium flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                            {t.aiRemoveLayer}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Document Style Presets */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ['none', t.filterNone],
                          ['cleanDoc', t.filterCleanDoc],
                          ['bw', t.filterBwScan],
                          ['grayscale', t.filterGrayscale],
                          ['enhance', t.filterEnhance],
                        ] as Array<[ImageFilterType, string]>
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() =>
                            onUpdate(item.id, {
                              filter: val,
                              aiEnhanced: item.aiEnhanced
                                ? { ...item.aiEnhanced, active: false }
                                : null,
                            })
                          }
                          className={cn(
                            'py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors text-left truncate',
                            item.filter === val
                              ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-semibold'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Sharpen & Shadow Flattening */}
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{t.sharpen}</span>
                          <span className="font-mono-num text-slate-500">{item.sharpen ?? 0}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={item.sharpen ?? 0}
                          onChange={(e) =>
                            onUpdate(item.id, {
                              sharpen: Number(e.target.value),
                              aiEnhanced: item.aiEnhanced
                                ? { ...item.aiEnhanced, active: false }
                                : null,
                            })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{t.denoiseShadow}</span>
                          <span className="font-mono-num text-slate-500">
                            {item.denoiseShadow ?? 0}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={item.denoiseShadow ?? 0}
                          onChange={(e) =>
                            onUpdate(item.id, {
                              denoiseShadow: Number(e.target.value),
                              aiEnhanced: item.aiEnhanced
                                ? { ...item.aiEnhanced, active: false }
                                : null,
                            })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-slate-600">{t.brightness}</span>
                            <span className="font-mono-num text-slate-500">{item.brightness}%</span>
                          </div>
                          <input
                            type="range"
                            min={60}
                            max={150}
                            value={item.brightness}
                            onChange={(e) =>
                              onUpdate(item.id, {
                                brightness: Number(e.target.value),
                                aiEnhanced: item.aiEnhanced
                                  ? { ...item.aiEnhanced, active: false }
                                  : null,
                              })
                            }
                            className="w-full accent-blue-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-slate-600">{t.contrast}</span>
                            <span className="font-mono-num text-slate-500">{item.contrast}%</span>
                          </div>
                          <input
                            type="range"
                            min={60}
                            max={180}
                            value={item.contrast}
                            onChange={(e) =>
                              onUpdate(item.id, {
                                contrast: Number(e.target.value),
                                aiEnhanced: item.aiEnhanced
                                  ? { ...item.aiEnhanced, active: false }
                                  : null,
                              })
                            }
                            className="w-full accent-blue-600"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Local 2x HD Upscale Toggle */}
                    <label className="flex items-start justify-between gap-3 pt-3 border-t border-slate-100 cursor-pointer">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-slate-800 block">
                          {t.localUpscale}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {t.localUpscaleDesc}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(item.localUpscale)}
                        onChange={(e) =>
                          onUpdate(item.id, {
                            localUpscale: e.target.checked,
                            aiEnhanced: item.aiEnhanced
                              ? { ...item.aiEnhanced, active: false }
                              : null,
                          })
                        }
                        className="mt-0.5 h-4 w-4 accent-blue-600 rounded"
                      />
                    </label>

                    {/* Local Light Watermark Removal */}
                    <div className="space-y-2.5 pt-3 border-t border-slate-100">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="text-xs font-semibold text-slate-800">
                          {t.localWatermark}
                        </span>
                        <input
                          type="checkbox"
                          checked={wmSettings.enabled}
                          onChange={(e) =>
                            onUpdate(item.id, {
                              watermarkRemoval: {
                                ...wmSettings,
                                enabled: e.target.checked,
                              },
                              aiEnhanced: item.aiEnhanced
                                ? { ...item.aiEnhanced, active: false }
                                : null,
                            })
                          }
                          className="h-4 w-4 accent-blue-600 rounded"
                        />
                      </label>

                      {wmSettings.enabled && (
                        <div className="space-y-2.5 pl-1">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-600">{t.watermarkStrength}</span>
                              <span className="font-mono-num text-slate-500">
                                {wmSettings.strength}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              value={wmSettings.strength}
                              onChange={(e) =>
                                onUpdate(item.id, {
                                  watermarkRemoval: {
                                    ...wmSettings,
                                    strength: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full accent-blue-600"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={wmSettings.removeColorStamps}
                              onChange={(e) =>
                                onUpdate(item.id, {
                                  watermarkRemoval: {
                                    ...wmSettings,
                                    removeColorStamps: e.target.checked,
                                  },
                                })
                              }
                              className="h-3.5 w-3.5 accent-blue-600 rounded"
                            />
                            <span>{t.removeColorStamps}</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Manual Healing Eraser Brush */}
                    <div className="space-y-2.5 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCompareMode(false);
                            setBrushActive((v) => !v);
                          }}
                          className={cn(
                            'flex-1 py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                            brushActive
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                          )}
                        >
                          <Eraser size={13} />
                          {brushActive ? t.eraserBrushActive : t.eraserBrush}
                        </button>
                        {eraseStrokes.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdate(item.id, {
                                eraseStrokes: eraseStrokes.slice(0, -1),
                              })
                            }
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                            title={t.undoStroke}
                          >
                            <Undo2 size={13} />
                          </button>
                        )}
                      </div>

                      {brushActive && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-600">{t.brushSize}</span>
                            <span className="font-mono-num text-slate-500">
                              {Math.round(brushRadius * 1000)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.01}
                            max={0.08}
                            step={0.002}
                            value={brushRadius}
                            onChange={(e) => setBrushRadius(Number(e.target.value))}
                            className="w-full accent-blue-600"
                          />
                        </div>
                      )}

                      {eraseStrokes.length > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-mono-num">{eraseStrokes.length} strokes</span>
                          <button
                            type="button"
                            onClick={() => onUpdate(item.id, { eraseStrokes: [] })}
                            className="text-red-600 hover:underline font-medium"
                          >
                            {t.clearStrokes}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Sync to All / Reset Local */}
                    <div className="pt-3 border-t border-slate-100 grid grid-cols-1 gap-1.5">
                      <button
                        onClick={() =>
                          onApplyEnhanceToAll({
                            filter: item.filter,
                            brightness: item.brightness,
                            contrast: item.contrast,
                            sharpen: item.sharpen ?? 0,
                            denoiseShadow: item.denoiseShadow ?? 0,
                            localUpscale: Boolean(item.localUpscale),
                            watermarkRemoval: wmSettings,
                          })
                        }
                        className="w-full py-2 px-3 rounded-lg border border-blue-200 bg-blue-50/60 hover:bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Sparkles size={13} />
                        {t.applyFilterToAll}
                      </button>
                      <button
                        onClick={() =>
                          onUpdate(item.id, {
                            filter: 'none',
                            brightness: 100,
                            contrast: 100,
                            sharpen: 0,
                            denoiseShadow: 0,
                            localUpscale: false,
                            watermarkRemoval: {
                              enabled: false,
                              strength: 55,
                              removeColorStamps: false,
                            },
                            eraseStrokes: [],
                          })
                        }
                        className="w-full py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ResetIcon size={12} />
                        {t.reset}
                      </button>
                    </div>
                  </div>

                  {/* SECTION B: AI DEEP RESTORATION ENGINE (SERVER-SIDE GEMINI) */}
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                        <Sparkles size={13} className="text-blue-600" />
                        {t.aiEngineTitle}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {t.aiEngineNote}
                      </p>
                    </div>

                    {aiErrorBanner && (
                      <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-900 text-[11px] leading-relaxed flex items-start gap-2">
                        <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <span>{aiErrorBanner}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRunAi('watermark')}
                          disabled={Boolean(aiLoadingMode)}
                          className="py-2 px-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50 text-slate-800 text-xs font-medium transition-colors"
                        >
                          {t.aiWatermarkBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRunAi('hd')}
                          disabled={Boolean(aiLoadingMode)}
                          className="py-2 px-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50 text-slate-800 text-xs font-medium transition-colors"
                        >
                          {t.aiHdBtn}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRunAi('both')}
                        disabled={Boolean(aiLoadingMode)}
                        className="w-full py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Wand2 size={13} />
                        {t.aiBothBtn}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Unified WYSIWYG Canvas Preview Component powered by renderProcessedImageCanvas.
 * Ensures thumbnails, lightbox preview, and final PDF export match 100%.
 */
export function CroppedPreviewImage({
  item,
  fitMode,
  maxPreview = 520,
}: {
  item: ImageItem;
  cssFilter?: string;
  fitMode: ScaleType;
  maxPreview?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signature = getImageVisualSignature(item);

  useEffect(() => {
    if (item.isBlank || !item.url) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const rendered = await renderProcessedImageCanvas(item, {
          maxDim: maxPreview,
        });
        if (!alive || !canvasRef.current) return;
        const target = canvasRef.current;
        target.width = rendered.width;
        target.height = rendered.height;
        const ctx = target.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.drawImage(rendered, 0, 0);
      } catch (err) {
        console.error('Preview render error:', err);
      }
    }, 24);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [signature, maxPreview, item.isBlank]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        fitMode === 'fill'
          ? 'w-full h-full object-cover'
          : fitMode === 'original'
          ? 'max-w-none max-h-none'
          : 'max-w-full max-h-full object-contain'
      )}
    />
  );
}
