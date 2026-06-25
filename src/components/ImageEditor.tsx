import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { RotateCw, Trash2, Maximize, Minimize, Scaling, ArrowDownUp, Image as ImageIcon, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { SplitOptions, ImageData } from '../lib/pdfSplitter';

export type AppImageData = ImageData & { url: string };

interface Props {
  images: AppImageData[];
  options: SplitOptions;
  updateImage: (id: string, updates: Partial<ImageData>) => void;
  removeImage: (id: string) => void;
  onDragEnd: (result: DropResult) => void;
  onAddImages: (files: File[], index?: number) => void;
  t: any;
}

const PagePreview = ({ img, options, updateImage, removeImage, t }: { img: AppImageData, options: SplitOptions, updateImage: any, removeImage: any, t: any }) => {
  const [dim, setDim] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setDim({ w: image.naturalWidth, h: image.naturalHeight });
    };
    image.src = img.url;
  }, [img.url]);

  const isPortrait = options.paperOrientation === 'portrait';
  const pageW = isPortrait ? 595.28 : 841.89;
  const pageH = isPortrait ? 841.89 : 595.28;

  let pctW = 100;
  let pctH = 100;

  if (dim.w > 0 && dim.h > 0) {
    let drawW = dim.w;
    let drawH = dim.h;
    
    let rot = img.rotation % 360;
    if (rot < 0) rot += 360;
    const isRotated = rot === 90 || rot === 270;

    if (img.scaleType === 'fit') {
      const scaleW = pageW / (isRotated ? dim.h : dim.w);
      const scaleH = pageH / (isRotated ? dim.w : dim.h);
      const scale = Math.min(scaleW, scaleH);
      drawW = dim.w * scale;
      drawH = dim.h * scale;
    } else if (img.scaleType === 'fill') {
      const scaleW = pageW / (isRotated ? dim.h : dim.w);
      const scaleH = pageH / (isRotated ? dim.w : dim.h);
      const scale = Math.max(scaleW, scaleH);
      drawW = dim.w * scale;
      drawH = dim.h * scale;
    }

    pctW = (drawW / pageW) * 100;
    pctH = (drawH / pageH) * 100;
  }

  return (
    <div className="relative group bg-white shadow-md border border-neutral-200 overflow-hidden" style={{ aspectRatio: `${pageW} / ${pageH}` }}>
      {/* Background checkerboard for transparent images */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
      
      {dim.w > 0 && (
        <img
          src={img.url}
          alt={img.file.name}
          className="absolute max-w-none"
          style={{
            top: '50%',
            left: '50%',
            width: `${pctW}%`,
            height: `${pctH}%`,
            transform: `translate(-50%, -50%) rotate(${img.rotation}deg)`,
          }}
        />
      )}

      {/* Toolbar overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-neutral-900/80 backdrop-blur-sm p-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
          <button onClick={() => updateImage(img.id, { scaleType: img.scaleType === 'fit' ? 'fill' : img.scaleType === 'fill' ? 'original' : 'fit' })} className="text-white p-2 hover:bg-white/20 rounded-lg transition-colors text-xs font-medium flex items-center gap-1">
            {img.scaleType === 'fit' ? <Minimize size={14}/> : img.scaleType === 'fill' ? <Maximize size={14}/> : <Scaling size={14}/>}
            {img.scaleType === 'fit' ? t.scaleFit : img.scaleType === 'fill' ? t.scaleFill : t.scaleOriginal}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => updateImage(img.id, { rotation: (img.rotation + 90) % 360 })} className="text-white p-2 hover:bg-white/20 rounded-lg transition-colors">
            <RotateCw size={16} />
          </button>
          <button onClick={() => removeImage(img.id)} className="text-red-400 p-2 hover:bg-white/20 hover:text-red-300 rounded-lg transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export function ImageEditor({ images, options, updateImage, removeImage, onDragEnd, onAddImages, t }: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [insertIdx, setInsertIdx] = useState<number | undefined>(undefined);

  const handleAddClick = (index?: number) => {
    setInsertIdx(index);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddImages(Array.from(e.target.files), insertIdx);
    }
    e.target.value = '';
  };

  if (images.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-neutral-400 flex-col gap-4">
        <div className="w-24 h-24 bg-neutral-100 rounded-3xl flex items-center justify-center shadow-inner">
           <ImageIcon size={48} className="text-neutral-300" />
        </div>
        <p className="font-medium text-lg">{t.dropImagesHere}</p>
      </div>
    );
  }

  return (
    <>
      <input 
        type="file" 
        multiple 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
      />
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="image-list" direction="vertical">
          {(provided) => (
            <div 
              {...provided.droppableProps} 
              ref={provided.innerRef}
              className="flex flex-col items-center py-10 w-full max-w-2xl mx-auto px-4 md:px-12"
            >
              {images.map((img, index) => (
                <Draggable key={img.id} draggableId={img.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="w-full relative flex flex-col items-center group/item"
                    >
                      <div className="w-full flex justify-center py-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleAddClick(index)}
                          className="bg-sky-50 text-sky-500 hover:bg-sky-100 p-2 rounded-full transition-colors shadow-sm border border-sky-100"
                          title="Insert page here"
                        >
                          <Plus size={20} />
                        </button>
                      </div>

                      <div className={cn(
                        "w-full relative group",
                        snapshot.isDragging && "z-50 shadow-2xl scale-[1.02] transition-transform"
                      )}>
                        <div className="absolute -left-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div {...provided.dragHandleProps} className="p-2 bg-white rounded-lg shadow-sm border border-neutral-200 text-neutral-400 hover:text-neutral-700 cursor-grab active:cursor-grabbing">
                            <ArrowDownUp size={20} />
                          </div>
                        </div>
                        
                        {/* Page Number */}
                        <div className="absolute -left-12 top-0 text-neutral-400 font-bold text-xl">
                          {index + 1}
                        </div>

                        <PagePreview img={img} options={options} updateImage={updateImage} removeImage={removeImage} t={t} />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              
              {/* Add at end */}
              <div className="w-full flex justify-center py-8">
                <button 
                  onClick={() => handleAddClick(images.length)}
                  className="bg-white hover:bg-neutral-50 text-neutral-600 font-bold py-3 px-6 rounded-2xl border-2 border-neutral-200 border-dashed hover:border-sky-400 hover:text-sky-500 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Plus size={20} />
                  {t.addImages || 'Add Pages'}
                </button>
              </div>
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}
