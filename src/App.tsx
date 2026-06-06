/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileUp, File, Settings2, Download, Loader2, ArrowRight, Languages, Maximize, Minimize } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { processPdf, SplitOptions, parsePageNumbers } from './lib/pdfSplitter';
import { cn } from './lib/utils';

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
    sourcePdfPages: "pages"
  },
  zh: {
    title: "PDF 分割打印",
    subtitle: "将超长或超宽的PDF分割成多张标准A4纸以便打印。非常适合长图、长网页、心电图或连续长表。",
    dropHere: "将PDF拖拽到此处",
    clickBrowse: "或点击浏览文件",
    options: "分割选项",
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
    noOutputDesc: "上传PDF并点击“分割 PDF”来在此处预览分页打印结果。",
    processError: "处理PDF失败。详情请查看浏览器控制台。",
    extractPages: "提取页面",
    slicePdfMode: "分割模式",
    extractMode: "提取模式",
    pageSelection: "页码选择",
    pageSelectionInput: "输入要提取的页码 (如: 1,3,5-10)",
    extractPdf: "提取 PDF",
    invalidPagesInfo: "未选择有效的页面。",
    sourcePdfPages: "页"
  },
  ja: {
    title: "PDF分割印刷",
    subtitle: "長くて幅の広いPDFを標準のA4ページに分割して印刷します。長いWebページや設計図に最適です。",
    dropHere: "ここにPDFをドロップ",
    clickBrowse: "またはクリックしてファイルを参照",
    options: "分割オプション",
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
    noOutputDesc: "PDFをアップロードし、「PDFを分割」をクリックして結果をプレビューします。",
    processError: "PDFの処理に失敗しました。詳細はコンソールを参照してください。",
    extractPages: "ページ抽出",
    slicePdfMode: "分割モード",
    extractMode: "抽出モード",
    pageSelection: "ページ選択",
    pageSelectionInput: "ページ番号を入力 (例: 1,3,5-10)",
    extractPdf: "PDFを抽出",
    invalidPagesInfo: "有効なページがありません。",
    sourcePdfPages: "ページ"
  },
  ko: {
    title: "PDF 분할 인쇄",
    subtitle: "출력을 위해 매우 길거나 넓은 PDF를 표준 A4 페이지로 분할합니다. 긴 웹페이지나 다이어그램에 이상적입니다。",
    dropHere: "여기에 PDF를 놓으세요",
    clickBrowse: "또는 클릭하여 파일 찾아보기",
    options: "분할 옵션",
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
    noOutputDesc: "PDF를 업로드하고 'PDF 분할'을 클릭하여 결과를 미리 보세요.",
    processError: "PDF 처리 실패. 자세한 내용은 콘솔을 확인하세요.",
    extractPages: "페이지 추출",
    slicePdfMode: "분할 모드",
    extractMode: "추출 모드",
    pageSelection: "페이지 선택",
    pageSelectionInput: "페이지 번호 입력 (예: 1,3,5-10)",
    extractPdf: "PDF 추출",
    invalidPagesInfo: "유효한 페이지가 없습니다.",
    sourcePdfPages: "페이지"
  },
  es: {
    title: "Cortador de PDF",
    subtitle: "Divida archivos PDF excepcionalmente largos o anchos en páginas A4 estándar para imprimirlos fácilmente.",
    dropHere: "Suelta tu PDF aquí",
    clickBrowse: "o haz clic para buscar archivos",
    options: "Opciones de corte",
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
    download: "Descargar resultado",
    preview: "Vista previa",
    readyToPrint: "Listo para imprimir",
    noOutputTitle: "Aún no hay resultados",
    noOutputDesc: "Sube un PDF y haz clic en 'Cortar PDF' para previsualizar aquí.",
    processError: "Error al procesar el PDF. Consulta la consola.",
    extractPages: "Extraer páginas",
    slicePdfMode: "Modo de corte",
    extractMode: "Modo de extracción",
    pageSelection: "Selección de página",
    pageSelectionInput: "ej: 1, 3, 5-10",
    extractPdf: "Extraer PDF",
    invalidPagesInfo: "No hay páginas válidas.",
    sourcePdfPages: "páginas"
  },
  fr: {
    title: "Découpeur PDF",
    subtitle: "Divisez des PDF exceptionnellement longs ou larges en pages A4 standard pour une impression facile.",
    dropHere: "Déposez votre PDF ici",
    clickBrowse: "ou cliquez pour parcourir",
    options: "Options de découpe",
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
    noOutputTitle: "Aucun résultat généré",
    noOutputDesc: "Téléchargez un PDF et cliquez sur 'Découper' pour prévisualiser.",
    processError: "Le traitement du PDF a échoué. Voir la console.",
    extractPages: "Extraire pages",
    slicePdfMode: "Mode découpe",
    extractMode: "Mode extraction",
    pageSelection: "Sélection de pages",
    pageSelectionInput: "ex: 1, 3, 5-10",
    extractPdf: "Extraire le PDF",
    invalidPagesInfo: "Aucune page valide.",
    sourcePdfPages: "pages"
  },
  de: {
    title: "PDF-Schneider",
    subtitle: "Teilen Sie außergewöhnlich lange oder breite PDFs zum einfachen Drucken in Standard-A4-Seiten auf.",
    dropHere: "PDF hier ablegen",
    clickBrowse: "oder klicken, um Dateien zu durchsuchen",
    options: "Schneideoptionen",
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
    download: "Ergebnis herunterladen",
    preview: "Vorschau",
    readyToPrint: "Druckbereit",
    noOutputTitle: "Noch kein Ergebnis",
    noOutputDesc: "Laden Sie ein PDF hoch und klicken Sie auf 'PDF schneiden', um eine Vorschau zu sehen.",
    processError: "PDF-Verarbeitung fehlgeschlagen. Siehe Konsole für Details.",
    extractPages: "Seiten extrahieren",
    slicePdfMode: "Schneidemodus",
    extractMode: "Extrahiermodus",
    pageSelection: "Seitenauswahl",
    pageSelectionInput: "z.B. 1, 3, 5-10",
    extractPdf: "PDF extrahieren",
    invalidPagesInfo: "Keine gültigen Seiten.",
    sourcePdfPages: "Seiten"
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
  const [mode, setMode] = useState<'slice' | 'extract'>('slice');
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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
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
  }, [resultUrl]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1
  } as any);

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      let blob: Blob;
      if (mode === 'slice') {
        blob = await processPdf(file, options);
      } else {
        const { extractPdfPages } = await import('./lib/pdfSplitter');
        blob = await extractPdfPages(file, pageSelection);
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
    if (!resultUrl || !file) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    const suffix = mode === 'slice' ? "_split.pdf" : "_extracted.pdf";
    a.download = file.name.replace(/\.[^/.]+$/, "") + suffix;
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
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-6 md:p-12 relative">
      
      {/* Top right language switcher */}
      <div className="absolute top-6 right-6 md:top-8 md:right-12 z-50">
        <div className="relative inline-flex items-center gap-2 bg-white/70 backdrop-blur-md border border-neutral-200/80 text-neutral-600 rounded-lg px-3 py-1.5 shadow-sm hover:bg-white transition-colors">
          <Languages size={16} className="text-neutral-500" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
            className="appearance-none bg-transparent outline-none cursor-pointer pr-5 text-sm font-medium focus:ring-0 relative z-10"
          >
            {Object.entries(languageNames).map(([code, name]) => (
              <option key={code} value={code} className="text-neutral-800">
                {name}
              </option>
            ))}
          </select>
          {/* Custom dropdown arrow */}
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-8 mt-8 md:mt-2">
        
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-neutral-500 max-w-2xl">
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
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center space-y-4",
                isDragActive ? "border-blue-500 bg-blue-50" : "border-neutral-200 bg-white hover:border-neutral-300",
                file && "border-solid border-neutral-200 bg-white"
              )}
            >
              <input {...getInputProps()} />
              {file ? (
                <>
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                    <File size={24} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-neutral-700 truncate max-w-[200px]">{file.name}</p>
                    <p className="text-sm text-neutral-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-12 w-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
                    <FileUp size={24} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-neutral-700">{t.dropHere}</p>
                    <p className="text-sm text-neutral-500">{t.clickBrowse}</p>
                  </div>
                </>
              )}
            </div>

            {/* Mode selection */}
            <div className="flex bg-neutral-200/50 p-1 rounded-xl">
              <button
                onClick={() => setMode('slice')}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
                  mode === 'slice' ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50"
                )}
              >
                {t.slicePdfMode}
              </button>
              <button
                onClick={() => setMode('extract')}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
                  mode === 'extract' ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50"
                )}
              >
                {t.extractMode}
              </button>
            </div>

            {/* Options */}
            <div className="bg-white border text-sm border-neutral-200 rounded-xl p-6 space-y-6">
              <div className="flex items-center gap-2 text-neutral-800 font-medium pb-2 border-b border-neutral-100">
                <Settings2 size={18} />
                <h3>{mode === 'slice' ? t.options : t.extractMode}</h3>
              </div>

              {mode === 'slice' ? (
                <div className="space-y-4">
                  {/* Slicing Direction */}
                  <div className="space-y-2">
                    <label className="text-neutral-600 font-medium">{t.direction}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['auto', 'horizontal', 'vertical'] as const).map((dir) => (
                        <button
                          key={dir}
                          onClick={() => setOptions({ ...options, direction: dir })}
                          className={cn(
                            "px-3 py-2 rounded-lg border text-center transition-all",
                            options.direction === dir 
                              ? "bg-neutral-900 border-neutral-900 text-white shadow-sm" 
                              : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                          )}
                        >
                          {dirLabels[dir]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Paper Orientation */}
                  <div className="space-y-2">
                    <label className="text-neutral-600 font-medium">{t.orientation}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['portrait', 'landscape'] as const).map((ori) => (
                        <button
                          key={ori}
                          onClick={() => setOptions({ ...options, paperOrientation: ori })}
                          className={cn(
                            "px-3 py-2 rounded-lg border text-center transition-all",
                            options.paperOrientation === ori 
                              ? "bg-neutral-900 border-neutral-900 text-white shadow-sm" 
                              : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                          )}
                        >
                          {oriLabels[ori]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scale to Fit */}
                  <div className="pt-2">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={options.scaleToFit}
                          onChange={(e) => setOptions({ ...options, scaleToFit: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-10 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neutral-900"></div>
                      </div>
                      <span className="text-neutral-700 font-medium select-none">{t.scaleToFit}</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-neutral-600 font-medium flex justify-between items-center">
                      <span>{t.pageSelection}</span>
                      {sourcePageCount ? <span className="text-neutral-400 text-xs">Total: {sourcePageCount} {t.sourcePdfPages}</span> : null}
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-transparent text-neutral-800 placeholder:text-neutral-400"
                      placeholder={t.pageSelectionInput}
                      value={pageSelection}
                      onChange={(e) => setPageSelection(e.target.value)}
                    />
                    <div className="flex justify-between items-start mt-1">
                      <p className="text-xs text-neutral-500">1, 3, 5-10</p>
                      {pageSelection.trim().length > 0 && (
                        <p className={cn("text-xs transition-colors", parsedPages.length > 0 ? "text-blue-600 font-medium" : "text-red-500")}>
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
              disabled={!file || isProcessing || (mode === 'extract' && parsedPages.length === 0)}
              className={cn(
                "w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-medium transition-all shadow-sm",
                (!file || (mode === 'extract' && parsedPages.length === 0))
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  : isProcessing
                    ? "bg-neutral-800 text-neutral-300 cursor-wait"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20"
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {t.processing}
                </>
              ) : (
                <>
                  {mode === 'slice' ? t.slicePdf : t.extractPdf} <ArrowRight size={18} />
                </>
              )}
            </button>
            
            {resultUrl && (
              <button
                onClick={handleDownload}
                className="w-full py-3.5 rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2 font-medium transition-all"
              >
                <Download size={18} />
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
              ? "fixed inset-2 md:inset-6 lg:inset-10 z-[100] rounded-xl shadow-2xl border border-neutral-200/50" 
              : "border border-neutral-200 rounded-xl shadow-sm col-span-1 lg:col-span-8 h-[600px] lg:h-[800px]"
          )}>
            <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex items-center justify-between z-10 shrink-0">
              <span className="text-sm font-medium text-neutral-600">{t.preview}</span>
              <div className="flex items-center gap-3">
                {resultUrl && (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-md font-medium hidden sm:inline-block">
                    {t.readyToPrint}
                  </span>
                )}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50 rounded-md transition-colors border border-transparent hover:border-neutral-200"
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              </div>
            </div>
            
            <div className="flex-1 bg-neutral-200 relative overflow-y-auto w-full h-full custom-scrollbar">
              {resultBlob ? (
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
