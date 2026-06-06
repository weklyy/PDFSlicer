import { PDFDocument } from 'pdf-lib';

export const A4_PORTRAIT = { width: 595.28, height: 841.89 };
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

export interface SplitOptions {
  direction: 'auto' | 'horizontal' | 'vertical';
  scaleToFit: boolean;
  paperOrientation: 'portrait' | 'landscape';
}

export async function getPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
}

export function parsePageNumbers(input: string, maxPage: number): number[] {
  const pages = new Set<number>();
  
  // Normalize input: 
  // Replace fullwidth comma, enumeration comma, semicolons, and spaces with standard comma
  // Replace fullwidth hyphens, tildes, em dashes with standard hyphen
  const normalizedInput = input
    .replace(/[，、；;\s]/g, ',')
    .replace(/[－—~～]/g, '-');

  const parts = normalizedInput.split(',').filter(Boolean);
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr, ...rest] = part.split('-');
      // Ignore if it's malformed like "1-2-3"
      if (rest.length > 0) continue; 
      
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          if (i > 0 && i <= maxPage) pages.add(i);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num > 0 && num <= maxPage) {
        pages.add(num);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export async function extractPdfPages(file: File, pagesString: string): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  const outPdf = await PDFDocument.create();
  const totalPages = pdfDoc.getPageCount();
  
  const pagesToKeep = parsePageNumbers(pagesString, totalPages);
  
  if (pagesToKeep.length === 0) {
    throw new Error("No valid pages selected.");
  }
  
  const indices = pagesToKeep.map(p => p - 1);
  const copiedPages = await outPdf.copyPages(pdfDoc, indices);
  
  copiedPages.forEach(page => outPdf.addPage(page));
  
  const pdfBytes = await outPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

export async function processPdf(file: File, options: SplitOptions): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  const outPdf = await PDFDocument.create();
  
  const pages = pdfDoc.getPages();
  const a4Size = options.paperOrientation === 'portrait' ? A4_PORTRAIT : A4_LANDSCAPE;
  
  for (const page of pages) {
    const { width, height } = page.getSize();
    
    let dir = options.direction;
    if (dir === 'auto') {
      dir = width > height ? 'horizontal' : 'vertical';
    }
    
    const embeddedPage = await outPdf.embedPage(page);
    
    if (dir === 'horizontal') {
      let scale = 1;
      if (options.scaleToFit) {
        scale = a4Size.height / height;
      }
      
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const numPages = Math.ceil(scaledWidth / a4Size.width);
      
      for (let i = 0; i < numPages; i++) {
        const newPage = outPdf.addPage([a4Size.width, a4Size.height]);
        newPage.drawPage(embeddedPage, {
          x: -i * a4Size.width,
          y: a4Size.height - scaledHeight, // Top align
          width: scaledWidth,
          height: scaledHeight
        });
      }
    } else {
      let scale = 1;
      if (options.scaleToFit) {
        scale = a4Size.width / width;
      }
      
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const numPages = Math.ceil(scaledHeight / a4Size.height);
      
      for (let i = 0; i < numPages; i++) {
        const newPage = outPdf.addPage([a4Size.width, a4Size.height]);
        newPage.drawPage(embeddedPage, {
          x: 0, // Left align
          y: a4Size.height - scaledHeight + (i * a4Size.height),
          width: scaledWidth,
          height: scaledHeight
        });
      }
    }
  }
  
  const pdfBytes = await outPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}
