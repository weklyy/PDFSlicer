import { PDFDocument } from 'pdf-lib';

export const A4_PORTRAIT = { width: 595.28, height: 841.89 };
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

export interface SplitOptions {
  direction: 'auto' | 'horizontal' | 'vertical';
  scaleToFit: boolean;
  paperOrientation: 'portrait' | 'landscape';
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
