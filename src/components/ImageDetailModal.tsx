import React, { useEffect, useRef, useState } from 'react';
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
import { cn } from '../lib/utils';

interface ImageDetailModalProps {
  items: ImageItem[];
  activeId: string;
  globalSettings: GlobalImagePdfSettings;
  onSelectId: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ImageItem>) => void;
  onApplyFilterToAll: (filter: ImageFilterType, brightness: number, contrast: number) => void;
  onClose: () => void;
  t: Dictionary;
}

type EditorTab = 'transform' | 'crop' | 'enhance';
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export function buildImageCssFilter(
  filter: ImageFilterType,
  brightness: number,
  contrast: number
): string {
  const parts: string[] = [];
  if (filter === 'grayscale') parts.push('grayscale(100%)');
  else if (filter === 'bw') parts.push('grayscale(100%)', 'contrast(185%)', 'brightness(112%)');
  else if (filter === 'enhance') parts.push('contrast(120%)', 'saturate(112%)', 'brightness(104%)');
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export function ImageDetailModal({
  items,
  activeId,
  globalSettings,
  onSelectId,
  onUpdate,
  onApplyFilterToAll,
  onClose,
  t,
}: ImageDetailModalProps) {
  const currentIndex = items.findIndex((i) => i.id === activeId);
  const item = items[currentIndex];
  const [tab, setTab] = useState<EditorTab>('transform');
  const [draftCrop, setDraftCrop] = useState<CropRect>(
    item?.crop || { x: 0, y: 0, w: 1, h: 1 }
  );
  const cropBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startRect: CropRect;
  } | null>(null);

  useEffect(() => {
    if (item) {
      setDraftCrop(item.crop || { x: 0, y: 0, w: 1, h: 1 });
    }
  }, [item?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onSelectId(items[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && currentIndex < items.length - 1) {
        onSelectId(items[currentIndex + 1].id);
      } else if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && item && !item.isBlank) {
        onUpdate(item.id, { rotation: (item.rotation + 90) % 360 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items, item, onClose, onSelectId, onUpdate]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current || !cropBoxRef.current) return;
      const bounds = cropBoxRef.current.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;

      const dx = (e.clientX - dragRef.current.startX) / bounds.width;
      const dy = (e.clientY - dragRef.current.startY) / bounds.height;
      const s = dragRef.current.startRect;
      const minSize = 0.08;
      let { x, y, w, h } = s;

      switch (dragRef.current.mode) {
        case 'move':
          x = Math.max(0, Math.min(1 - w, s.x + dx));
          y = Math.max(0, Math.min(1 - h, s.y + dy));
          break;
        case 'nw': {
          const nx = Math.max(0, Math.min(s.x + s.w - minSize, s.x + dx));
          const ny = Math.max(0, Math.min(s.y + s.h - minSize, s.y + dy));
          w = s.x + s.w - nx;
          h = s.y + s.h - ny;
          x = nx;
          y = ny;
          break;
        }
        case 'ne': {
          const ny = Math.max(0, Math.min(s.y + s.h - minSize, s.y + dy));
          w = Math.max(minSize, Math.min(1 - s.x, s.w + dx));
          h = s.y + s.h - ny;
          y = ny;
          break;
        }
        case 'sw': {
          const nx = Math.max(0, Math.min(s.x + s.w - minSize, s.x + dx));
          w = s.x + s.w - nx;
          h = Math.max(minSize, Math.min(1 - s.y, s.h + dy));
          x = nx;
          break;
        }
        case 'se':
          w = Math.max(minSize, Math.min(1 - s.x, s.w + dx));
          h = Math.max(minSize, Math.min(1 - s.y, s.h + dy));
          break;
        case 'n': {
          const ny = Math.max(0, Math.min(s.y + s.h - minSize, s.y + dy));
          h = s.y + s.h - ny;
          y = ny;
          break;
        }
        case 's':
          h = Math.max(minSize, Math.min(1 - s.y, s.h + dy));
          break;
        case 'w': {
          const nx = Math.max(0, Math.min(s.x + s.w - minSize, s.x + dx));
          w = s.x + s.w - nx;
          x = nx;
          break;
        }
        case 'e':
          w = Math.max(minSize, Math.min(1 - s.x, s.w + dx));
          break;
      }

      setDraftCrop({ x, y, w, h });
    };

    const onPointerUp = () => {
      if (dragRef.current && item) {
        dragRef.current = null;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [item]);

  if (!item) return null;

  const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...draftCrop },
    };
  };

  const applyAspectCrop = (ratio: number | null) => {
    if (!ratio || !item.naturalWidth || !item.naturalHeight) {
      setDraftCrop({ x: 0, y: 0, w: 1, h: 1 });
      onUpdate(item.id, { crop: null });
      return;
    }
    const imgRatio = item.naturalWidth / item.naturalHeight;
    let w = 1;
    let h = 1;
    if (imgRatio > ratio) {
      w = ratio / imgRatio;
    } else {
      h = imgRatio / ratio;
    }
    const rect: CropRect = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    setDraftCrop(rect);
    onUpdate(item.id, { crop: rect });
  };

  const commitCrop = () => {
    const isFull =
      draftCrop.x < 0.005 &&
      draftCrop.y < 0.005 &&
      draftCrop.w > 0.99 &&
      draftCrop.h > 0.99;
    onUpdate(item.id, { crop: isFull ? null : draftCrop });
  };

  const cssFilter = buildImageCssFilter(item.filter, item.brightness, item.contrast);
  const layout = resolveImagePageLayout(item, globalSettings);
  const { paperAspect, effOri, effScale, padXPct, padYPct } = layout;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-6xl h-[90vh] rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
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
                disabled={currentIndex <= 0}
                className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-35 transition-colors flex items-center gap-1 text-xs font-medium"
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
                disabled={currentIndex >= items.length - 1}
                className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-35 transition-colors flex items-center gap-1 text-xs font-medium"
                title={t.nextPage}
              >
                <span className="hidden sm:inline">{t.nextPage}</span>
                <ChevronRight size={15} />
              </button>
            </div>

            <button
              onClick={onClose}
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
          {/* Preview / Interactive Crop Stage */}
          <div className="flex-1 canvas-dot-bg flex items-center justify-center p-6 md:p-10 overflow-hidden relative min-h-[300px]">
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
              <div className="relative flex flex-col items-center justify-center max-h-full max-w-full gap-3">
                <div
                  ref={cropBoxRef}
                  className="relative inline-block select-none touch-none shadow-lg ring-1 ring-black/15 bg-slate-900"
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    draggable={false}
                    className="block max-h-[62vh] max-w-[65vw] w-auto h-auto object-contain"
                    style={{ filter: cssFilter }}
                  />
                  {/* Dimmed outside regions via box-shadow */}
                  <div
                    onPointerDown={startDrag('move')}
                    className="absolute border-2 border-blue-500 cursor-move"
                    style={{
                      left: `${draftCrop.x * 100}%`,
                      top: `${draftCrop.y * 100}%`,
                      width: `${draftCrop.w * 100}%`,
                      height: `${draftCrop.h * 100}%`,
                      boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
                    }}
                  >
                    {/* Rule of thirds grid */}
                    <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                      <div className="border-r border-b border-white/30" />
                      <div className="border-r border-b border-white/30" />
                      <div className="border-b border-white/30" />
                      <div className="border-r border-b border-white/30" />
                      <div className="border-r border-b border-white/30" />
                      <div className="border-b border-white/30" />
                      <div className="border-r border-white/30" />
                      <div className="border-r border-white/30" />
                      <div />
                    </div>
                    {/* Corner handles */}
                    {(
                      [
                        ['nw', '-top-1.5 -left-1.5 cursor-nwse-resize'],
                        ['ne', '-top-1.5 -right-1.5 cursor-nesw-resize'],
                        ['sw', '-bottom-1.5 -left-1.5 cursor-nesw-resize'],
                        ['se', '-bottom-1.5 -right-1.5 cursor-nwse-resize'],
                      ] as const
                    ).map(([dir, pos]) => (
                      <div
                        key={dir}
                        onPointerDown={startDrag(dir)}
                        className={cn(
                          'absolute w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-xs',
                          pos
                        )}
                      />
                    ))}
                    {/* Edge handles */}
                    <div
                      onPointerDown={startDrag('n')}
                      className="absolute -top-1 left-1/2 -translate-x-1/2 w-7 h-2 bg-white border border-blue-600 rounded-xs cursor-ns-resize"
                    />
                    <div
                      onPointerDown={startDrag('s')}
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-7 h-2 bg-white border border-blue-600 rounded-xs cursor-ns-resize"
                    />
                    <div
                      onPointerDown={startDrag('w')}
                      className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-7 bg-white border border-blue-600 rounded-xs cursor-ew-resize"
                    />
                    <div
                      onPointerDown={startDrag('e')}
                      className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-7 bg-white border border-blue-600 rounded-xs cursor-ew-resize"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">{t.cropHint}</p>
              </div>
            ) : (
              /* Paper-Framed Live Preview */
              <div
                className="bg-white shadow-md ring-1 ring-black/[0.09] relative overflow-hidden flex items-center justify-center"
                style={{
                  aspectRatio: `${paperAspect}`,
                  height: effOri === 'portrait' ? 'min(100%, 600px)' : 'auto',
                  width: effOri === 'landscape' ? 'min(100%, 660px)' : 'auto',
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
                    cssFilter={cssFilter}
                    fitMode={globalSettings.paperSize === 'auto' ? 'fit' : effScale}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Controls Sidebar */}
          <div className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
            {/* Sub-tabs */}
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
                      if (tab === 'crop' && key !== 'crop') commitCrop();
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

            <div className="p-5 space-y-6 flex-1">
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

                  {/* Per-page Orientation */}
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

                  {/* Per-page Scale Mode */}
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

                  {/* Per-page Margin */}
                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t.margins}
                    </label>
                    <select
                      value={item.margin}
                      onChange={(e) =>
                        onUpdate(item.id, { margin: e.target.value as 'global' | MarginPreset })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
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

              {tab === 'crop' && !item.isBlank && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t.tabCrop}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => applyAspectCrop(null)}
                        className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                      >
                        {t.cropReset}
                      </button>
                      <button
                        onClick={() => applyAspectCrop(210 / 297)}
                        className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                      >
                        A4 {t.oriPortrait}
                      </button>
                      <button
                        onClick={() => applyAspectCrop(297 / 210)}
                        className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                      >
                        A4 {t.oriLandscape}
                      </button>
                      <button
                        onClick={() => applyAspectCrop(1)}
                        className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                      >
                        1 : 1
                      </button>
                      <button
                        onClick={() => applyAspectCrop(4 / 3)}
                        className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                      >
                        4 : 3
                      </button>
                      <button
                        onClick={() => applyAspectCrop(16 / 9)}
                        className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                      >
                        16 : 9
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono-num text-slate-500">
                    <span>
                      {Math.round(draftCrop.w * item.naturalWidth)} ×{' '}
                      {Math.round(draftCrop.h * item.naturalHeight)} px
                    </span>
                    <span>
                      {Math.round(draftCrop.w * 100)}% × {Math.round(draftCrop.h * 100)}%
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      commitCrop();
                      setTab('transform');
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Check size={14} />
                    {t.apply}
                  </button>
                </div>
              )}

              {tab === 'enhance' && !item.isBlank && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      {t.tabEnhance}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['none', t.filterNone],
                          ['grayscale', t.filterGrayscale],
                          ['bw', t.filterBwScan],
                          ['enhance', t.filterEnhance],
                        ] as Array<[ImageFilterType, string]>
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => onUpdate(item.id, { filter: val })}
                          className={cn(
                            'py-2 px-3 rounded-lg border text-xs font-medium transition-colors text-left',
                            item.filter === val
                              ? 'border-blue-600 bg-blue-50/70 text-blue-700'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Brightness */}
                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{t.brightness}</span>
                      <span className="font-mono-num text-slate-500">{item.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={150}
                      value={item.brightness}
                      onChange={(e) => onUpdate(item.id, { brightness: Number(e.target.value) })}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{t.contrast}</span>
                      <span className="font-mono-num text-slate-500">{item.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={180}
                      value={item.contrast}
                      onChange={(e) => onUpdate(item.id, { contrast: Number(e.target.value) })}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <button
                      onClick={() =>
                        onApplyFilterToAll(item.filter, item.brightness, item.contrast)
                      }
                      className="w-full py-2 px-3 rounded-lg border border-blue-200 bg-blue-50/60 hover:bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Sparkles size={13} />
                      {t.applyFilterToAll}
                    </button>
                    <button
                      onClick={() =>
                        onUpdate(item.id, { filter: 'none', brightness: 100, contrast: 100 })
                      }
                      className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ResetIcon size={13} />
                      {t.reset}
                    </button>
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
 * Helper component that renders an ImageItem accurately with crop, rotation, flip, and filter.
 */
export function CroppedPreviewImage({
  item,
  cssFilter,
  fitMode,
}: {
  item: ImageItem;
  cssFilter: string;
  fitMode: ScaleType;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (item.isBlank || !item.url) return;
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const sx = item.crop ? item.crop.x * img.naturalWidth : 0;
      const sy = item.crop ? item.crop.y * img.naturalHeight : 0;
      const sw = item.crop ? Math.max(1, item.crop.w * img.naturalWidth) : img.naturalWidth;
      const sh = item.crop ? Math.max(1, item.crop.h * img.naturalHeight) : img.naturalHeight;

      const maxPreview = 900;
      const scale = Math.min(1, maxPreview / Math.max(sw, sh));
      const drawW = Math.max(1, Math.round(sw * scale));
      const drawH = Math.max(1, Math.round(sh * scale));

      const rot = ((item.rotation % 360) + 360) % 360;
      const swap = rot === 90 || rot === 270;
      canvas.width = swap ? drawH : drawW;
      canvas.height = swap ? drawW : drawH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
      ctx.drawImage(img, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    };
    img.src = item.url;
    return () => {
      active = false;
    };
  }, [item.url, item.crop, item.rotation, item.flipH, item.flipV, item.isBlank]);

  return (
    <canvas
      ref={canvasRef}
      style={{ filter: cssFilter }}
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
