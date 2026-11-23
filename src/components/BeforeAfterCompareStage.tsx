import React, { useEffect, useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface BeforeAfterCompareStageProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  alt: string;
}

export function BeforeAfterCompareStage({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  alt,
}: BeforeAfterCompareStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState(50);
  const draggingRef = useRef(false);

  useEffect(() => {
    const updateFromClientX = (clientX: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return;
      const pct = Math.max(2, Math.min(98, ((clientX - box.left) / box.width) * 100));
      setSplitPct(pct);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      updateFromClientX(e.clientX);
    };
    const onPointerUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const box = containerRef.current?.getBoundingClientRect();
    if (box && box.width > 0) {
      const pct = Math.max(2, Math.min(98, ((e.clientX - box.left) / box.width) * 100));
      setSplitPct(pct);
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className="relative inline-block max-h-[62vh] max-w-[66vw] select-none touch-none shadow-md ring-1 ring-black/12 bg-white overflow-hidden cursor-ew-resize"
    >
      {/* After Image (Full base layer) */}
      <img
        src={afterUrl}
        alt={alt}
        draggable={false}
        className="block max-h-[62vh] max-w-[66vw] w-auto h-auto object-contain"
      />

      {/* Before Image (Clipped to left side of split) */}
      <img
        src={beforeUrl}
        alt={`${alt} before`}
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
      />

      {/* Labels */}
      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-slate-900/75 text-white text-[11px] font-medium pointer-events-none">
        {beforeLabel}
      </div>
      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-blue-600/90 text-white text-[11px] font-medium pointer-events-none">
        {afterLabel}
      </div>

      {/* Vertical Split Divider & Center Grabber */}
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(15,23,42,0.45)] pointer-events-none"
        style={{ left: `${splitPct}%` }}
      >
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-slate-700">
          <MoveHorizontal size={15} />
        </div>
      </div>
    </div>
  );
}
