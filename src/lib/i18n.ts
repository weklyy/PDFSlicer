export type Language = 'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

export const languageNames: Record<Language, string> = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

export interface Dictionary {
  appName: string;
  modeImageToPdf: string;
  modeExtract: string;
  modeSlice: string;

  // Common
  uploadPdf: string;
  replacePdf: string;
  dropPdfHere: string;
  dropPdfHint: string;
  dropImagesHere: string;
  dropImagesHint: string;
  addImages: string;
  addMore: string;
  insertBlankPage: string;
  clearAll: string;
  processing: string;
  downloadPdf: string;
  previewResult: string;
  close: string;
  cancel: string;
  apply: string;
  reset: string;
  save: string;
  delete: string;
  duplicate: string;
  rotateLeft: string;
  rotateRight: string;
  flipH: string;
  flipV: string;
  pagesUnit: string;
  itemsSelected: string;
  outputFilename: string;
  readyToDownload: string;
  generatedSuccess: string;
  processError: string;
  invalidPagesInfo: string;
  undo: string;
  redo: string;
  searchFiles: string;
  noSearchMatch: string;

  // Image to PDF
  sort: string;
  sortNameAsc: string;
  sortNameDesc: string;
  sortTimeAsc: string;
  sortTimeDesc: string;
  sortSizeDesc: string;
  sortReverse: string;
  selectAll: string;
  deselectAll: string;
  invertSelection: string;
  moveToPosition: string;
  moveToStart: string;
  moveToEnd: string;
  targetPosition: string;
  viewCompact: string;
  viewStandard: string;
  viewLarge: string;
  viewList: string;
  pageSetup: string;
  paperSize: string;
  paperAuto: string;
  orientation: string;
  oriAuto: string;
  oriPortrait: string;
  oriLandscape: string;
  margins: string;
  marginNone: string;
  marginNarrow: string;
  marginNormal: string;
  marginWide: string;
  scaleMode: string;
  scaleFit: string;
  scaleFill: string;
  scaleOriginal: string;
  followGlobal: string;
  imageQuality: string;
  qualityOriginal: string;
  qualityHigh: string;
  qualityBalanced: string;
  qualityCompact: string;
  pageNumbers: string;
  pageNumNone: string;
  pageNumCenter: string;
  pageNumRight: string;
  generatePdf: string;
  editPage: string;
  selectedOverride: string;
  applyToSelected: string;
  blankPage: string;
  dropToAppend: string;

  // Image Detail Modal
  editorTitle: string;
  tabTransform: string;
  tabCrop: string;
  tabEnhance: string;
  filterNone: string;
  filterGrayscale: string;
  filterBwScan: string;
  filterEnhance: string;
  filterCleanDoc: string;
  brightness: string;
  contrast: string;
  cropFree: string;
  cropReset: string;
  cropHint: string;
  prevPage: string;
  nextPage: string;
  applyFilterToAll: string;
  filterAppliedAll: string;

  // Smart Auto-Trim & Irregular Cropping
  autoTrimOnUpload: string;
  autoTrimAll: string;
  autoTrimSelected: string;
  autoTrimDetect: string;
  autoTrimResultToast: string;
  autoTrimNoneFound: string;
  autoTrimSensitivity: string;
  autoTrimPadding: string;
  restoreCrop: string;
  cropModeRect: string;
  cropModePerspective: string;
  cropModePolygon: string;
  perspectiveDetect: string;
  perspectiveReset: string;
  perspectiveHint: string;
  perspectiveApply: string;
  polygonInitQuad: string;
  polygonUndoPoint: string;
  polygonClear: string;
  polygonCloseShape: string;
  polygonFillLabel: string;
  polygonFillWhite: string;
  polygonFillTransparent: string;
  polygonHint: string;
  polygonPointsCount: string;
  polygonApply: string;
  tagAutoTrim: string;
  tagPerspective: string;
  tagPolygon: string;
  tagCropped: string;
  tagSharpen: string;
  tagHd: string;
  tagDeWatermark: string;
  tagAi: string;

