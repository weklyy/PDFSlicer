import React, { useEffect, useRef, useState } from 'react';
import {
  PerspectiveQuad,
  Point2D,
  isConvexQuad,
  loadImageCached,
} from '../lib/imageProcessor';
import type { CropRect } from '../lib/pdfSplitter';
import { cn } from '../lib/utils';

type RectDragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface InteractiveCropStageProps {
  imageUrl: string;
  imageName: string;
  mode: 'rect' | 'perspective' | 'polygon';
  draftRect: CropRect;
  onChangeRect: (rect: CropRect) => void;
  draftQuad: PerspectiveQuad;
  onChangeQuad: (quad: PerspectiveQuad) => void;
  draftPolygon: Point2D[];
  polygonClosed: boolean;
  onChangePolygon: (pts: Point2D[], closed: boolean) => void;
  hintText: string;
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

export function InteractiveCropStage({
  imageUrl,
  imageName,
  mode,
  draftRect,
  onChangeRect,
  draftQuad,
  onChangeQuad,
  draftPolygon,
  polygonClosed,
  onChangePolygon,
  hintText,
}: InteractiveCropStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  const [imgDims, setImgDims] = useState<{ w: number; h: number }>({ w: 1000, h: 1000 });
  const [draggingQuadIdx, setDraggingQuadIdx] = useState<number | null>(null);
  const [draggingPolyIdx, setDraggingPolyIdx] = useState<number | null>(null);
  const [loupePoint, setLoupePoint] = useState<Point2D | null>(null);

  const rectDragRef = useRef<{
    mode: RectDragMode;
    startX: number;
    startY: number;
    startRect: CropRect;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    loadImageCached(imageUrl)
      .then((img) => {
        if (!alive) return;
        loadedImgRef.current = img;
        setImgDims({ w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [imageUrl]);

  // Draw 2.5x magnifier loupe whenever dragging a perspective or polygon vertex
  useEffect(() => {
    if (!loupePoint || !loupeCanvasRef.current || !loadedImgRef.current) return;
    const canvas = loupeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = loadedImgRef.current;
    if (!ctx) return;

    const size = 132;
    canvas.width = size;
    canvas.height = size;

    const zoom = 2.5;
    const srcSpan = Math.max(40, Math.min(img.naturalWidth, img.naturalHeight) * (0.28 / zoom));
    const cx = loupePoint.x * img.naturalWidth;
    const cy = loupePoint.y * img.naturalHeight;

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      img,
      cx - srcSpan / 2,
      cy - srcSpan / 2,
      srcSpan,
      srcSpan,
      0,
      0,
      size,
      size
    );

    // Crisp precision crosshair
    const mid = size / 2;
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mid - 16, mid);
    ctx.lineTo(mid - 4, mid);
    ctx.moveTo(mid + 4, mid);
    ctx.lineTo(mid + 16, mid);
    ctx.moveTo(mid, mid - 16);
    ctx.lineTo(mid, mid - 4);
    ctx.moveTo(mid, mid + 4);
    ctx.lineTo(mid, mid + 16);
    ctx.stroke();

    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.arc(mid, mid, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, [loupePoint]);

  // Global pointer listeners for rect, quad, and polygon dragging
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) return;

      if (rectDragRef.current) {
        const dx = (e.clientX - rectDragRef.current.startX) / box.width;
        const dy = (e.clientY - rectDragRef.current.startY) / box.height;
        const s = rectDragRef.current.startRect;
        const minSize = 0.06;
        let { x, y, w, h } = s;

        switch (rectDragRef.current.mode) {
          case 'move':
            x = clamp(s.x + dx, 0, 1 - w);
            y = clamp(s.y + dy, 0, 1 - h);
            break;
          case 'nw': {
            const nx = clamp(s.x + dx, 0, s.x + s.w - minSize);
            const ny = clamp(s.y + dy, 0, s.y + s.h - minSize);
            w = s.x + s.w - nx;
            h = s.y + s.h - ny;
            x = nx;
            y = ny;
            break;
          }
          case 'ne': {
            const ny = clamp(s.y + dy, 0, s.y + s.h - minSize);
            w = clamp(s.w + dx, minSize, 1 - s.x);
            h = s.y + s.h - ny;
            y = ny;
            break;
          }
          case 'sw': {
            const nx = clamp(s.x + dx, 0, s.x + s.w - minSize);
            w = s.x + s.w - nx;
            h = clamp(s.h + dy, minSize, 1 - s.y);
            x = nx;
            break;
          }
          case 'se':
            w = clamp(s.w + dx, minSize, 1 - s.x);
            h = clamp(s.h + dy, minSize, 1 - s.y);
            break;
          case 'n': {
            const ny = clamp(s.y + dy, 0, s.y + s.h - minSize);
            h = s.y + s.h - ny;
            y = ny;
            break;
          }
          case 's':
            h = clamp(s.h + dy, minSize, 1 - s.y);
            break;
          case 'w': {
            const nx = clamp(s.x + dx, 0, s.x + s.w - minSize);
            w = s.x + s.w - nx;
            x = nx;
            break;
          }
          case 'e':
            w = clamp(s.w + dx, minSize, 1 - s.x);
            break;
        }
        onChangeRect({ x, y, w, h });
        return;
      }

      if (draggingQuadIdx !== null) {
        const nx = clamp((e.clientX - box.left) / box.width, 0, 1);
        const ny = clamp((e.clientY - box.top) / box.height, 0, 1);
        const candidate: PerspectiveQuad = [
          { ...draftQuad[0] },
          { ...draftQuad[1] },
          { ...draftQuad[2] },
          { ...draftQuad[3] },
        ];
        candidate[draggingQuadIdx] = { x: nx, y: ny };
        if (isConvexQuad(candidate)) {
          onChangeQuad(candidate);
          setLoupePoint({ x: nx, y: ny });
        }
        return;
      }

      if (draggingPolyIdx !== null) {
        const nx = clamp((e.clientX - box.left) / box.width, 0, 1);
        const ny = clamp((e.clientY - box.top) / box.height, 0, 1);
        const next = draftPolygon.map((pt, idx) =>
          idx === draggingPolyIdx ? { x: nx, y: ny } : pt
        );
        onChangePolygon(next, polygonClosed);
        setLoupePoint({ x: nx, y: ny });
      }
    };

    const onPointerUp = () => {
      rectDragRef.current = null;
      setDraggingQuadIdx(null);
      setDraggingPolyIdx(null);
      setLoupePoint(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [
    draggingQuadIdx,
    draggingPolyIdx,
    draftQuad,
    draftPolygon,
    polygonClosed,
    onChangeRect,
    onChangeQuad,
    onChangePolygon,
  ]);

  const startRectDrag = (dragMode: RectDragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    rectDragRef.current = {
      mode: dragMode,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...draftRect },
    };
  };

  const handlePolygonStageClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== 'polygon' || polygonClosed || draggingPolyIdx !== null) return;
    const box = stageRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    const nx = clamp((e.clientX - box.left) / box.width, 0, 1);
    const ny = clamp((e.clientY - box.top) / box.height, 0, 1);

    // If clicking close to the first vertex with >= 3 points, close the shape
    if (draftPolygon.length >= 3) {
      const first = draftPolygon[0];
      const distPx = Math.hypot((nx - first.x) * box.width, (ny - first.y) * box.height);
      if (distPx < 16) {
        onChangePolygon(draftPolygon, true);
        return;
      }
    }

    onChangePolygon([...draftPolygon, { x: nx, y: ny }], false);
  };

  const insertPolygonMidpoint = (edgeIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = draftPolygon[edgeIndex];
    const b = draftPolygon[(edgeIndex + 1) % draftPolygon.length];
    const mid: Point2D = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const next = [...draftPolygon];
    next.splice(edgeIndex + 1, 0, mid);
    onChangePolygon(next, polygonClosed);
  };

  const removePolygonVertex = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draftPolygon.length <= 3 && polygonClosed) return;
    const next = draftPolygon.filter((_, i) => i !== idx);
    onChangePolygon(next, next.length >= 3 ? polygonClosed : false);
  };

  const quadSvgPath =
    `M 0 0 H 1000 V 1000 H 0 Z ` +
    `M ${draftQuad[0].x * 1000} ${draftQuad[0].y * 1000} ` +
    `L ${draftQuad[1].x * 1000} ${draftQuad[1].y * 1000} ` +
    `L ${draftQuad[2].x * 1000} ${draftQuad[2].y * 1000} ` +
    `L ${draftQuad[3].x * 1000} ${draftQuad[3].y * 1000} Z`;

  const polySvgMaskPath =
    polygonClosed && draftPolygon.length >= 3
      ? `M 0 0 H 1000 V 1000 H 0 Z ` +
        draftPolygon
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x * 1000} ${p.y * 1000}`)
          .join(' ') +
        ' Z'
      : '';

  const loupeOnRight = loupePoint ? loupePoint.x < 0.5 : true;
  const cornerLabels = ['TL', 'TR', 'BR', 'BL'];

  return (
    <div className="relative flex flex-col items-center justify-center max-h-full max-w-full gap-3">
      {/* 2.5x Precision Magnifier Loupe */}
      {loupePoint && (
        <div
          className={cn(
            'absolute top-2 z-30 rounded-xl border-2 border-blue-600 bg-slate-900 shadow-xl overflow-hidden pointer-events-none',
            loupeOnRight ? 'right-2' : 'left-2'
          )}
        >
          <canvas ref={loupeCanvasRef} className="block w-[132px] h-[132px]" />
          <div className="px-2 py-0.5 bg-slate-900/95 text-[10px] font-mono-num text-white flex items-center justify-between">
            <span>2.5×</span>
            <span>
              {Math.round(loupePoint.x * imgDims.w)}, {Math.round(loupePoint.y * imgDims.h)}
            </span>
          </div>
        </div>
      )}

      <div
        ref={stageRef}
        className="relative inline-block select-none touch-none shadow-lg ring-1 ring-black/15 bg-slate-900 overflow-hidden"
      >
        <img
          src={imageUrl}
          alt={imageName}
          draggable={false}
          className="block max-h-[62vh] max-w-[65vw] w-auto h-auto object-contain"
        />

        {/* Mode 1: Rectangular White-Border / Aspect Crop */}
        {mode === 'rect' && (
          <div
            onPointerDown={startRectDrag('move')}
            className="absolute border-2 border-blue-500 cursor-move"
            style={{
              left: `${draftRect.x * 100}%`,
              top: `${draftRect.y * 100}%`,
              width: `${draftRect.w * 100}%`,
              height: `${draftRect.h * 100}%`,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.52)',
            }}
          >
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
                onPointerDown={startRectDrag(dir)}
                className={cn(
                  'absolute w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-xs',
                  pos
                )}
              />
            ))}
            <div
              onPointerDown={startRectDrag('n')}
              className="absolute -top-1 left-1/2 -translate-x-1/2 w-7 h-2 bg-white border border-blue-600 rounded-xs cursor-ns-resize"
            />
            <div
              onPointerDown={startRectDrag('s')}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-7 h-2 bg-white border border-blue-600 rounded-xs cursor-ns-resize"
            />
            <div
              onPointerDown={startRectDrag('w')}
              className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-7 bg-white border border-blue-600 rounded-xs cursor-ew-resize"
            />
            <div
              onPointerDown={startRectDrag('e')}
              className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-7 bg-white border border-blue-600 rounded-xs cursor-ew-resize"
            />
          </div>
        )}

        {/* Mode 2: 4-Point Perspective Deskew Overlay */}
        {mode === 'perspective' && (
          <>
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <path d={quadSvgPath} fill="rgba(15, 23, 42, 0.54)" fillRule="evenodd" />
              <polygon
                points={draftQuad.map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ')}
                fill="none"
                stroke="#2563EB"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {/* Internal perspective helper grid */}
              {[0.333, 0.666].map((t) => {
                const topX = (draftQuad[0].x + (draftQuad[1].x - draftQuad[0].x) * t) * 1000;
                const topY = (draftQuad[0].y + (draftQuad[1].y - draftQuad[0].y) * t) * 1000;
                const botX = (draftQuad[3].x + (draftQuad[2].x - draftQuad[3].x) * t) * 1000;
                const botY = (draftQuad[3].y + (draftQuad[2].y - draftQuad[3].y) * t) * 1000;
                const leftX = (draftQuad[0].x + (draftQuad[3].x - draftQuad[0].x) * t) * 1000;
                const leftY = (draftQuad[0].y + (draftQuad[3].y - draftQuad[0].y) * t) * 1000;
                const rightX = (draftQuad[1].x + (draftQuad[2].x - draftQuad[1].x) * t) * 1000;
                const rightY = (draftQuad[1].y + (draftQuad[2].y - draftQuad[1].y) * t) * 1000;
                return (
                  <g key={t} stroke="rgba(255,255,255,0.4)" strokeWidth="1" vectorEffect="non-scaling-stroke">
                    <line x1={topX} y1={topY} x2={botX} y2={botY} />
                    <line x1={leftX} y1={leftY} x2={rightX} y2={rightY} />
                  </g>
                );
              })}
            </svg>

            {draftQuad.map((pt, idx) => (
              <button
                key={idx}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraggingQuadIdx(idx);
                  setLoupePoint(pt);
                }}
                style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-mono-num font-bold shadow-md transition-transform cursor-grab active:cursor-grabbing',
                  draggingQuadIdx === idx
                    ? 'bg-blue-600 border-white text-white scale-115'
                    : 'bg-white border-blue-600 text-blue-700 hover:scale-110'
                )}
                aria-label={`Corner ${cornerLabels[idx]}`}
              >
                {idx + 1}
              </button>
            ))}
          </>
        )}

        {/* Mode 3: Freeform Polygon Irregular Crop Overlay */}
        {mode === 'polygon' && (
          <>
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              onClick={handlePolygonStageClick}
              className={cn(
                'absolute inset-0 w-full h-full',
                !polygonClosed ? 'cursor-crosshair' : 'cursor-default'
              )}
            >
              {polySvgMaskPath && (
                <path d={polySvgMaskPath} fill="rgba(15, 23, 42, 0.56)" fillRule="evenodd" />
              )}
              {draftPolygon.length >= 2 && (
                <polyline
                  points={
                    draftPolygon.map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ') +
                    (polygonClosed
                      ? ` ${draftPolygon[0].x * 1000},${draftPolygon[0].y * 1000}`
                      : '')
                  }
                  fill={polygonClosed ? 'rgba(37, 99, 235, 0.08)' : 'none'}
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  strokeDasharray={polygonClosed ? undefined : '6 4'}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {/* Edge midpoint "+" insertion handles when polygon is closed */}
            {polygonClosed &&
              draftPolygon.length >= 3 &&
              draftPolygon.map((pt, idx) => {
                const nextPt = draftPolygon[(idx + 1) % draftPolygon.length];
                const mx = (pt.x + nextPt.x) / 2;
                const my = (pt.y + nextPt.y) / 2;
                return (
                  <button
                    key={`mid-${idx}`}
                    type="button"
                    onClick={(e) => insertPolygonMidpoint(idx, e)}
                    style={{ left: `${mx * 100}%`, top: `${my * 100}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/90 border border-blue-500 text-blue-600 hover:bg-blue-600 hover:text-white text-[10px] leading-none flex items-center justify-center shadow-xs transition-colors"
                    title="+"
                  >
                    +
                  </button>
                );
              })}

            {/* Draggable Polygon Vertices */}
            {draftPolygon.map((pt, idx) => {
              const isStartClosable = !polygonClosed && idx === 0 && draftPolygon.length >= 3;
              return (
                <button
                  key={`v-${idx}`}
                  type="button"
                  onPointerDown={(e) => {
                    if (e.button === 2) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (isStartClosable) {
                      onChangePolygon(draftPolygon, true);
                      return;
                    }
                    setDraggingPolyIdx(idx);
                    setLoupePoint(pt);
                  }}
                  onDoubleClick={(e) => removePolygonVertex(idx, e)}
                  onContextMenu={(e) => removePolygonVertex(idx, e)}
                  style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition-transform flex items-center justify-center',
                    isStartClosable
                      ? 'w-5 h-5 bg-emerald-500 border-white ring-2 ring-emerald-500/40 cursor-pointer'
                      : draggingPolyIdx === idx
                      ? 'w-5 h-5 bg-blue-600 border-white scale-115 cursor-grabbing'
                      : 'w-4 h-4 bg-white border-blue-600 hover:scale-120 cursor-grab'
                  )}
                />
              );
            })}
          </>
        )}
      </div>

      <p className="text-xs text-slate-500 text-center max-w-xl">{hintText}</p>
    </div>
  );
}
