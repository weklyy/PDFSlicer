import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Plus,
  FilePlus2,
  ArrowUpDown,
  RotateCcw,
  RotateCw,
  Trash2,
  Copy,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Download,
  Eye,
  Loader2,
  Undo2,
  Redo2,
  Search,
  LayoutGrid,
  Grid2x2,
  Grid3x3,
  List,
  ArrowUpToLine,
  ArrowDownToLine,
  CornerDownRight,
  ImagePlus,
  Crop as CropIcon,
  Sparkles,
  Check,
  X,
  Wand2,
  ChevronDown,
  RotateCcw as RestoreIcon,
} from 'lucide-react';
import { Dictionary } from '../lib/i18n';
import {
  GlobalImagePdfSettings,
  ImageFilterType,
  ImageItem,
  MarginPreset,
  OrientationKey,
  PageNumberPosition,
  PaperSizeKey,
  QualityPreset,
  ScaleType,
  formatBytes,
  imagesToPdfAdvanced,
  resolveImagePageLayout,
} from '../lib/pdfSplitter';
import {
  AiEnhanceMode,
  detectWhiteBorders,
  hasAdvancedPixelEdits,
} from '../lib/imageProcessor';
import { AiEnhanceClientError, requestAiEnhancement } from '../lib/aiEnhanceClient';
import { cn } from '../lib/utils';
import {
  ImageDetailModal,
  CroppedPreviewImage,
  EditorTab,
  LocalEnhanceSyncPayload,
} from './ImageDetailModal';
import { PdfResultModal } from './PdfResultModal';

interface ImageToPdfWorkspaceProps {
  t: Dictionary;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type ViewDensity = 'compact' | 'standard' | 'large' | 'list';
type SortKey = 'nameAsc' | 'nameDesc' | 'timeAsc' | 'timeDesc' | 'sizeDesc' | 'reverse';

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readImageDimensions(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1000, h: 1000 });
    img.src = url;
  });
}