  // Local Enhance, Sharpen, HD, Watermark & Brush
  localEngineTitle: string;
  sharpen: string;
  denoiseShadow: string;
  localUpscale: string;
  localUpscaleDesc: string;
  localWatermark: string;
  watermarkStrength: string;
  removeColorStamps: string;
  eraserBrush: string;
  eraserBrushActive: string;
  eraserBrushHint: string;
  brushSize: string;
  undoStroke: string;
  clearStrokes: string;
  compareBeforeAfter: string;
  beforeLabel: string;
  afterLabel: string;

  // AI Deep Restoration
  aiEngineTitle: string;
  aiEngineNote: string;
  aiWatermarkBtn: string;
  aiHdBtn: string;
  aiBothBtn: string;
  aiProcessingWatermark: string;
  aiProcessingHd: string;
  aiProcessingBoth: string;
  aiAcceptResult: string;
  aiDiscardResult: string;
  aiLayerActive: string;
  aiLayerPaused: string;
  aiRemoveLayer: string;
  aiKeyMissingTip: string;
  aiKeyInvalidTip: string;
  aiQuotaTip: string;
  aiDoneToast: string;

  // Batch Enhancement
  batchEnhance: string;
  batchCleanDoc: string;
  batchBwScan: string;
  batchLocalWatermark: string;
  batchLocalHd: string;
  batchResetEnhance: string;
  batchAiAction: string;
  batchAiProgress: string;
  batchAiStop: string;
  batchEnhancedToast: string;

  // Extract & Organize Mode
  extractTitle: string;
  extractAction: string;
  pageRangeLabel: string;
  pageRangePlaceholder: string;
  selectOdd: string;
  selectEven: string;
  resetOrder: string;
  dragToReorderHint: string;
  keepCustomOrder: string;
  sourcePages: string;
  selectedPagesCount: string;
  inspectPage: string;
  loadingPages: string;

  // Slice Mode
  sliceTitle: string;
  sliceAction: string;
  tabBlueprint: string;
  tabOutput: string;
  sliceDirection: string;
  dirAuto: string;
  dirVertical: string;
  dirHorizontal: string;
  dirGrid: string;
  scaleToFit: string;
  scaleToFitDesc: string;
  sliceMargin: string;
  sliceOverlap: string;
  sliceOverlapDesc: string;
  showCutMarks: string;
  showCutMarksDesc: string;
  estimatedOutput: string;
  sourceDimensions: string;
  sourcePageSelect: string;
  noSliceOutputYet: string;
  noSliceOutputDesc: string;
  zoomFit: string;
}

