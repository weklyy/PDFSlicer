# PDF Toolbox (PDF 工具箱)

A versatile, client-side web application for managing and editing PDF files and images. Built with React, Tailwind CSS, and `pdf-lib`, this tool ensures that your files are processed locally in your browser, guaranteeing privacy and fast performance.

一个多功能的纯客户端 Web 应用程序，用于管理和编辑 PDF 文件和图像。基于 React、Tailwind CSS 和 `pdf-lib` 构建，所有文件均在浏览器本地处理，保障隐私并提供极快的处理速度。

## Features (功能特性)

### ✂️ Slice PDF (分割 PDF)
Split exceptionally long or wide PDFs (like long web page screenshots, diagrams, or charts) into standard A4 pages for easy printing.
将超长或超宽的 PDF（如长网页截图、图表、心电图等）分割成标准 A4 页面以便打印。
- **Auto/Horizontal/Vertical Slicing (自动/水平/垂直分割):** Automatically detect the best way to slice or force a specific direction. (自动检测最佳分割方式或强制指定方向。)
- **Paper Orientation (纸张方向):** Choose between Portrait or Landscape A4 pages. (选择纵向或横向 A4 页面。)
- **Scale to Fit (缩放以适应):** Optionally scale the content to fit the standard width/height of the paper. (可选择缩放内容以适应纸张的标准宽度/高度。)

### 📄 Extract Pages (提取页面)
Extract specific pages from a multi-page PDF document.
从多页 PDF 文档中提取特定页面。
- **Page Selection (页面选择):** Enter a comma-separated list or ranges of pages to extract (e.g., `1, 3, 5-10`). (输入要提取的页码或范围，例如 `1, 3, 5-10`。)
- **Live Preview (实时预览):** See a preview of the extracted pages before downloading. (在下载之前查看提取页面的预览。)

### 🖼️ Image to PDF (图片转 PDF)
Combine multiple images into a single PDF document with a WYSIWYG (What You See Is What You Get) editor.
通过所见即所得 (WYSIWYG) 的编辑器将多张图片合成一个 PDF 文档。
- **Drag & Drop Reordering (拖拽排序):** Easily rearrange the order of your pages. (轻松拖拽调整页面顺序。)
- **Insert & Add (插入与添加):** Add new images at the end or insert them between existing pages. (在末尾添加新图片或在现有页面之间插入图片。)
- **Image Controls (图片控制):** 
  - **Scale (缩放):** Fit to page, fill page, or keep the original size. (适应页面、填满页面或保持原始尺寸。)
  - **Rotate (旋转):** Rotate images in 90-degree increments. (以 90 度为增量旋转图片。)
  - **Delete (删除):** Remove specific images from the document. (从文档中移除特定的图片。)
- **Page Preview (页面预览):** Visually see how the image will be placed on the A4 page. (直观地查看图片在 A4 纸上的排版效果。)

## Tech Stack (技术栈)
- **React:** UI Framework (UI 框架)
- **Tailwind CSS:** Styling (样式)
- **pdf-lib:** Client-side PDF manipulation (客户端 PDF 操作)
- **react-pdf:** PDF preview rendering (PDF 预览渲染)
- **@hello-pangea/dnd:** Drag-and-drop reordering (拖拽排序)

## Running Locally (本地运行)

1. Clone the repository. (克隆仓库)
2. Install dependencies: (安装依赖)
   ```bash
   npm install
   ```
3. Start the development server: (启动开发服务器)
   ```bash
   npm run dev
   ```
4. Open the application in your browser. (在浏览器中打开应用程序)
