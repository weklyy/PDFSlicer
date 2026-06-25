/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileUp, File, Settings2, Download, Loader2, ArrowRight, Languages, Maximize, Minimize, Image as ImageIcon, Trash2, RotateCw, MoveUp, MoveDown } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { processPdf, SplitOptions, parsePageNumbers, ImageData } from './lib/pdfSplitter';
import { cn } from './lib/utils';
import { ImageEditor, AppImageData } from './components/ImageEditor';
import { DropResult } from '@hello-pangea/dnd';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Language = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

const languageNames: Record<Language, string> = {
  zh: "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch"
};

const dict: Record<Language, Record<string, string>> = {
  en: {
    title: "PDF Slicer",
    subtitle: "Split exceptionally long or wide PDFs into standard A4 pages for easy printing. Perfect for wide diagrams, long webpages, or continuous musical scores.",
    dropHere: "Drop your PDF here",
    clickBrowse: "or click to browse files",
    options: "Slicing Options",
    direction: "Slicing Direction",
    dirAuto: "Auto",
    dirHorizontal: "Horizontal",
    dirVertical: "Vertical",
    orientation: "Output A4 Orientation",
    oriPortrait: "Portrait",
    oriLandscape: "Landscape",
    scaleToFit: "Scale to fit standard height/width",
    processing: "Processing...",
    slicePdf: "Slice PDF",
    download: "Download Result",
    preview: "Preview",
    readyToPrint: "Ready to print",
    noOutputTitle: "No output generated yet",
    noOutputDesc: "Upload a PDF and click 'Slice PDF' to preview the paginated result here.",
    processError: "Failed to process PDF. See console for details.",
    extractPages: "Extract Pages",
    slicePdfMode: "Slice Mode",
    extractMode: "Extract Mode",
    pageSelection: "Page Selection",
    pageSelectionInput: "e.g. 1, 3, 5-10",
    extractPdf: "Extract PDF",
    invalidPagesInfo: "No valid pages to extract.",
    sourcePdfPages: "pages",
    imageToPdfMode: "Image to PDF",
    imageToPdf: "Convert to PDF",
    addImages: "Add Images",
    dropImagesHere: "Drop images here",
    scaleFit: "Fit to Page",
    scaleFill: "Fill Page",
    scaleOriginal: "Original Size",
    clearImages: "Clear All"
  },
  zh: {
    title: "PDF 工具箱",
    subtitle: "长图分割、提取页面、图片合成PDF，一站式解决您的PDF打印与排版需求。",
    dropHere: "将PDF拖拽到此处",
    clickBrowse: "或点击浏览文件",
    options: "选项",
    direction: "分割方向",
    dirAuto: "自动",
    dirHorizontal: "水平 (长图)",
    dirVertical: "垂直 (宽图)",
    orientation: "输出A4纸方向",
    oriPortrait: "纵向",
    oriLandscape: "横向",
    scaleToFit: "等比例缩放以适应由于比例造成的溢出",
    processing: "处理中...",
    slicePdf: "分割 PDF",
    download: "下载结果",
    preview: "预览",
    readyToPrint: "准备打印",
    noOutputTitle: "尚未生成输出",
    noOutputDesc: "上传文件并处理来在此处预览。",
    processError: "处理失败。详情请查看浏览器控制台。",
    extractPages: "提取页面",
    slicePdfMode: "分割模式",
    extractMode: "提取模式",
    pageSelection: "页码选择",
    pageSelectionInput: "输入要提取的页码 (如: 1,3,5-10)",
    extractPdf: "提取 PDF",
    invalidPagesInfo: "未选择有效的页面。",
    sourcePdfPages: "页",
    imageToPdfMode: "图片转PDF",
    imageToPdf: "合成 PDF",
    addImages: "添加图片",
    dropImagesHere: "将图片拖拽到此处",
    scaleFit: "适应页面",
    scaleFill: "填满页面",
    scaleOriginal: "原始尺寸",
    clearImages: "清空图片"
  },
  ja: {
    title: "PDFツールボックス",
    subtitle: "PDFの分割、抽出、画像からの作成をサポートします。",
    dropHere: "ここにPDFをドロップ",
    clickBrowse: "またはクリックしてファイルを参照",
    options: "オプション",
    direction: "分割方向",
    dirAuto: "自動",
    dirHorizontal: "水平 (長いPDF)",
    dirVertical: "垂直 (幅広のPDF)",
    orientation: "出力A4の向き",
    oriPortrait: "縦",
    oriLandscape: "横",
    scaleToFit: "標準の高さ/幅に合わせて拡大縮小",
    processing: "処理中...",
    slicePdf: "PDFを分割",
    download: "結果をダウンロード",
    preview: "プレビュー",
    readyToPrint: "印刷の準備ができました",
    noOutputTitle: "出力はまだ生成されていません",
    noOutputDesc: "ファイルをアップロードし、プレビューします。",
    processError: "処理に失敗しました。詳細はコンソールを参照してください。",
    extractPages: "ページ抽出",
    slicePdfMode: "分割モード",
    extractMode: "抽出モード",
    pageSelection: "ページ選択",
    pageSelectionInput: "ページ番号を入力 (例: 1,3,5-10)",
    extractPdf: "PDFを抽出",
    invalidPagesInfo: "有効なページがありません。",
    sourcePdfPages: "ページ",
    imageToPdfMode: "画像からPDF",
    imageToPdf: "PDFを作成",
    addImages: "画像を追加",
    dropImagesHere: "ここに画像をドロップ",
    scaleFit: "ページに合わせる",
    scaleFill: "ページを満たす",
    scaleOriginal: "元のサイズ",
    clearImages: "すべてクリア"
  },
  ko: {
    title: "PDF 도구 모음",
    subtitle: "PDF 분할, 페이지 추출, 이미지에서 PDF 생성을 지원합니다.",
    dropHere: "여기에 PDF를 놓으세요",
    clickBrowse: "또는 클릭하여 파일 찾아보기",
    options: "옵션",
    direction: "분할 방향",
    dirAuto: "자동",
    dirHorizontal: "가로 (긴 PDF)",
    dirVertical: "세로 (넓은 PDF)",
    orientation: "출력 A4 방향",
    oriPortrait: "세로",
    oriLandscape: "가로",
    scaleToFit: "표준 높이/너비에 맞게 크기 조정",
    processing: "처리 중...",
    slicePdf: "PDF 분할",
    download: "결과 다운로드",
    preview: "미리보기",
    readyToPrint: "인쇄 준비 완료",
    noOutputTitle: "아직 생성된 출력이 없습니다",
    noOutputDesc: "파일을 업로드하여 결과를 미리 보세요.",
    processError: "처리 실패. 자세한 내용은 콘솔을 확인하세요.",
    extractPages: "페이지 추출",
    slicePdfMode: "분할 모드",
    extractMode: "추출 모드",
    pageSelection: "페이지 선택",
    pageSelectionInput: "페이지 번호 입력 (예: 1,3,5-10)",
    extractPdf: "PDF 추출",
    invalidPagesInfo: "유효한 페이지가 없습니다.",
    sourcePdfPages: "페이지",
    imageToPdfMode: "이미지를 PDF로",
    imageToPdf: "PDF 생성",
    addImages: "이미지 추가",
    dropImagesHere: "여기에 이미지 놓기",
    scaleFit: "페이지에 맞춤",
    scaleFill: "페이지 채우기",
    scaleOriginal: "원본 크기",
    clearImages: "모두 지우기"
  },
  es: {
    title: "Herramientas de PDF",
    subtitle: "Divida, extraiga páginas y cree PDF desde imágenes.",
    dropHere: "Suelta tu PDF aquí",
    clickBrowse: "o haz clic para buscar archivos",
    options: "Opciones",
    direction: "Dirección de corte",
    dirAuto: "Automático",
    dirHorizontal: "Horizontal (Largo)",
    dirVertical: "Vertical (Ancho)",
    orientation: "Orientación de salida A4",
    oriPortrait: "Vertical",
    oriLandscape: "Horizontal",
    scaleToFit: "Ajustar al alto/ancho estándar",
    processing: "Procesando...",
    slicePdf: "Cortar PDF",
    download: "Descargar",
    preview: "Vista previa",
    readyToPrint: "Listo para imprimir",
    noOutputTitle: "Aún no hay resultados",
    noOutputDesc: "Sube archivos para previsualizar aquí.",
    processError: "Error. Consulta la consola.",
    extractPages: "Extraer páginas",
    slicePdfMode: "Modo de corte",
    extractMode: "Modo de extracción",
    pageSelection: "Selección de página",
    pageSelectionInput: "ej: 1, 3, 5-10",
    extractPdf: "Extraer PDF",
    invalidPagesInfo: "No hay páginas válidas.",
    sourcePdfPages: "páginas",
    imageToPdfMode: "Imagen a PDF",
    imageToPdf: "Crear PDF",
    addImages: "Añadir imágenes",
    dropImagesHere: "Suelta las imágenes aquí",
    scaleFit: "Ajustar a página",
    scaleFill: "Llenar página",
    scaleOriginal: "Tamaño original",
    clearImages: "Limpiar todo"
  },
  fr: {
    title: "Outils PDF",
    subtitle: "Découpez, extrayez et créez des PDF à partir d'images.",
    dropHere: "Déposez votre PDF ici",
    clickBrowse: "ou cliquez pour parcourir",
    options: "Options",
    direction: "Direction de découpe",
    dirAuto: "Auto",
    dirHorizontal: "Horizontal",
    dirVertical: "Vertical",
    orientation: "Orientation A4",
    oriPortrait: "Portrait",
    oriLandscape: "Paysage",
    scaleToFit: "Ajuster à la hauteur/largeur",
    processing: "Traitement...",
    slicePdf: "Découper le PDF",
    download: "Télécharger",
    preview: "Aperçu",
    readyToPrint: "Prêt à imprimer",
    noOutputTitle: "Aucun résultat",
    noOutputDesc: "Téléchargez des fichiers pour prévisualiser.",
    processError: "Erreur. Voir la console.",
    extractPages: "Extraire pages",
    slicePdfMode: "Mode découpe",
    extractMode: "Mode extraction",
    pageSelection: "Sélection de pages",
    pageSelectionInput: "ex: 1, 3, 5-10",
    extractPdf: "Extraire le PDF",
    invalidPagesInfo: "Aucune page valide.",
    sourcePdfPages: "pages",
    imageToPdfMode: "Image en PDF",
    imageToPdf: "Créer un PDF",
    addImages: "Ajouter des images",
    dropImagesHere: "Déposez les images ici",
    scaleFit: "Ajuster à la page",
    scaleFill: "Remplir la page",
    scaleOriginal: "Taille originale",
    clearImages: "Tout effacer"
  },
  de: {
    title: "PDF Werkzeuge",
    subtitle: "Schneiden, extrahieren und PDFs aus Bildern erstellen.",
    dropHere: "PDF hier ablegen",
    clickBrowse: "oder klicken, um Dateien zu durchsuchen",
    options: "Optionen",
    direction: "Schneidrichtung",
    dirAuto: "Auto",
    dirHorizontal: "Horizontal",
    dirVertical: "Vertikal",
    orientation: "A4-Ausrichtung",
    oriPortrait: "Hochformat",
    oriLandscape: "Querformat",
    scaleToFit: "An Standardhöhe/-breite anpassen",
    processing: "Verarbeitung...",
    slicePdf: "PDF schneiden",
    download: "Herunterladen",
    preview: "Vorschau",
    readyToPrint: "Druckbereit",
    noOutputTitle: "Noch kein Ergebnis",
    noOutputDesc: "Laden Sie Dateien hoch, um eine Vorschau zu sehen.",
    processError: "Fehler. Siehe Konsole für Details.",
    extractPages: "Seiten extrahieren",
    slicePdfMode: "Schneidemodus",
    extractMode: "Extrahiermodus",
    pageSelection: "Seitenauswahl",
    pageSelectionInput: "z.B. 1, 3, 5-10",
    extractPdf: "PDF extrahieren",
    invalidPagesInfo: "Keine gültigen Seiten.",
    sourcePdfPages: "Seiten",
    imageToPdfMode: "Bild zu PDF",
    imageToPdf: "PDF erstellen",
    addImages: "Bilder hinzufügen",
    dropImagesHere: "Bilder hier ablegen",
    scaleFit: "An Seite anpassen",
    scaleFill: "Seite füllen",
    scaleOriginal: "Originalgröße",
    clearImages: "Alles löschen"
  }
};