const zh: Dictionary = {
  appName: 'PDF 工作台',
  modeImageToPdf: '图片转 PDF',
  modeExtract: '页面提取与整理',
  modeSlice: '长图分页分割',

  uploadPdf: '选择 PDF 文件',
  replacePdf: '更换文件',
  dropPdfHere: '将 PDF 文件拖拽至此，或点击选择',
  dropPdfHint: '纯本地浏览器处理 · 文件不上传服务器 · 支持多页大文档',
  dropImagesHere: '将多张图片拖拽至此，或点击批量导入',
  dropImagesHint: '支持 JPG · PNG · WebP · GIF · BMP · 支持一次导入上百张图片',
  addImages: '添加图片',
  addMore: '继续添加',
  insertBlankPage: '插入空白页',
  clearAll: '清空',
  processing: '正在生成...',
  downloadPdf: '下载 PDF',
  previewResult: '预览成品',
  close: '关闭',
  cancel: '取消',
  apply: '应用',
  reset: '重置',
  save: '完成',
  delete: '删除',
  duplicate: '复制副本',
  rotateLeft: '逆时针旋转 90°',
  rotateRight: '顺时针旋转 90°',
  flipH: '水平翻转',
  flipV: '垂直翻转',
  pagesUnit: '页',
  itemsSelected: '已选 {n} 项',
  outputFilename: '导出文件名',
  readyToDownload: '已就绪',
  generatedSuccess: 'PDF 已生成，点击即可预览或下载',
  processError: '处理失败，请检查文件格式是否有效',
  invalidPagesInfo: '请至少选择 1 个有效页码',
  undo: '撤销',
  redo: '重做',
  searchFiles: '搜索文件名...',
  noSearchMatch: '没有匹配的图片',

  sort: '排序',
  sortNameAsc: '文件名 A → Z（自然排序）',
  sortNameDesc: '文件名 Z → A',
  sortTimeAsc: '修改时间：从旧到新',
  sortTimeDesc: '修改时间：从新到旧',
  sortSizeDesc: '文件大小：从大到小',
  sortReverse: '反转当前顺序',
  selectAll: '全选',
  deselectAll: '取消选择',
  invertSelection: '反选',
  moveToPosition: '移至指定页码',
  moveToStart: '移至最前',
  moveToEnd: '移至最后',
  targetPosition: '目标页码位置',
  viewCompact: '紧凑网格',
  viewStandard: '标准网格',
  viewLarge: '大图网格',
  viewList: '列表视图',
  pageSetup: '全局页面设置',
  paperSize: '纸张尺寸',
  paperAuto: '自适应原图',
  orientation: '页面方向',
  oriAuto: '智能匹配',
  oriPortrait: '纵向',
  oriLandscape: '横向',
  margins: '页边距',
  marginNone: '无边距',
  marginNarrow: '窄 (10mm)',
  marginNormal: '适中 (20mm)',
  marginWide: '宽 (30mm)',
  scaleMode: '缩放填充',
  scaleFit: '完整适应',
  scaleFill: '铺满裁剪',
  scaleOriginal: '原始尺寸',
  followGlobal: '跟随全局',
  imageQuality: '画质与压缩',
  qualityOriginal: '无损原图',
  qualityHigh: '高清 (90%)',
  qualityBalanced: '均衡 (75%)',
  qualityCompact: '轻量 (55%)',
  pageNumbers: '页码标注',
  pageNumNone: '不显示',
  pageNumCenter: '底部居中',
  pageNumRight: '底部居右',
  generatePdf: '合成 PDF',
  editPage: '精修 / 裁剪',
  selectedOverride: '所选页面单独设置',
  applyToSelected: '应用到已选项',
  blankPage: '空白页',
  dropToAppend: '松开鼠标即可追加导入图片',

  editorTitle: '单页精修编辑器',
  tabTransform: '排版与变换',
  tabCrop: '智能裁剪',
  tabEnhance: '画质与去水印',
  filterNone: '原图色彩',
  filterGrayscale: '灰度文档',
  filterBwScan: '黑白扫描',
  filterEnhance: '清晰提亮',
  filterCleanDoc: '洁白文档',
  brightness: '亮度',
  contrast: '对比度',
  cropFree: '自由比例',
  cropReset: '恢复全图',
  cropHint: '拖拽边框或四角微调，支持一键自动切白边',
  prevPage: '上一页',
  nextPage: '下一页',
  applyFilterToAll: '同步当前本地增强至全部图片',
  filterAppliedAll: '已将画质增强参数同步应用至全部图片',

  autoTrimOnUpload: '上传自动切白边',
  autoTrimAll: '一键切白边',
  autoTrimSelected: '自动切白边',
  autoTrimDetect: '自动检测白边',
  autoTrimResultToast: '已自动裁剪 {n} 张图片的白边',
  autoTrimNoneFound: '未检测到明显多余白边',
  autoTrimSensitivity: '白边检测敏感度',
  autoTrimPadding: '安全留白',
  restoreCrop: '还原裁剪',
  cropModeRect: '矩形切边',
  cropModePerspective: '四点透视',
  cropModePolygon: '自由多边形',
  perspectiveDetect: '自动识别四角',
  perspectiveReset: '重置四角',
  perspectiveHint: '拖动 4 个角点贴合倾斜文档边缘，拖动时自动开启 2.5× 放大镜',
  perspectiveApply: '应用透视拉正',
  polygonInitQuad: '从四角初始化',
  polygonUndoPoint: '撤销顶点',
  polygonClear: '清空重描',
  polygonCloseShape: '闭合选区',
  polygonFillLabel: '选区外背景填充',
  polygonFillWhite: '纯白纸底',
  polygonFillTransparent: '透明背景',
  polygonHint: '点击画面逐点描边，点击首点闭合；拖拽顶点调整，点击边中点插点，右键删点',
  polygonPointsCount: '顶点数',
  polygonApply: '应用不规则裁剪',
  tagAutoTrim: '已切白边',
  tagPerspective: '透视拉正',
  tagPolygon: '多边形',
  tagCropped: '已裁剪',
  tagSharpen: '锐化',
  tagHd: '2×高清',
  tagDeWatermark: '去水印',
  tagAi: 'AI修复',

  localEngineTitle: '本地极速增强（离线零等待）',
  sharpen: '文字锐化',
  denoiseShadow: '去阴影 / 纸底漂白',
  localUpscale: '本地 2× 高清超分',
  localUpscaleDesc: '平滑放大并压实模糊文字笔画',
  localWatermark: '本地去浅色水印',
  watermarkStrength: '去水印强度',
  removeColorStamps: '同时剔除彩色印章 / 淡彩底纹',
  eraserBrush: '手动擦除画笔',
  eraserBrushActive: '退出擦除画笔',
  eraserBrushHint: '按住左键涂抹局部残余水印或污渍，自动按周围纸底修复',
  brushSize: '画笔粗细',
  undoStroke: '撤销一笔',
  clearStrokes: '清空涂抹',
  compareBeforeAfter: '前后分屏对比',
  beforeLabel: '处理前',
  afterLabel: '处理后',

  aiEngineTitle: 'AI 深度修复（Gemini 图像引擎）',
  aiEngineNote: '针对复杂文字水印与严重模糊照片，需在 Settings > Secrets 配置付费 API Key',
  aiWatermarkBtn: 'AI 深度去水印',
  aiHdBtn: 'AI 超清重建 2K',
  aiBothBtn: 'AI 去水印 + 超清',
  aiProcessingWatermark: '正在执行 AI 深度去水印...',
  aiProcessingHd: '正在执行 AI 超清文字重建 (2K)...',
  aiProcessingBoth: '正在执行 AI 去水印与超清修复...',
  aiAcceptResult: '采用 AI 结果',
  aiDiscardResult: '放弃',
  aiLayerActive: '已启用 AI 修复层',
  aiLayerPaused: '暂看本地版本',
  aiRemoveLayer: '移除 AI 层',
  aiKeyMissingTip: '尚未配置 Gemini API Key。请在 Settings > Secrets 中填写 GEMINI_API_KEY 后再使用 AI 深度修复，当前可先使用上方免费的本地去水印与本地 2× 高清。',
  aiKeyInvalidTip: 'Gemini API Key 无效或权限不足，请在 Settings > Secrets 检查您的付费密钥。',
  aiQuotaTip: '当前 API 配额不足或需要付费密钥，请在 Settings > Secrets 检查密钥状态。',
  aiDoneToast: 'AI 修复完成，可拖动中线对比效果后点击采用',

  batchEnhance: '批量增强',
  batchCleanDoc: '洁白文档 + 文字锐化',
  batchBwScan: '黑白高反差扫描',
  batchLocalWatermark: '本地去浅色水印',
  batchLocalHd: '开启本地 2× 高清',
  batchResetEnhance: '重置画质增强',
  batchAiAction: '批量 AI 修复',
  batchAiProgress: '正在批量 AI 修复 {cur} / {total}',
  batchAiStop: '停止剩余',
  batchEnhancedToast: '已对选中图片应用批量增强',

  extractTitle: '可视化页面提取与重排',
  extractAction: '提取并生成 PDF',
  pageRangeLabel: '页码范围表达式',
  pageRangePlaceholder: '例如：1, 3, 5-10（与左侧点击实时联动）',
  selectOdd: '奇数页',
  selectEven: '偶数页',
  resetOrder: '恢复原顺序',
  dragToReorderHint: '支持拖拽卡片调整导出顺序、点击多选或 Shift 连选',
  keepCustomOrder: '按当前可视化排序导出',
  sourcePages: '原文档总页数',
  selectedPagesCount: '已选导出页数',
  inspectPage: '放大查看',
  loadingPages: '正在解析文档缩略图...',

  sliceTitle: '长图 / 宽图 PDF 打印分页',
  sliceAction: '生成分页 PDF',
  tabBlueprint: '分割线蓝图预览',
  tabOutput: '分页成品预览',
  sliceDirection: '分割模式',
  dirAuto: '自动识别',
  dirVertical: '纵向长图',
  dirHorizontal: '横向宽图',
  dirGrid: '二维网格海报',
  scaleToFit: '等比缩放贴合纸张',
  scaleToFitDesc: '自动缩放宽度或高度以填满目标纸张内容区',
  sliceMargin: '打印页边距',
  sliceOverlap: '拼接重叠区 (出血)',
  sliceOverlapDesc: '相邻分页保留重叠内容，方便打印后对齐粘贴',
  showCutMarks: '打印角标裁切线',
  showCutMarksDesc: '在分页四角添加细微定位线便于裁剪拼接',
  estimatedOutput: '预计分页结果',
  sourceDimensions: '原始页面尺寸',
  sourcePageSelect: '预览原页',
  noSliceOutputYet: '点击右侧「生成分页 PDF」查看成品',
  noSliceOutputDesc: '当前可在「分割线蓝图预览」中实时调整参数并观察虚线分割位置',
  zoomFit: '适应宽度',
};