export function ImageToPdfWorkspace({ t, onNotify }: ImageToPdfWorkspaceProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [past, setPast] = useState<ImageItem[][]>([]);
  const [future, setFuture] = useState<ImageItem[][]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);

  const [viewDensity, setViewDensity] = useState<ViewDensity>('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const [movePopoverOpen, setMovePopoverOpen] = useState(false);
  const [moveTargetInput, setMoveTargetInput] = useState('1');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTab, setEditingTab] = useState<EditorTab>('transform');

  // Auto white-border trim on upload (default ON per user preference)
  const [autoTrimOnUpload, setAutoTrimOnUpload] = useState(true);
  const [isAutoTrimming, setIsAutoTrimming] = useState(false);

  // Batch dropdown menus & batch AI progress
  const [batchEnhanceOpen, setBatchEnhanceOpen] = useState(false);
  const [batchAiOpen, setBatchAiOpen] = useState(false);
  const [batchAiProgress, setBatchAiProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const batchAiAbortRef = useRef<AbortController | null>(null);

  const [settings, setSettings] = useState<GlobalImagePdfSettings>({
    paperSize: 'a4',
    orientation: 'auto',
    margin: 'none',
    scaleType: 'fit',
    quality: 'high',
    pageNumbers: 'none',
  });
  const [filename, setFilename] = useState('images_bundle.pdf');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  // Drag & Drop internal reordering state
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(
    null
  );

  const addInputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const batchEnhanceRef = useRef<HTMLDivElement>(null);
  const batchAiRef = useRef<HTMLDivElement>(null);

  // Close dropdown menus on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
      if (batchEnhanceRef.current && !batchEnhanceRef.current.contains(e.target as Node)) {
        setBatchEnhanceOpen(false);
      }
      if (batchAiRef.current && !batchAiRef.current.contains(e.target as Node)) {
        setBatchAiOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Invalidate previous output when images or settings change
  const clearResult = useCallback(() => {
    setResultBlob(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const commitImages = useCallback(
    (updater: (prev: ImageItem[]) => ImageItem[]) => {
      setImages((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        setPast((p) => [...p.slice(-24), prev]);
        setFuture([]);
        return next;
      });
      clearResult();
    },
    [clearResult]
  );

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setImages((curr) => {
        setFuture((f) => [curr, ...f.slice(0, 24)]);
        return previous;
      });
      clearResult();
      return p.slice(0, -1);
    });
  }, [clearResult]);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setImages((curr) => {
        setPast((p) => [...p.slice(-24), curr]);
        return next;
      });
      clearResult();
      return f.slice(1);
    });
  }, [clearResult]);

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      const validFiles = files.filter((f) => f.type.startsWith('image/'));
      if (validFiles.length === 0) return;

      let trimmedCount = 0;
      const created: ImageItem[] = await Promise.all(
        validFiles.map(async (file) => {
          const url = URL.createObjectURL(file);
          const dims = await readImageDimensions(url);
          let detectedCrop = null;
          if (autoTrimOnUpload) {
            try {
              detectedCrop = await detectWhiteBorders(url, { sensitivity: 55, paddingPct: 2 });
              if (detectedCrop) trimmedCount++;
            } catch {
              detectedCrop = null;
            }
          }
          return {
            id: uid(),
            file,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified || Date.now(),
            url,
            naturalWidth: dims.w,
            naturalHeight: dims.h,
            rotation: 0,
            flipH: false,
            flipV: false,
            scaleType: 'global',
            orientation: 'global',
            margin: 'global',
            filter: 'none',
            brightness: 100,
            contrast: 100,
            crop: detectedCrop,
            cropMode: detectedCrop ? 'rect' : 'none',
            autoTrimApplied: Boolean(detectedCrop),
            autoTrimSensitivity: 55,
            autoTrimPadding: 2,
            sharpen: 0,
            denoiseShadow: 0,
            localUpscale: false,
            watermarkRemoval: { enabled: false, strength: 55, removeColorStamps: false },
            eraseStrokes: [],
            aiEnhanced: null,
          };
        })
      );

      commitImages((prev) => [...prev, ...created]);
      if (autoTrimOnUpload && trimmedCount > 0) {
        onNotify('success', t.autoTrimResultToast.replace('{n}', String(trimmedCount)));
      }
    },
    [commitImages, autoTrimOnUpload, onNotify, t.autoTrimResultToast]
  );

  const handleInsertBlank = () => {
    const blank: ImageItem = {
      id: uid(),
      file: null,
      isBlank: true,
      name: t.blankPage,
      size: 0,
      lastModified: Date.now(),
      url: '',
      naturalWidth: 595,
      naturalHeight: 842,
      rotation: 0,
      flipH: false,
      flipV: false,
      scaleType: 'global',
      orientation: 'global',
      margin: 'global',
      filter: 'none',
      brightness: 100,
      contrast: 100,
      crop: null,
    };
    commitImages((prev) => [...prev, blank]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => handleAddFiles(acceptedFiles),
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'] },
    multiple: true,
    noClick: images.length > 0,
    noKeyboard: true,
    onDragEnter: undefined,
    onDragOver: undefined,
    onDragLeave: undefined,
  });

  // Filtered images for display
  const visibleImages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return images;
    return images.filter((img) => img.name.toLowerCase().includes(q));
  }, [images, searchQuery]);

  // Selection logic
  const handleCardSelect = (id: string, e: React.MouseEvent, forceToggle = false) => {
    const isShift = e.shiftKey;
    const isMeta = e.metaKey || e.ctrlKey || forceToggle;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isShift && lastSelectedIdRef.current) {
        const list = visibleImages.map((i) => i.id);
        const startIdx = list.indexOf(lastSelectedIdRef.current);
        const endIdx = list.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [min, max] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = min; i <= max; i++) next.add(list[i]);
          return next;
        }
      }

      if (isMeta) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) {
          next.clear();
        } else {
          next.clear();
          next.add(id);
        }
      }
      return next;
    });
    lastSelectedIdRef.current = id;
  };

  const selectAll = () => setSelectedIds(new Set(visibleImages.map((i) => i.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const invertSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const img of visibleImages) {
        if (!prev.has(img.id)) next.add(img.id);
      }
      return next;
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingId || showResultModal) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && images.length > 0) {
        e.preventDefault();
        selectAll();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        handleBatchDelete();
      } else if (e.key === 'Escape' && selectedIds.size > 0) {
        deselectAll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Update helpers
  const updateImage = useCallback(
    (id: string, updates: Partial<ImageItem>) => {
      commitImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updates } : img)));
    },
    [commitImages]
  );

  const updateSelectedImages = (updates: Partial<ImageItem>) => {
    if (selectedIds.size === 0) return;
    commitImages((prev) =>
      prev.map((img) => (selectedIds.has(img.id) ? { ...img, ...updates } : img))
    );
  };

  const handleBatchRotate = (delta: number) => {
    if (selectedIds.size === 0) return;
    commitImages((prev) =>
      prev.map((img) =>
        selectedIds.has(img.id) && !img.isBlank
          ? { ...img, rotation: (img.rotation + delta + 360) % 360 }
          : img
      )
    );
  };

  const handleBatchDuplicate = () => {
    if (selectedIds.size === 0) return;
    commitImages((prev) => {
      const next: ImageItem[] = [];
      for (const img of prev) {
        next.push(img);
        if (selectedIds.has(img.id)) {
          next.push({ ...img, id: uid() });
        }
      }
      return next;
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    commitImages((prev) => prev.filter((img) => !selectedIds.has(img.id)));
    setSelectedIds(new Set());
  };

  const handleRemoveSingle = (id: string) => {
    commitImages((prev) => prev.filter((img) => img.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleMoveSelectedToIndex = (targetOneBased: number) => {
    if (selectedIds.size === 0) return;
    commitImages((prev) => {
      const moving = prev.filter((i) => selectedIds.has(i.id));
      const staying = prev.filter((i) => !selectedIds.has(i.id));
      const clampedIdx = Math.max(0, Math.min(staying.length, targetOneBased - 1));
      const next = [...staying];
      next.splice(clampedIdx, 0, ...moving);
      return next;
    });
    setMovePopoverOpen(false);
  };

  const handleSort = (key: SortKey) => {
    commitImages((prev) => {
      const copy = [...prev];
      switch (key) {
        case 'nameAsc':
          copy.sort((a, b) => naturalCollator.compare(a.name, b.name));
          break;
        case 'nameDesc':
          copy.sort((a, b) => naturalCollator.compare(b.name, a.name));
          break;
        case 'timeAsc':
          copy.sort((a, b) => a.lastModified - b.lastModified);
          break;
        case 'timeDesc':
          copy.sort((a, b) => b.lastModified - a.lastModified);
          break;
        case 'sizeDesc':
          copy.sort((a, b) => b.size - a.size);
          break;
        case 'reverse':
          copy.reverse();
          break;
      }
      return copy;
    });
    setSortOpen(false);
  };

  const handleApplyEnhanceToAll = (payload: LocalEnhanceSyncPayload) => {
    commitImages((prev) =>
      prev.map((img) =>
        img.isBlank
          ? img
          : {
              ...img,
              filter: payload.filter,
              brightness: payload.brightness,
              contrast: payload.contrast,
              sharpen: payload.sharpen,
              denoiseShadow: payload.denoiseShadow,
              localUpscale: payload.localUpscale,
              watermarkRemoval: { ...payload.watermarkRemoval },
              aiEnhanced: img.aiEnhanced ? { ...img.aiEnhanced, active: false } : null,
            }
      )
    );
    onNotify('success', t.filterAppliedAll);
  };

  const runBatchAutoTrim = async (targetIds: Set<string> | null) => {
    const candidates = images.filter(
      (img) => !img.isBlank && (targetIds === null || targetIds.has(img.id))
    );
    if (candidates.length === 0) return;

    setIsAutoTrimming(true);
    try {
      const updates = new Map<string, ImageItem['crop']>();
      await Promise.all(
        candidates.map(async (img) => {
          try {
            const rect = await detectWhiteBorders(img.url, {
              sensitivity: img.autoTrimSensitivity ?? 55,
              paddingPct: img.autoTrimPadding ?? 2,
            });
            if (rect) updates.set(img.id, rect);
          } catch {
            // skip individual failure
          }
        })
      );

      if (updates.size === 0) {
        onNotify('info', t.autoTrimNoneFound);
        return;
      }

      commitImages((prev) =>
        prev.map((img) => {
          const rect = updates.get(img.id);
          if (!rect) return img;
          return {
            ...img,
            cropMode: 'rect',
            crop: rect,
            autoTrimApplied: true,
            aiEnhanced: img.aiEnhanced ? { ...img.aiEnhanced, active: false } : null,
          };
        })
      );
      onNotify('success', t.autoTrimResultToast.replace('{n}', String(updates.size)));
    } finally {
      setIsAutoTrimming(false);
    }
  };

  const handleBatchRestoreCrop = () => {
    if (selectedIds.size === 0) return;
    commitImages((prev) =>
      prev.map((img) =>
        selectedIds.has(img.id)
          ? {
              ...img,
              cropMode: 'none',
              crop: null,
              autoTrimApplied: false,
              perspectiveQuad: null,
              polygon: null,
            }
          : img
      )
    );
  };

  const handleBatchEnhancePreset = (
    preset: 'cleanDoc' | 'bw' | 'watermark' | 'hd' | 'reset'
  ) => {
    if (selectedIds.size === 0) return;
    setBatchEnhanceOpen(false);
    commitImages((prev) =>
      prev.map((img) => {
        if (!selectedIds.has(img.id) || img.isBlank) return img;
        const pausedAi = img.aiEnhanced ? { ...img.aiEnhanced, active: false } : null;
        if (preset === 'cleanDoc') {
          return { ...img, filter: 'cleanDoc', sharpen: 45, denoiseShadow: 65, aiEnhanced: pausedAi };
        }
        if (preset === 'bw') {
          return { ...img, filter: 'bw', sharpen: 35, denoiseShadow: 70, aiEnhanced: pausedAi };
        }
        if (preset === 'watermark') {
          return {
            ...img,
            watermarkRemoval: { enabled: true, strength: 62, removeColorStamps: false },
            aiEnhanced: pausedAi,
          };
        }
        if (preset === 'hd') {
          return { ...img, localUpscale: true, sharpen: Math.max(img.sharpen ?? 0, 32), aiEnhanced: pausedAi };
        }
        return {
          ...img,
          filter: 'none',
          brightness: 100,
          contrast: 100,
          sharpen: 0,
          denoiseShadow: 0,
          localUpscale: false,
          watermarkRemoval: { enabled: false, strength: 55, removeColorStamps: false },
          eraseStrokes: [],
          aiEnhanced: null,
        };
      })
    );
    onNotify('success', t.batchEnhancedToast);
  };

  const handleBatchAiRestore = async (mode: AiEnhanceMode) => {
    setBatchAiOpen(false);
    const targets = images.filter((img) => selectedIds.has(img.id) && !img.isBlank);
    if (targets.length === 0) return;

    const controller = new AbortController();
    batchAiAbortRef.current = controller;
    setBatchAiProgress({ current: 0, total: targets.length });

    let succeeded = 0;
    for (let i = 0; i < targets.length; i++) {
      if (controller.signal.aborted) break;
      setBatchAiProgress({ current: i + 1, total: targets.length });
      const target = targets[i];
      try {
        const aiRes = await requestAiEnhancement(target, mode, controller.signal);
        updateImage(target.id, { aiEnhanced: aiRes });
        succeeded++;
      } catch (err: unknown) {
        const e = err as AiEnhanceClientError;
        if (e.errorCode === 'ABORTED') break;
        if (e.errorCode === 'API_KEY_MISSING') {
          onNotify('error', t.aiKeyMissingTip);
          break;
        }
        if (e.errorCode === 'API_KEY_INVALID') {
          onNotify('error', t.aiKeyInvalidTip);
          break;
        }
        if (e.errorCode === 'QUOTA_EXCEEDED') {
          onNotify('error', t.aiQuotaTip);
          break;
        }
        onNotify('error', e.message || t.processError);
      }
    }

    setBatchAiProgress(null);
    batchAiAbortRef.current = null;
    if (succeeded > 0) {
      onNotify('success', `${t.tagAi} (${succeeded}/${targets.length})`);
    }
  };

  const openEditor = (id: string, tab: EditorTab = 'transform') => {
    setEditingTab(tab);
    setEditingId(id);
  };

  // 2D Multi-Select Drag & Drop Reorder
  const handleItemDragStart = (id: string, e: React.DragEvent) => {
    // If dragging an item inside current selection, move all selected items together
    const idsToMove = selectedIds.has(id) ? images.filter((i) => selectedIds.has(i.id)).map((i) => i.id) : [id];
    setDraggingIds(idsToMove);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-pdf-studio-items', JSON.stringify(idsToMove));
  };

  const handleItemDragOver = (targetId: string, e: React.DragEvent) => {
    if (draggingIds.length === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingIds.includes(targetId)) {
      setDropTarget(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isList = viewDensity === 'list';
    const ratio = isList
      ? (e.clientY - rect.top) / rect.height
      : (e.clientX - rect.left) / rect.width;
    setDropTarget({ id: targetId, side: ratio < 0.5 ? 'before' : 'after' });
  };

  const handleItemDrop = (targetId: string, e: React.DragEvent) => {
    if (draggingIds.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (!draggingIds.includes(targetId) && dropTarget) {
      commitImages((prev) => {
        const dragSet = new Set(draggingIds);
        const moving = prev.filter((i) => dragSet.has(i.id));
        const staying = prev.filter((i) => !dragSet.has(i.id));
        const targetIdx = staying.findIndex((i) => i.id === targetId);
        if (targetIdx === -1) return prev;
        const insertIdx = dropTarget.side === 'after' ? targetIdx + 1 : targetIdx;
        const next = [...staying];
        next.splice(insertIdx, 0, ...moving);
        return next;
      });
    }
    setDraggingIds([]);
    setDropTarget(null);
  };

  const handleItemDragEnd = () => {
    setDraggingIds([]);
    setDropTarget(null);
  };

  // Generate PDF
  const handleGenerate = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: images.length });
    try {
      const blob = await imagesToPdfAdvanced(images, settings, (current, total) => {
        setProgress({ current, total });
      });
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
      setProgress(null);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const safeName = filename.trim().endsWith('.pdf')
      ? filename.trim()
      : `${filename.trim() || 'images_bundle'}.pdf`;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalSizeBytes = useMemo(() => images.reduce((acc, i) => acc + i.size, 0), [images]);

  const gridStyle = useMemo<React.CSSProperties>(() => {
    const minW = viewDensity === 'compact' ? 168 : viewDensity === 'large' ? 300 : 220;
    return {
      gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))`,
    };
  }, [viewDensity]);

  const wellAspect = useMemo(() => {
    if (visibleImages.length === 0) return 0.76;
    if (settings.paperSize !== 'auto' && settings.orientation === 'landscape') return 1.28;
    if (settings.paperSize !== 'auto' && settings.orientation === 'portrait') return 0.75;
    let landscapeCount = 0;
    for (const img of visibleImages) {
      const l = resolveImagePageLayout(img, settings);
      if (l.paperAspect > 1.05) landscapeCount++;
    }
    return landscapeCount > visibleImages.length / 2 ? 1.28 : 0.76;
  }, [visibleImages, settings]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
      {/* Hidden input for manual add */}
      <input
        ref={addInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleAddFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      {/* Main Stage (Left / Center) */}
      <div
        {...getRootProps()}
        className="flex-1 flex flex-col min-w-0 min-h-0 relative bg-[#F4F5F7] outline-none"
      >
        <input {...getInputProps()} />

        {/* Full-stage external file drop overlay */}
        {isDragActive && draggingIds.length === 0 && images.length > 0 && (
          <div className="absolute inset-3 z-40 rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/90 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none">
            <ImagePlus size={36} className="text-blue-600" />
            <p className="text-sm font-semibold text-blue-900">{t.dropToAppend}</p>
          </div>
        )}

        {/* Contextual Workbench Toolbar */}
        <div className="min-h-12 px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => addInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus size={14} />
              {images.length > 0 ? t.addMore : t.addImages}
            </button>

            <button
              onClick={handleInsertBlank}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <FilePlus2 size={14} className="text-slate-500" />
              <span className="hidden sm:inline">{t.insertBlankPage}</span>
            </button>

            {/* Upload Auto-Trim White Borders Switch (default ON) */}
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-100/70 text-xs font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap shrink-0 transition-colors">
              <input
                type="checkbox"
                checked={autoTrimOnUpload}
                onChange={(e) => setAutoTrimOnUpload(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600 rounded"
              />
              <span>{t.autoTrimOnUpload}</span>
            </label>

            {images.length > 0 && (
              <>
                <button
                  onClick={() => runBatchAutoTrim(null)}
                  disabled={isAutoTrimming}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  {isAutoTrimming ? (
                    <Loader2 size={13} className="animate-spin text-blue-600" />
                  ) : (
                    <CropIcon size={13} className="text-blue-600" />
                  )}
                  <span>{t.autoTrimAll}</span>
                </button>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                {/* Sort Dropdown */}
                <div className="relative" ref={sortRef}>
                  <button
                    onClick={() => setSortOpen((o) => !o)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    <ArrowUpDown size={13} className="text-slate-500" />
                    {t.sort}
                  </button>
                  {sortOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-30">
                      {(
                        [
                          ['nameAsc', t.sortNameAsc],
                          ['nameDesc', t.sortNameDesc],
                          ['timeAsc', t.sortTimeAsc],
                          ['timeDesc', t.sortTimeDesc],
                          ['sizeDesc', t.sortSizeDesc],
                          ['reverse', t.sortReverse],
                        ] as Array<[SortKey, string]>
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => handleSort(key)}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Select All / Invert */}
                <button
                  onClick={selectedIds.size === visibleImages.length && visibleImages.length > 0 ? deselectAll : selectAll}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  {selectedIds.size === visibleImages.length && visibleImages.length > 0 ? (
                    <CheckSquare size={13} className="text-blue-600" />
                  ) : (
                    <Square size={13} className="text-slate-400" />
                  )}
                  {selectedIds.size === visibleImages.length && visibleImages.length > 0
                    ? t.deselectAll
                    : t.selectAll}
                </button>

                {/* Undo / Redo */}
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={handleUndo}
                    disabled={past.length === 0}
                    className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                    title={`${t.undo} (Ctrl+Z)`}
                  >
                    <Undo2 size={14} />
                  </button>
                  <div className="w-px h-4 bg-slate-200" />
                  <button
                    onClick={handleRedo}
                    disabled={future.length === 0}
                    className="p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                    title={`${t.redo} (Ctrl+Shift+Z)`}
                  >
                    <Redo2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right side of toolbar: Search + Density Switcher + Clear */}
          {images.length > 0 && (
            <div className="flex items-center gap-2">
              {images.length >= 6 && (
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchFiles}
                    className="pl-7 pr-7 py-1.5 w-36 sm:w-44 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* Grid Density Switcher */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
                {(
                  [
                    ['compact', Grid3x3, t.viewCompact],
                    ['standard', LayoutGrid, t.viewStandard],
                    ['large', Grid2x2, t.viewLarge],
                    ['list', List, t.viewList],
                  ] as const
                ).map(([modeKey, Icon, label]) => (
                  <button
                    key={modeKey}
                    onClick={() => setViewDensity(modeKey)}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      viewDensity === modeKey
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                    title={label}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  commitImages(() => []);
                  setSelectedIds(new Set());
                }}
                className="px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors whitespace-nowrap"
              >
                {t.clearAll}
              </button>
            </div>
          )}
        </div>

        {/* Batch AI Progress Strip */}
        {batchAiProgress && (
          <div className="px-4 py-2 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Loader2 size={14} className="animate-spin text-blue-400" />
              <span className="font-mono-num">
                {t.batchAiProgress
                  .replace('{cur}', String(batchAiProgress.current))
                  .replace('{total}', String(batchAiProgress.total))}
              </span>
            </div>
            <button
              onClick={() => batchAiAbortRef.current?.abort()}
              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors"
            >
              {t.batchAiStop}
            </button>
          </div>
        )}

        {/* Batch Operations Bar (visible whenever >= 1 item selected) */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2 bg-blue-50/90 border-b border-blue-200/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-blue-900 font-mono-num">
                {t.itemsSelected.replace('{n}', String(selectedIds.size))}
              </span>
              <button
                onClick={invertSelection}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                {t.invertSelection}
              </button>
              <button
                onClick={deselectAll}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                {t.deselectAll}
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Batch Auto-Trim & Restore Crop */}
              <button
                onClick={() => runBatchAutoTrim(selectedIds)}
                disabled={isAutoTrimming}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-blue-700 text-xs font-medium transition-colors whitespace-nowrap"
              >
                <CropIcon size={13} className="text-blue-600" />
                <span>{t.autoTrimSelected}</span>
              </button>
              <button
                onClick={handleBatchRestoreCrop}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200/80 text-slate-600 hover:text-slate-900 text-xs font-medium transition-colors whitespace-nowrap"
                title={t.restoreCrop}
              >
                <RestoreIcon size={12} />
                <span className="hidden xl:inline">{t.restoreCrop}</span>
              </button>

              {/* Batch Local Enhance Dropdown */}
              <div className="relative" ref={batchEnhanceRef}>
                <button
                  onClick={() => setBatchEnhanceOpen((o) => !o)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-blue-700 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <Sparkles size={13} className="text-blue-600" />
                  <span>{t.batchEnhance}</span>
                  <ChevronDown size={12} className="text-slate-400" />
                </button>
                {batchEnhanceOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-30">
                    {(
                      [
                        ['cleanDoc', t.batchCleanDoc],
                        ['bw', t.batchBwScan],
                        ['watermark', t.batchLocalWatermark],
                        ['hd', t.batchLocalHd],
                        ['reset', t.batchResetEnhance],
                      ] as const
                    ).map(([presetKey, label]) => (
                      <button
                        key={presetKey}
                        onClick={() => handleBatchEnhancePreset(presetKey)}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Batch AI Restoration Dropdown */}
              <div className="relative" ref={batchAiRef}>
                <button
                  onClick={() => setBatchAiOpen((o) => !o)}
                  disabled={Boolean(batchAiProgress)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <Wand2 size={12} />
                  <span>{t.batchAiAction}</span>
                  <ChevronDown size={12} className="text-slate-300" />
                </button>
                {batchAiOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-30">
                    {(
                      [
                        ['watermark', t.aiWatermarkBtn],
                        ['hd', t.aiHdBtn],
                        ['both', t.aiBothBtn],
                      ] as Array<[AiEnhanceMode, string]>
                    ).map(([aiMode, label]) => (
                      <button
                        key={aiMode}
                        onClick={() => handleBatchAiRestore(aiMode)}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-px h-4 bg-blue-200 mx-0.5" />

              <button
                onClick={() => handleBatchRotate(-90)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-slate-900 text-xs font-medium transition-colors"
                title={t.rotateLeft}
              >
                <RotateCcw size={13} />
              </button>
              <button
                onClick={() => handleBatchRotate(90)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-slate-900 text-xs font-medium transition-colors"
                title={t.rotateRight}
              >
                <RotateCw size={13} />
              </button>
              <button
                onClick={handleBatchDuplicate}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-slate-900 text-xs font-medium transition-colors"
                title={t.duplicate}
              >
                <Copy size={13} />
              </button>

              <button
                onClick={() => handleMoveSelectedToIndex(1)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-slate-900 text-xs font-medium transition-colors"
                title={t.moveToStart}
              >
                <ArrowUpToLine size={13} />
              </button>
              <button
                onClick={() => handleMoveSelectedToIndex(images.length)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-slate-900 text-xs font-medium transition-colors"
                title={t.moveToEnd}
              >
                <ArrowDownToLine size={13} />
              </button>

              {/* Move to exact page number */}
              <div className="relative">
                <button
                  onClick={() => {
                    setMoveTargetInput('1');
                    setMovePopoverOpen((o) => !o);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200/80 text-slate-700 hover:text-slate-900 text-xs font-medium transition-colors"
                  title={t.moveToPosition}
                >
                  <CornerDownRight size={13} />
                </button>
                {movePopoverOpen && (
                  <div className="absolute right-0 top-full mt-1.5 p-2.5 bg-white rounded-lg border border-slate-200 shadow-lg z-30 flex items-center gap-1.5 w-48">
                    <input
                      type="number"
                      min={1}
                      max={images.length}
                      value={moveTargetInput}
                      onChange={(e) => setMoveTargetInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const num = parseInt(moveTargetInput, 10);
                          if (!isNaN(num)) handleMoveSelectedToIndex(num);
                        }
                      }}
                      className="w-20 px-2 py-1 rounded border border-slate-200 text-xs font-mono-num focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        const num = parseInt(moveTargetInput, 10);
                        if (!isNaN(num)) handleMoveSelectedToIndex(num);
                      }}
                      className="px-2.5 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                    >
                      {t.apply}
                    </button>
                  </div>
                )}
              </div>

              <div className="w-px h-4 bg-blue-200 mx-0.5" />

              <button
                onClick={handleBatchDelete}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
              >
                <Trash2 size={13} />
                {t.delete}
              </button>
            </div>
          </div>
        )}

        {/* Canvas Viewport */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          {images.length === 0 ? (
            /* Empty Full-Stage Dropzone */
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
                  <ImagePlus size={28} strokeWidth={1.6} />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-base font-semibold text-slate-900">{t.dropImagesHere}</h2>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {t.dropImagesHint}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    addInputRef.current?.click();
                  }}
                  className="mt-1 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                >
                  {t.addImages}
                </button>
              </div>
            </div>
          ) : visibleImages.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Search size={24} />
              <p className="text-sm font-medium text-slate-600">{t.noSearchMatch}</p>
            </div>
          ) : viewDensity === 'list' ? (
            /* Compact List View for ultra-fast organization of dozens of files */
            <div className="max-w-4xl mx-auto bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {visibleImages.map((img) => {
                const realIdx = images.findIndex((x) => x.id === img.id);
                const isSelected = selectedIds.has(img.id);
                const isDragging = draggingIds.includes(img.id);
                const dropSide = dropTarget?.id === img.id ? dropTarget.side : null;
                const needsCanvas = hasAdvancedPixelEdits(img);
                const traits: string[] = [];
                if (img.cropMode === 'perspective') traits.push(t.tagPerspective);
                else if (img.cropMode === 'polygon') traits.push(t.tagPolygon);
                else if (img.autoTrimApplied) traits.push(t.tagAutoTrim);
                else if (img.crop) traits.push(t.tagCropped);
                if (img.aiEnhanced?.active) traits.push(t.tagAi);
                else {
                  if ((img.sharpen ?? 0) > 0) traits.push(t.tagSharpen);
                  if (img.localUpscale) traits.push(t.tagHd);
                  if (img.watermarkRemoval?.enabled) traits.push(t.tagDeWatermark);
                }

                return (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleItemDragStart(img.id, e)}
                    onDragOver={(e) => handleItemDragOver(img.id, e)}
                    onDrop={(e) => handleItemDrop(img.id, e)}
                    onDragEnd={handleItemDragEnd}
                    onClick={(e) => handleCardSelect(img.id, e)}
                    onDoubleClick={() => openEditor(img.id, 'transform')}
                    className={cn(
                      'relative flex items-center gap-3 px-4 py-2.5 select-none transition-colors cursor-grab active:cursor-grabbing',
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80',
                      isDragging && 'opacity-40'
                    )}
                  >
                    {dropSide === 'before' && (
                      <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-600 pointer-events-none" />
                    )}
                    {dropSide === 'after' && (
                      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600 pointer-events-none" />
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardSelect(img.id, e, true);
                      }}
                      className="text-slate-400 hover:text-blue-600 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare size={16} className="text-blue-600" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>

                    <span className="w-7 text-xs font-mono-num text-slate-400 text-right shrink-0">
                      {realIdx + 1}
                    </span>

                    <div className="w-10 h-12 rounded border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                      {img.isBlank ? (
                        <span className="text-[9px] text-slate-400">BLANK</span>
                      ) : needsCanvas ? (
                        <CroppedPreviewImage item={img} fitMode="fit" maxPreview={140} />
                      ) : (
                        <img
                          src={img.url}
                          alt={img.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{img.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono-num truncate">
                        {img.isBlank
                          ? t.blankPage
                          : `${img.naturalWidth}×${img.naturalHeight} · ${formatBytes(img.size)}`}
                        {img.rotation !== 0 ? ` · ${img.rotation}°` : ''}
                        {traits.length > 0 ? ` · ${traits.join(' · ')}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!img.isBlank && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor(img.id, 'crop');
                          }}
                          className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title={t.tabCrop}
                        >
                          <CropIcon size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditor(img.id, 'enhance');
                        }}
                        className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title={t.editPage}
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      {!img.isBlank && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateImage(img.id, { rotation: (img.rotation + 90) % 360 });
                          }}
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          title={t.rotateRight}
                        >
                          <RotateCw size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSingle(img.id);
                        }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title={t.delete}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 2D Sortable Thumbnail Grid */
            <div
              className={cn(
                'grid pb-10',
                viewDensity === 'compact' ? 'gap-3' : viewDensity === 'large' ? 'gap-5' : 'gap-4'
              )}
              style={gridStyle}
            >
              {visibleImages.map((img) => {
                const realIdx = images.findIndex((x) => x.id === img.id);
                const isSelected = selectedIds.has(img.id);
                const isDragging = draggingIds.includes(img.id);
                const dropSide = dropTarget?.id === img.id ? dropTarget.side : null;
                const layout = resolveImagePageLayout(img, settings);
                const fitByHeight = layout.paperAspect <= wellAspect;
                const needsCanvasThumb = hasAdvancedPixelEdits(img);

                const pageBadgeText =
                  settings.paperSize === 'auto'
                    ? t.paperAuto
                    : `${settings.paperSize.toUpperCase()} · ${
                        layout.effOri === 'portrait' ? t.oriPortrait : t.oriLandscape
                      }`;

                const cardTraits: string[] = [];
                if (img.cropMode === 'perspective') cardTraits.push(t.tagPerspective);
                else if (img.cropMode === 'polygon') cardTraits.push(t.tagPolygon);
                else if (img.autoTrimApplied) cardTraits.push(t.tagAutoTrim);
                else if (img.crop) cardTraits.push(t.tagCropped);
                if (img.aiEnhanced?.active) cardTraits.push(t.tagAi);
                else {
                  if ((img.sharpen ?? 0) > 0) cardTraits.push(t.tagSharpen);
                  if (img.localUpscale) cardTraits.push(t.tagHd);
                  if (img.watermarkRemoval?.enabled) cardTraits.push(t.tagDeWatermark);
                }

                return (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleItemDragStart(img.id, e)}
                    onDragOver={(e) => handleItemDragOver(img.id, e)}
                    onDrop={(e) => handleItemDrop(img.id, e)}
                    onDragEnd={handleItemDragEnd}
                    onClick={(e) => handleCardSelect(img.id, e)}
                    onDoubleClick={() => openEditor(img.id, 'transform')}
                    className={cn(
                      'group relative flex flex-col rounded-xl bg-white border transition-all select-none cursor-grab active:cursor-grabbing',
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-sm'
                        : 'border-slate-200/90 hover:border-slate-300 shadow-2xs',
                      isDragging && 'opacity-35 scale-[0.97]'
                    )}
                  >
                    {/* Left/Right Drag Insertion Indicator */}
                    {dropSide === 'before' && (
                      <div className="absolute -left-2.5 inset-y-1 w-1 rounded-full bg-blue-600 z-20 pointer-events-none" />
                    )}
                    {dropSide === 'after' && (
                      <div className="absolute -right-2.5 inset-y-1 w-1 rounded-full bg-blue-600 z-20 pointer-events-none" />
                    )}

                    {/* Top Selection Checkbox + Page Index & Clean Unboxed Traits */}
                    <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardSelect(img.id, e, true);
                        }}
                        className={cn(
                          'w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0',
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-300 text-transparent group-hover:border-slate-400'
                        )}
                        aria-label="Select page"
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>

                      <div className="flex items-center gap-1.5 text-[11px] font-mono-num text-slate-500 min-w-0">
                        {cardTraits.length > 0 ? (
                          <span className="text-[10px] font-medium text-blue-600 truncate">
                            {cardTraits.slice(0, 2).join(' · ')}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 truncate">
                            {pageBadgeText}
                          </span>
                        )}
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="font-semibold text-slate-700 shrink-0">{realIdx + 1}</span>
                      </div>
                    </div>

                    {/* Subtle Gray Canvas Mat + True-Proportion White Paper Sheet */}
                    <div
                      className="mx-2 mb-2 rounded-lg bg-[#E9EDF3] overflow-hidden relative"
                      style={{ aspectRatio: `${wellAspect}` }}
                    >
                      <div className="absolute inset-2 flex items-center justify-center">
                        <div
                          className="relative bg-white shadow-sm ring-1 ring-slate-900/15 overflow-hidden transition-all"
                          style={{
                            aspectRatio: `${layout.pageW} / ${layout.pageH}`,
                            height: fitByHeight ? '100%' : 'auto',
                            width: fitByHeight ? 'auto' : '100%',
                            maxWidth: '100%',
                            maxHeight: '100%',
                          }}
                        >
                        {img.isBlank ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[11px] text-slate-400">{t.blankPage}</span>
                          </div>
                        ) : (
                          <div
                            className="absolute inset-0 overflow-hidden"
                            style={{
                              paddingLeft: `${layout.padXPct}%`,
                              paddingRight: `${layout.padXPct}%`,
                              paddingTop: `${layout.padYPct}%`,
                              paddingBottom: `${layout.padYPct}%`,
                            }}
                          >
                            <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
                              {needsCanvasThumb ? (
                                <div
                                  className="relative flex items-center justify-center shrink-0"
                                  style={
                                    layout.effScale === 'original'
                                      ? {
                                          width: `${(layout.drawW / Math.max(1, layout.pageW - layout.marginPt * 2)) * 100}%`,
                                          height: `${(layout.drawH / Math.max(1, layout.pageH - layout.marginPt * 2)) * 100}%`,
                                        }
                                      : { width: '100%', height: '100%' }
                                  }
                                >
                                  <CroppedPreviewImage
                                    item={img}
                                    maxPreview={420}
                                    fitMode={
                                      settings.paperSize === 'auto'
                                        ? 'fit'
                                        : layout.effScale === 'original'
                                        ? 'fit'
                                        : layout.effScale
                                    }
                                  />
                                </div>
                              ) : (
                                <img
                                  src={img.url}
                                  alt={img.name}
                                  draggable={false}
                                  className={cn(
                                    'block shrink-0',
                                    layout.effScale === 'fill' && settings.paperSize !== 'auto'
                                      ? 'w-full h-full object-cover'
                                      : layout.effScale === 'original' && settings.paperSize !== 'auto'
                                      ? 'max-w-none max-h-none'
                                      : 'w-full h-full object-contain'
                                  )}
                                  style={
                                    layout.effScale === 'original' && settings.paperSize !== 'auto'
                                      ? {
                                          width: `${(layout.drawW / Math.max(1, layout.pageW - layout.marginPt * 2)) * 100}%`,
                                          height: `${(layout.drawH / Math.max(1, layout.pageH - layout.marginPt * 2)) * 100}%`,
                                        }
                                      : undefined
                                  }
                                />
                              )}
                            </div>
                          </div>
                        )}
                        </div>
                      </div>

                      {/* Hover quick action bar */}
                      <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/85 backdrop-blur-xs rounded-lg p-1 z-10">
                        {!img.isBlank && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditor(img.id, 'crop');
                            }}
                            className="p-1.5 rounded text-white/90 hover:text-white hover:bg-white/15 transition-colors"
                            title={t.tabCrop}
                          >
                            <CropIcon size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor(img.id, 'enhance');
                          }}
                          className="p-1.5 rounded text-white/90 hover:text-white hover:bg-white/15 transition-colors"
                          title={t.editPage}
                        >
                          <SlidersHorizontal size={13} />
                        </button>
                        {!img.isBlank && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateImage(img.id, { rotation: (img.rotation + 90) % 360 });
                            }}
                            className="p-1.5 rounded text-white/90 hover:text-white hover:bg-white/15 transition-colors"
                            title={t.rotateRight}
                          >
                            <RotateCw size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSingle(img.id);
                          }}
                          className="p-1.5 rounded text-red-300 hover:text-red-200 hover:bg-white/15 transition-colors"
                          title={t.delete}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Footer Filename */}
                    <div className="px-2.5 pb-2 pt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-600 truncate" title={img.name}>
                        {img.name}
                      </span>
                      {!img.isBlank && img.naturalWidth > 0 && (
                        <span className="text-[10px] font-mono-num text-slate-400 shrink-0">
                          {img.naturalWidth}×{img.naturalHeight}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Quick Append Tile at End of Grid */}
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                className="min-h-[220px] rounded-xl border-2 border-dashed border-slate-300/90 hover:border-blue-400 hover:bg-white/70 transition-colors flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-blue-600"
              >
                <Plus size={22} />
                <span className="text-xs font-semibold">{t.addMore}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Inspector Sidebar */}
      <aside className="w-full lg:w-[320px] xl:w-[340px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="divide-y divide-slate-100">
          {/* Summary Header */}
          <div className="px-5 py-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">{t.pageSetup}</h3>
            <span className="text-xs font-mono-num text-slate-500">
              {images.length} {t.pagesUnit}
              {totalSizeBytes > 0 ? ` · ${formatBytes(totalSizeBytes)}` : ''}
            </span>
          </div>

          {/* Selected Item Batch Overrides (appears when >= 1 selected) */}
          {selectedIds.size > 0 && (
            <div className="px-5 py-4 bg-blue-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900">
                  {t.selectedOverride}
                </span>
                <span className="text-[11px] font-mono-num text-blue-700">
                  {t.itemsSelected.replace('{n}', String(selectedIds.size))}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      updateSelectedImages({ scaleType: e.target.value as 'global' | ScaleType });
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-xs font-medium text-slate-700"
                >
                  <option value="" disabled>
                    {t.scaleMode}...
                  </option>
                  <option value="global">{t.followGlobal}</option>
                  <option value="fit">{t.scaleFit}</option>
                  <option value="fill">{t.scaleFill}</option>
                  <option value="original">{t.scaleOriginal}</option>
                </select>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      updateSelectedImages({ filter: e.target.value as ImageFilterType });
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-xs font-medium text-slate-700"
                >
                  <option value="" disabled>
                    {t.tabEnhance}...
                  </option>
                  <option value="none">{t.filterNone}</option>
                  <option value="cleanDoc">{t.filterCleanDoc}</option>
                  <option value="grayscale">{t.filterGrayscale}</option>
                  <option value="bw">{t.filterBwScan}</option>
                  <option value="enhance">{t.filterEnhance}</option>
                </select>
              </div>
              {selectedIds.size === 1 && (
                <button
                  onClick={() => {
                    const firstId = Array.from(selectedIds)[0];
                    if (typeof firstId === 'string') openEditor(firstId, 'crop');
                  }}
                  className="w-full py-1.5 px-3 rounded-lg border border-blue-300 bg-white hover:bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <SlidersHorizontal size={13} />
                  {t.editPage}
                </button>
              )}
            </div>
          )}

          {/* Paper Size & Orientation */}
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">{t.paperSize}</label>
              <select
                value={settings.paperSize}
                onChange={(e) => {
                  setSettings({ ...settings, paperSize: e.target.value as PaperSizeKey });
                  clearResult();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="a4">A4 (210 × 297 mm)</option>
                <option value="a3">A3 (297 × 420 mm)</option>
                <option value="letter">Letter (216 × 279 mm)</option>
                <option value="legal">Legal (216 × 356 mm)</option>
                <option value="auto">{t.paperAuto}</option>
              </select>
            </div>

            {settings.paperSize !== 'auto' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">{t.orientation}</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(
                    [
                      ['auto', t.oriAuto],
                      ['portrait', t.oriPortrait],
                      ['landscape', t.oriLandscape],
                    ] as Array<[OrientationKey, string]>
                  ).map(([ori, label]) => (
                    <button
                      key={ori}
                      onClick={() => {
                        setSettings({ ...settings, orientation: ori });
                        clearResult();
                      }}
                      className={cn(
                        'py-1.5 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                        settings.orientation === ori
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Margins & Image Fit */}
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">{t.margins}</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['none', t.marginNone],
                    ['narrow', t.marginNarrow],
                    ['normal', t.marginNormal],
                    ['wide', t.marginWide],
                  ] as Array<[MarginPreset, string]>
                ).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => {
                      setSettings({ ...settings, margin: m });
                      clearResult();
                    }}
                    className={cn(
                      'py-1.5 px-2.5 rounded-lg border text-xs font-medium text-left transition-colors whitespace-nowrap truncate',
                      settings.margin === m
                        ? 'border-blue-600 bg-blue-50/70 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {settings.paperSize !== 'auto' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">{t.scaleMode}</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                  {(
                    [
                      ['fit', t.scaleFit],
                      ['fill', t.scaleFill],
                      ['original', t.scaleOriginal],
                    ] as Array<[ScaleType, string]>
                  ).map(([sc, label]) => (
                    <button
                      key={sc}
                      onClick={() => {
                        setSettings({ ...settings, scaleType: sc });
                        clearResult();
                      }}
                      className={cn(
                        'py-1.5 px-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap truncate',
                        settings.scaleType === sc
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quality, Page Numbers & Filename */}
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">{t.imageQuality}</label>
              <select
                value={settings.quality}
                onChange={(e) => {
                  setSettings({ ...settings, quality: e.target.value as QualityPreset });
                  clearResult();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="original">{t.qualityOriginal}</option>
                <option value="high">{t.qualityHigh}</option>
                <option value="balanced">{t.qualityBalanced}</option>
                <option value="compact">{t.qualityCompact}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">{t.pageNumbers}</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                {(
                  [
                    ['none', t.pageNumNone],
                    ['center', t.pageNumCenter],
                    ['right', t.pageNumRight],
                  ] as Array<[PageNumberPosition, string]>
                ).map(([pos, label]) => (
                  <button
                    key={pos}
                    onClick={() => {
                      setSettings({ ...settings, pageNumbers: pos });
                      clearResult();
                    }}
                    className={cn(
                      'py-1.5 px-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap truncate',
                      settings.pageNumbers === pos
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">{t.outputFilename}</label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Sticky Export Footer */}
        <div className="sticky bottom-0 p-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur-xs space-y-2.5 shrink-0">
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono-num text-slate-600">
                <span>{t.processing}</span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-150"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={images.length === 0 || isProcessing}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t.processing}
              </>
            ) : (
              <>
                {t.generatePdf} ({images.length})
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

      {/* Single-Page Lightbox Studio Modal */}
      {editingId && (
        <ImageDetailModal
          items={images}
          activeId={editingId}
          initialTab={editingTab}
          globalSettings={settings}
          onSelectId={setEditingId}
          onUpdate={updateImage}
          onApplyEnhanceToAll={handleApplyEnhanceToAll}
          onNotify={onNotify}
          onClose={() => setEditingId(null)}
          t={t}
        />
      )}

      {/* Output PDF Preview Modal */}
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