function getDefaultLanguage(): Language {
  const browserLang = navigator.language.split('-')[0].toLowerCase();
  const supportedLangs: Language[] = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'];
  if (supportedLangs.includes(browserLang as Language)) {
    return browserLang as Language;
  }
  return 'en';
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => getDefaultLanguage());
  const t = dict[lang] || dict['en'];

  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<AppImageData[]>([]);
  const [mode, setMode] = useState<'slice' | 'extract' | 'imageToPdf'>('slice');
  const [pageSelection, setPageSelection] = useState<string>('');
  const [sourcePageCount, setSourcePageCount] = useState<number | null>(null);

  const parsedPages = useMemo(() => {
    if (mode !== 'extract' || !pageSelection.trim()) return [];
    return parsePageNumbers(pageSelection, sourcePageCount || 9999);
  }, [mode, pageSelection, sourcePageCount]);
  
  const [options, setOptions] = useState<SplitOptions>({
    direction: 'auto',
    scaleToFit: true,
    paperOrientation: 'portrait',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const handleAddImages = (acceptedFiles: File[], insertIndex?: number) => {
    const newImages = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      url: URL.createObjectURL(file),
      rotation: 0,
      scaleType: 'fit' as const
    }));
    
    setImages(prev => {
      const copy = [...prev];
      if (typeof insertIndex === 'number') {
        copy.splice(insertIndex, 0, ...newImages);
      } else {
        copy.push(...newImages);
      }
      return copy;
    });
    setResultBlob(null);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (mode === 'imageToPdf') {
      handleAddImages(acceptedFiles);
      return;
    }

    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setResultBlob(null);
      setSourcePageCount(null);
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
        setResultUrl(null);
      }
      
      try {
        const { getPdfPageCount } = await import('./lib/pdfSplitter');
        const count = await getPdfPageCount(selectedFile);
        setSourcePageCount(count);
      } catch (err) {
        console.error("Failed to get pdf page count", err);
      }
    }
  }, [mode, resultUrl]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: mode === 'imageToPdf' ? {
      'image/*': ['.png', '.jpg', '.jpeg']
    } : {
      'application/pdf': ['.pdf']
    },
    maxFiles: mode === 'imageToPdf' ? 0 : 1 // 0 means unlimited
  } as any);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(images);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setImages(items);
  };

  const updateImage = (id: string, updates: Partial<ImageData>) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img));
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleProcess = async () => {
    if ((mode === 'slice' || mode === 'extract') && !file) return;
    if (mode === 'imageToPdf' && images.length === 0) return;
    
    setIsProcessing(true);
    try {
      let blob: Blob;
      if (mode === 'slice' && file) {
        blob = await processPdf(file, options);
      } else if (mode === 'extract' && file) {
        const { extractPdfPages } = await import('./lib/pdfSplitter');
        blob = await extractPdfPages(file, pageSelection);
      } else {
        const { imagesToPdf } = await import('./lib/pdfSplitter');
        blob = await imagesToPdf(images, options.paperOrientation);
      }
      setResultBlob(blob);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (error: any) {
      console.error("Failed to process PDF", error);
      if (error && error.message === "No valid pages selected.") {
        alert(t.invalidPagesInfo);
      } else {
        alert(t.processError);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    
    let filename = "output.pdf";
    if (file && (mode === 'slice' || mode === 'extract')) {
      const suffix = mode === 'slice' ? "_split.pdf" : "_extracted.pdf";
      filename = file.name.replace(/\.[^/.]+$/, "") + suffix;
    } else if (mode === 'imageToPdf') {
      filename = "images_to_pdf.pdf";
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const dirLabels = {
    auto: t.dirAuto,
    horizontal: t.dirHorizontal,
    vertical: t.dirVertical
  };

  const oriLabels = {
    portrait: t.oriPortrait,
    landscape: t.oriLandscape
  };

  return (
    <div className="min-h-screen bg-[#EAF3FA] text-neutral-900 font-sans p-6 md:p-12 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-blue-100/50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-pink-100/50 blur-3xl pointer-events-none" />

      {/* Top right language switcher */}
      <div className="absolute top-6 right-6 md:top-8 md:right-12 z-50">
        <div className="relative inline-flex items-center gap-2 bg-white/70 backdrop-blur-md border border-white text-neutral-600 rounded-2xl px-4 py-2 shadow-[0_4px_12px_rgb(0,0,0,0.05)] hover:bg-white transition-colors cursor-pointer">
          <Languages size={18} className="text-blue-500" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
            className="appearance-none bg-transparent outline-none cursor-pointer pr-6 text-sm font-bold text-neutral-700 focus:ring-0 relative z-10"
          >
            {Object.entries(languageNames).map(([code, name]) => (
              <option key={code} value={code} className="text-neutral-800">
                {name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8 mt-12 md:mt-4 relative z-10">
        
        {/* Header */}
        <header className="space-y-3 text-center md:text-left pl-2">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-800">
            {t.title}
          </h1>
          <p className="text-neutral-500 max-w-2xl text-lg font-medium">
            {t.subtitle}
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Controls Panel */}
          <div className="col-span-1 lg:col-span-4 space-y-6">
            
            {/* Upload Area */}
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-3xl p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center space-y-4 bg-white/70 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
                isDragActive ? "border-sky-400 bg-sky-50" : "border-white hover:border-sky-400",
                file && mode !== 'imageToPdf' && "border-solid border-sky-400 bg-sky-50"
              )}
            >
              <input {...getInputProps()} />
              {mode === 'imageToPdf' ? (
                <>
                  <div className="h-14 w-14 rounded-2xl bg-pink-100 flex items-center justify-center text-pink-500 shadow-sm">
                    <ImageIcon size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-neutral-700">{images.length > 0 ? t.addImages : t.dropImagesHere}</p>
                    <p className="text-sm font-medium text-neutral-500">{t.clickBrowse}</p>
                  </div>
                </>
              ) : file ? (
                <>
                  <div className="h-14 w-14 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                    <File size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-neutral-700 truncate max-w-[200px]">{file.name}</p>
                    <p className="text-sm font-medium text-neutral-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-neutral-500 border border-neutral-100">
                    <FileUp size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-neutral-700">{t.dropHere}</p>
                    <p className="text-sm font-medium text-neutral-500">{t.clickBrowse}</p>
                  </div>
                </>
              )}
            </div>

            {/* Mode selection */}
            <div className="flex bg-white/70 backdrop-blur-md p-1.5 rounded-[20px] shadow-[0_4px_12px_rgb(0,0,0,0.04)] border border-white">
              {(['slice', 'extract', 'imageToPdf'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 py-3 text-sm font-bold rounded-[14px] transition-all",
                    mode === m 
                      ? "bg-white shadow-[0_4px_12px_rgb(0,0,0,0.08)] text-neutral-900 border border-neutral-100" 
                      : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100/50"
                  )}
                >
                  {m === 'slice' ? t.slicePdfMode : m === 'extract' ? t.extractMode : t.imageToPdfMode}
                </button>
              ))}
            </div>

            {/* Options */}
            <div className="bg-white/80 backdrop-blur-sm border border-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 space-y-6">
              <div className="flex items-center gap-2 text-neutral-800 font-bold pb-4 border-b border-neutral-100">
                <Settings2 size={20} className="text-sky-500" />
                <h3 className="text-lg">{mode === 'slice' ? t.options : mode === 'extract' ? t.extractMode : t.options}</h3>
              </div>

              {mode === 'imageToPdf' ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-neutral-600 font-bold">{t.orientation}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['portrait', 'landscape'] as const).map((ori) => (
                        <button
                          key={ori}
                          onClick={() => setOptions({ ...options, paperOrientation: ori })}
                          className={cn(
                            "px-3 py-3 rounded-2xl border-2 text-center transition-all font-bold",
                            options.paperOrientation === ori 
                              ? "bg-sky-400 border-sky-400 text-white shadow-[0_4px_0_0_#0284c7] active:translate-y-[4px] active:shadow-none" 
                              : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 shadow-[0_4px_0_0_#e5e7eb] active:translate-y-[4px] active:shadow-none"
                          )}
                        >
                          {oriLabels[ori]}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {images.length > 0 && (
                    <div className="space-y-3 mt-6 pt-4 border-t border-neutral-100">
                      <div className="flex justify-between items-center text-sm font-bold text-neutral-600">
                        <span>{images.length} {t.sourcePdfPages}</span>
                        <button onClick={() => setImages([])} className="text-red-400 hover:text-red-500 flex items-center gap-1"><Trash2 size={14}/> {t.clearImages}</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : mode === 'slice' ? (
                <div className="space-y-5">
                  {/* Slicing Direction */}
                  <div className="space-y-3">
                    <label className="text-neutral-600 font-bold">{t.direction}</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['auto', 'horizontal', 'vertical'] as const).map((dir) => (
                        <button
                          key={dir}
                          onClick={() => setOptions({ ...options, direction: dir })}
                          className={cn(
                            "px-2 py-3 rounded-2xl border-2 text-center transition-all font-bold text-sm",
                            options.direction === dir 
                              ? "bg-sky-400 border-sky-400 text-white shadow-[0_4px_0_0_#0284c7] active:translate-y-[4px] active:shadow-none" 
                              : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 shadow-[0_4px_0_0_#e5e7eb] active:translate-y-[4px] active:shadow-none"
                          )}
                        >
                          {dirLabels[dir]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Paper Orientation */}
                  <div className="space-y-3">
                    <label className="text-neutral-600 font-bold">{t.orientation}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['portrait', 'landscape'] as const).map((ori) => (
                        <button
                          key={ori}
                          onClick={() => setOptions({ ...options, paperOrientation: ori })}
                          className={cn(
                            "px-3 py-3 rounded-2xl border-2 text-center transition-all font-bold text-sm",
                            options.paperOrientation === ori 
                              ? "bg-sky-400 border-sky-400 text-white shadow-[0_4px_0_0_#0284c7] active:translate-y-[4px] active:shadow-none" 
                              : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 shadow-[0_4px_0_0_#e5e7eb] active:translate-y-[4px] active:shadow-none"
                          )}
                        >
                          {oriLabels[ori]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scale to Fit */}
                  <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group bg-neutral-50 p-3 rounded-2xl border border-neutral-100">
                      <div className="relative flex items-center justify-center shrink-0">
                        <input
                          type="checkbox"
                          checked={options.scaleToFit}
                          onChange={(e) => setOptions({ ...options, scaleToFit: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-12 h-7 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-400"></div>
                      </div>
                      <span className="text-neutral-700 font-bold select-none">{t.scaleToFit}</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-neutral-600 font-bold flex justify-between items-center">
                      <span>{t.pageSelection}</span>
                      {sourcePageCount ? <span className="text-neutral-400 text-xs font-medium">Total: {sourcePageCount} {t.sourcePdfPages}</span> : null}
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 border-2 border-neutral-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-400 text-neutral-800 font-bold placeholder:text-neutral-300 transition-all"
                      placeholder={t.pageSelectionInput}
                      value={pageSelection}
                      onChange={(e) => setPageSelection(e.target.value)}
                    />
                    <div className="flex justify-between items-start mt-2 px-1">
                      <p className="text-xs font-medium text-neutral-400">1, 3, 5-10</p>
                      {pageSelection.trim().length > 0 && (
                        <p className={cn("text-xs font-bold transition-colors", parsedPages.length > 0 ? "text-green-500" : "text-red-400")}>
                          {parsedPages.length > 0 ? `✓ ${parsedPages.length} ${t.sourcePdfPages}` : t.invalidPagesInfo}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Button */}
            <button
              onClick={handleProcess}
              disabled={(mode !== 'imageToPdf' && !file) || (mode === 'imageToPdf' && images.length === 0) || isProcessing || (mode === 'extract' && parsedPages.length === 0)}
              className={cn(
                "w-full py-4 rounded-[20px] flex items-center justify-center gap-2 font-bold transition-all text-lg border-2 border-transparent",
                ((mode !== 'imageToPdf' && !file) || (mode === 'imageToPdf' && images.length === 0) || (mode === 'extract' && parsedPages.length === 0))
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed shadow-none"
                  : isProcessing
                    ? "bg-neutral-800 text-neutral-300 cursor-wait shadow-none"
                    : "bg-red-400 hover:bg-red-500 text-white shadow-[0_6px_0_0_#f87171] active:translate-y-[6px] active:shadow-none border-red-500/20"
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {t.processing}
                </>
              ) : (
                <>
                  {mode === 'slice' ? t.slicePdf : mode === 'extract' ? t.extractPdf : t.imageToPdf} <ArrowRight size={20} />
                </>
              )}
            </button>
            
            {resultUrl && (
              <button
                onClick={handleDownload}
                className="w-full py-4 rounded-[20px] border-2 border-neutral-200 bg-white text-neutral-700 font-bold hover:bg-neutral-50 flex items-center justify-center gap-2 shadow-[0_6px_0_0_#e5e7eb] active:translate-y-[6px] active:shadow-none transition-all text-lg mt-4"
              >
                <Download size={20} />
                {t.download}
              </button>
            )}

          </div>

          {/* Preview Panel */}
          {isFullscreen && (
            <div 
              className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-[100]" 
              onClick={() => setIsFullscreen(false)} 
            />
          )}
          <div className={cn(
            "bg-white flex flex-col overflow-hidden transition-all",
            isFullscreen 
              ? "fixed inset-2 md:inset-6 lg:inset-10 z-[100] rounded-3xl shadow-2xl border-4 border-white" 
              : "border-4 border-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] col-span-1 lg:col-span-8 h-[600px] lg:h-[800px]"
          )}>
            <div className="bg-sky-50 px-5 py-4 flex items-center justify-between z-10 shrink-0">
              <span className="text-sm font-bold text-sky-800">{t.preview}</span>
              <div className="flex items-center gap-3">
                {resultUrl && (
                  <span className="text-xs px-3 py-1.5 bg-green-400 text-white rounded-xl font-bold hidden sm:inline-block shadow-sm">
                    {t.readyToPrint}
                  </span>
                )}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 text-sky-600 hover:text-sky-800 hover:bg-sky-100 rounded-xl transition-colors border border-transparent"
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              </div>
            </div>
            
            <div className="flex-1 bg-neutral-100 relative overflow-y-auto w-full h-full custom-scrollbar">
              {mode === 'imageToPdf' ? (
                <ImageEditor 
                  images={images} 
                  options={options} 
                  updateImage={updateImage} 
                  removeImage={removeImage} 
                  onDragEnd={handleDragEnd} 
                  onAddImages={handleAddImages}
                  t={t} 
                />
              ) : resultBlob ? (
                <div className="py-8 flex flex-col items-center min-h-full">
                  <Document
                    file={resultBlob}
                    onLoadSuccess={onDocumentLoadSuccess}
                    className="flex flex-col items-center w-full"
                    loading={
                      <div className="flex flex-col items-center justify-center text-neutral-400 p-6">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <span>Loading preview...</span>
                      </div>
                    }
                  >
                    {Array.from(new Array(numPages || 0), (el, index) => (
                      <div key={`page_${index + 1}`} className="flex justify-center w-full">
                        <Page
                          pageNumber={index + 1}
                          className="mb-6 shadow-xl border border-neutral-200"
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          width={Math.min(window.innerWidth - 64, 800)} // Responsive max width
                        />
                      </div>
                    ))}
                  </Document>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 p-6 text-center">
                  <File size={48} className="mb-4 text-neutral-300" strokeWidth={1} />
                  <p className="font-medium text-neutral-500">{t.noOutputTitle}</p>
                  <p className="text-sm mt-1 max-w-sm">{t.noOutputDesc}</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