const en: Dictionary = {
  appName: 'PDF Studio',
  modeImageToPdf: 'Images to PDF',
  modeExtract: 'Extract & Organize',
  modeSlice: 'Long Format Slicer',

  uploadPdf: 'Select PDF File',
  replacePdf: 'Replace File',
  dropPdfHere: 'Drop your PDF here, or click to browse',
  dropPdfHint: '100% local browser processing · Files never leave your device · Fast multi-page preview',
  dropImagesHere: 'Drop images here, or click to batch import',
  dropImagesHint: 'Supports JPG · PNG · WebP · GIF · BMP · Effortlessly organize 50+ images at once',
  addImages: 'Add Images',
  addMore: 'Add More',
  insertBlankPage: 'Blank Page',
  clearAll: 'Clear All',
  processing: 'Generating...',
  downloadPdf: 'Download PDF',
  previewResult: 'Preview Output',
  close: 'Close',
  cancel: 'Cancel',
  apply: 'Apply',
  reset: 'Reset',
  save: 'Done',
  delete: 'Delete',
  duplicate: 'Duplicate',
  rotateLeft: 'Rotate Left 90°',
  rotateRight: 'Rotate Right 90°',
  flipH: 'Flip Horizontal',
  flipV: 'Flip Vertical',
  pagesUnit: 'pages',
  itemsSelected: '{n} selected',
  outputFilename: 'Output Filename',
  readyToDownload: 'Ready',
  generatedSuccess: 'PDF generated successfully — ready to preview or download',
  processError: 'Failed to process file. Please check the file format.',
  invalidPagesInfo: 'Please select at least 1 valid page.',
  undo: 'Undo',
  redo: 'Redo',
  searchFiles: 'Filter by filename...',
  noSearchMatch: 'No matching images found',

  sort: 'Sort',
  sortNameAsc: 'Filename A → Z (Natural)',
  sortNameDesc: 'Filename Z → A',
  sortTimeAsc: 'Date Modified: Oldest',
  sortTimeDesc: 'Date Modified: Newest',
  sortSizeDesc: 'File Size: Largest',
  sortReverse: 'Reverse Current Order',
  selectAll: 'Select All',
  deselectAll: 'Deselect',
  invertSelection: 'Invert',
  moveToPosition: 'Move to Page #',
  moveToStart: 'Move to Start',
  moveToEnd: 'Move to End',
  targetPosition: 'Target Page Position',
  viewCompact: 'Compact Grid',
  viewStandard: 'Standard Grid',
  viewLarge: 'Large Grid',
  viewList: 'List View',
  pageSetup: 'Global Page Setup',
  paperSize: 'Paper Size',
  paperAuto: 'Match Image',
  orientation: 'Orientation',
  oriAuto: 'Auto Match',
  oriPortrait: 'Portrait',
  oriLandscape: 'Landscape',
  margins: 'Margins',
  marginNone: 'None',
  marginNarrow: 'Narrow (10mm)',
  marginNormal: 'Normal (20mm)',
  marginWide: 'Wide (30mm)',
  scaleMode: 'Image Fit',
  scaleFit: 'Fit Inside',
  scaleFill: 'Fill & Crop',
  scaleOriginal: 'Original Size',
  followGlobal: 'Use Global',
  imageQuality: 'Compression',
  qualityOriginal: 'Lossless',
  qualityHigh: 'High (90%)',
  qualityBalanced: 'Balanced (75%)',
  qualityCompact: 'Compact (55%)',
  pageNumbers: 'Page Numbers',
  pageNumNone: 'None',
  pageNumCenter: 'Bottom Center',
  pageNumRight: 'Bottom Right',
  generatePdf: 'Build PDF',
  editPage: 'Edit / Crop',
  selectedOverride: 'Selected Page Overrides',
  applyToSelected: 'Apply to Selection',
  blankPage: 'Blank Page',
  dropToAppend: 'Drop images anywhere to append',

  editorTitle: 'Page Studio Editor',
  tabTransform: 'Layout & Transform',
  tabCrop: 'Smart Crop',
  tabEnhance: 'Enhance & Clean',
  filterNone: 'Original',
  filterGrayscale: 'Grayscale',
  filterBwScan: 'B&W Scan',
  filterEnhance: 'Crisp Boost',
  filterCleanDoc: 'Clean Paper',
  brightness: 'Brightness',
  contrast: 'Contrast',
  cropFree: 'Freeform',
  cropReset: 'Reset Crop',
  cropHint: 'Drag edges or corners to crop, or auto-trim white borders',
  prevPage: 'Previous',
  nextPage: 'Next',
  applyFilterToAll: 'Sync local enhancements to all pages',
  filterAppliedAll: 'Enhancement settings synced to all images',

  autoTrimOnUpload: 'Auto-Trim White Borders',
  autoTrimAll: 'Auto-Trim All',
  autoTrimSelected: 'Auto-Trim Borders',
  autoTrimDetect: 'Detect White Borders',
  autoTrimResultToast: 'Auto-trimmed white borders on {n} image(s)',
  autoTrimNoneFound: 'No excess white borders detected',
  autoTrimSensitivity: 'Border Sensitivity',
  autoTrimPadding: 'Safe Margin',
  restoreCrop: 'Restore Crop',
  cropModeRect: 'Rect Trim',
  cropModePerspective: '4-Pt Deskew',
  cropModePolygon: 'Free Polygon',
  perspectiveDetect: 'Auto-Detect Corners',
  perspectiveReset: 'Reset Corners',
  perspectiveHint: 'Drag 4 corners onto the document edges — 2.5× magnifier activates while dragging',
  perspectiveApply: 'Apply Deskew',
  polygonInitQuad: 'Init from 4 Corners',
  polygonUndoPoint: 'Undo Point',
  polygonClear: 'Clear Points',
  polygonCloseShape: 'Close Shape',
  polygonFillLabel: 'Outside Fill',
  polygonFillWhite: 'White Paper',
  polygonFillTransparent: 'Transparent',
  polygonHint: 'Click to place vertices, click first point to close; drag vertices, click edge midpoints to insert, right-click to delete',
  polygonPointsCount: 'Vertices',
  polygonApply: 'Apply Polygon Crop',
  tagAutoTrim: 'Trimmed',
  tagPerspective: 'Deskewed',
  tagPolygon: 'Polygon',
  tagCropped: 'Cropped',
  tagSharpen: 'Sharp',
  tagHd: '2× HD',
  tagDeWatermark: 'Clean WM',
  tagAi: 'AI',

  localEngineTitle: 'Local Fast Engine (Instant · Offline)',
  sharpen: 'Text Sharpen',
  denoiseShadow: 'Shadow / Paper Bleaching',
  localUpscale: 'Local 2× HD Upscale',
  localUpscaleDesc: 'Smooth 2× upscale with crisp text edge contrast',
  localWatermark: 'Local Light Watermark Removal',
  watermarkStrength: 'Removal Strength',
  removeColorStamps: 'Also suppress colored stamps & grids',
  eraserBrush: 'Manual Healing Brush',
  eraserBrushActive: 'Exit Healing Brush',
  eraserBrushHint: 'Paint over residual watermarks or marks to heal with surrounding paper tone',
  brushSize: 'Brush Size',
  undoStroke: 'Undo Stroke',
  clearStrokes: 'Clear Strokes',
  compareBeforeAfter: 'Before / After Split',
  beforeLabel: 'Before',
  afterLabel: 'After',

  aiEngineTitle: 'AI Deep Restoration (Gemini Vision)',
  aiEngineNote: 'For heavy text watermarks & blurry photos. Requires GEMINI_API_KEY in Settings > Secrets.',
  aiWatermarkBtn: 'AI Remove Watermark',
  aiHdBtn: 'AI HD Rebuild 2K',
  aiBothBtn: 'AI Watermark + HD',
  aiProcessingWatermark: 'Running AI deep watermark removal...',
  aiProcessingHd: 'Rebuilding ultra-crisp 2K text...',
  aiProcessingBoth: 'Running AI watermark removal & 2K HD...',
  aiAcceptResult: 'Apply AI Result',
  aiDiscardResult: 'Discard',
  aiLayerActive: 'AI Layer Active',
  aiLayerPaused: 'Viewing Local Layer',
  aiRemoveLayer: 'Remove AI Layer',
  aiKeyMissingTip: 'GEMINI_API_KEY is not configured yet. Add your key in Settings > Secrets to enable AI restoration, or use the free local watermark & 2× HD tools above.',
  aiKeyInvalidTip: 'Gemini API key is invalid or lacks permission. Please verify it in Settings > Secrets.',
  aiQuotaTip: 'API quota exceeded or billing-enabled key required. Please check Settings > Secrets.',
  aiDoneToast: 'AI restoration ready — drag the divider to compare, then click Apply',

  batchEnhance: 'Batch Enhance',
  batchCleanDoc: 'Clean Paper + Sharpen',
  batchBwScan: 'B&W High-Contrast Scan',
  batchLocalWatermark: 'Remove Light Watermark',
  batchLocalHd: 'Enable Local 2× HD',
  batchResetEnhance: 'Reset Enhancements',
  batchAiAction: 'Batch AI Restore',
  batchAiProgress: 'Batch AI restoring {cur} / {total}',
  batchAiStop: 'Stop Remaining',
  batchEnhancedToast: 'Batch enhancement applied to selected images',

  extractTitle: 'Visual Page Organizer & Extractor',
  extractAction: 'Extract PDF',
  pageRangeLabel: 'Page Range Expression',
  pageRangePlaceholder: 'e.g. 1, 3, 5-10 (synced with thumbnail clicks)',
  selectOdd: 'Odd',
  selectEven: 'Even',
  resetOrder: 'Reset Order',
  dragToReorderHint: 'Drag thumbnails to reorder · Click or Shift+Click to multi-select',
  keepCustomOrder: 'Export in visual order',
  sourcePages: 'Total Source Pages',
  selectedPagesCount: 'Selected to Export',
  inspectPage: 'Zoom Inspect',
  loadingPages: 'Rendering page thumbnails...',

  sliceTitle: 'Long / Wide PDF Print Tiler',
  sliceAction: 'Slice PDF',
  tabBlueprint: 'Cut-Line Blueprint',
  tabOutput: 'Paginated Output',
  sliceDirection: 'Slicing Mode',
  dirAuto: 'Auto',
  dirVertical: 'Vertical Roll',
  dirHorizontal: 'Horizontal Strip',
  dirGrid: '2D Poster Grid',
  scaleToFit: 'Scale to fit paper edge',
  scaleToFitDesc: 'Proportionally fit width or height to the printable area',
  sliceMargin: 'Print Margin',
  sliceOverlap: 'Tile Overlap (Bleed)',
  sliceOverlapDesc: 'Repeat edge strips on adjacent pages for easy taping',
  showCutMarks: 'Corner Alignment Marks',
  showCutMarksDesc: 'Draw subtle alignment marks at tile corners',
  estimatedOutput: 'Estimated Output',
  sourceDimensions: 'Source Page Size',
  sourcePageSelect: 'Preview Source Page',
  noSliceOutputYet: 'Click "Slice PDF" to generate paginated output',
  noSliceOutputDesc: 'Preview live dashed cut lines in the Blueprint tab while adjusting parameters',
  zoomFit: 'Fit Width',
};

// Other languages fall back cleanly to English for newly added advanced labels while preserving localized primary UI
const ja: Dictionary = {
  ...en,
  appName: 'PDF スタジオ',
  modeImageToPdf: '画像から PDF',
  modeExtract: 'ページ抽出・整理',
  modeSlice: '長尺 PDF 分割',
  uploadPdf: 'PDF ファイルを選択',
  replacePdf: 'ファイルを変更',
  dropPdfHere: 'PDF をここにドロップ、またはクリックして選択',
  dropImagesHere: '画像をここにドロップ、またはクリックして追加',
  addImages: '画像を追加',
  insertBlankPage: '空白ページ',
  clearAll: 'すべてクリア',
  processing: '処理中...',
  downloadPdf: 'PDF をダウンロード',
  previewResult: 'プレビュー',
  generatePdf: 'PDF を作成',
  extractAction: 'PDF を抽出',
  sliceAction: 'PDF を分割',
  pageSetup: 'ページ設定',
  paperSize: '用紙サイズ',
  orientation: '用紙の向き',
  oriPortrait: '縦',
  oriLandscape: '横',
  oriAuto: '自動',
  sort: '並び替え',
  selectAll: 'すべて選択',
  deselectAll: '選択解除',
};

const ko: Dictionary = {
  ...en,
  appName: 'PDF 스튜디오',
  modeImageToPdf: '이미지를 PDF로',
  modeExtract: '페이지 추출 및 정리',
  modeSlice: '긴 PDF 분할',
  uploadPdf: 'PDF 파일 선택',
  replacePdf: '파일 변경',
  dropPdfHere: '여기에 PDF를 놓거나 클릭하여 선택',
  dropImagesHere: '여기에 이미지를 놓거나 클릭하여 추가',
  addImages: '이미지 추가',
  insertBlankPage: '빈 페이지',
  clearAll: '모두 지우기',
  processing: '처리 중...',
  downloadPdf: 'PDF 다운로드',
  previewResult: '미리보기',
  generatePdf: 'PDF 생성',
  extractAction: 'PDF 추출',
  sliceAction: 'PDF 분할',
  pageSetup: '페이지 설정',
  paperSize: '용지 크기',
  orientation: '용지 방향',
  oriPortrait: '세로',
  oriLandscape: '가로',
  oriAuto: '자동',
  sort: '정렬',
  selectAll: '전체 선택',
  deselectAll: '선택 해제',
};

const es: Dictionary = {
  ...en,
  appName: 'PDF Studio',
  modeImageToPdf: 'Imágenes a PDF',
  modeExtract: 'Extraer y Organizar',
  modeSlice: 'Dividir PDF Largo',
  uploadPdf: 'Seleccionar PDF',
  dropPdfHere: 'Suelta tu PDF aquí o haz clic para buscar',
  dropImagesHere: 'Suelta imágenes aquí o haz clic para importar',
  addImages: 'Añadir imágenes',
  downloadPdf: 'Descargar PDF',
  generatePdf: 'Crear PDF',
  extractAction: 'Extraer PDF',
  sliceAction: 'Dividir PDF',
};

const fr: Dictionary = {
  ...en,
  appName: 'PDF Studio',
  modeImageToPdf: 'Images en PDF',
  modeExtract: 'Extraire et Organiser',
  modeSlice: 'Découper PDF Long',
  uploadPdf: 'Choisir un PDF',
  dropPdfHere: 'Déposez votre PDF ici ou cliquez pour parcourir',
  dropImagesHere: 'Déposez des images ici ou cliquez pour importer',
  addImages: 'Ajouter des images',
  downloadPdf: 'Télécharger le PDF',
  generatePdf: 'Créer le PDF',
  extractAction: 'Extraire le PDF',
  sliceAction: 'Découper le PDF',
};

const de: Dictionary = {
  ...en,
  appName: 'PDF Studio',
  modeImageToPdf: 'Bilder zu PDF',
  modeExtract: 'Seiten extrahieren',
  modeSlice: 'PDF schneiden',
  uploadPdf: 'PDF auswählen',
  dropPdfHere: 'PDF hier ablegen oder klicken',
  dropImagesHere: 'Bilder hier ablegen oder klicken',
  addImages: 'Bilder hinzufügen',
  downloadPdf: 'PDF herunterladen',
  generatePdf: 'PDF erstellen',
  extractAction: 'PDF extrahieren',
  sliceAction: 'PDF schneiden',
};

export const dictionaries: Record<Language, Dictionary> = {
  zh,
  en,
  ja,
  ko,
  es,
  fr,
  de,
};

export function getDefaultLanguage(): Language {
  const browserLang = (navigator.language || 'zh').split('-')[0].toLowerCase();
  const supported: Language[] = ['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de'];
  if (supported.includes(browserLang as Language)) {
    return browserLang as Language;
  }
  return 'zh';
}
