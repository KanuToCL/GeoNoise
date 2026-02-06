/**
 * PDF Export
 *
 * Export scene and results to PDF format.
 * Note: Requires jsPDF library to be available.
 */

import { canvasToPngBlob } from './png.js';

/**
 * PDF export options
 */
export type PdfExportOptions = {
  /** Document title */
  title?: string;
  /** Include canvas snapshot */
  includeCanvas?: boolean;
  /** Include results table */
  includeResults?: boolean;
  /** Page orientation */
  orientation?: 'portrait' | 'landscape';
  /** Paper size */
  paperSize?: 'a4' | 'letter';
  /** Custom filename (without extension) */
  filename?: string;
};

/**
 * Result data for PDF export
 */
export type PdfResultData = {
  receivers: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    LAeq: number;
  }>;
  panels: Array<{
    panelId: string;
    sampleCount: number;
    LAeq_min: number;
    LAeq_max: number;
    LAeq_avg: number;
  }>;
};

/**
 * Check if jsPDF is available
 */
export function isPdfSupported(): boolean {
  return typeof window !== 'undefined' && 'jspdf' in window;
}

/**
 * Export to PDF using jsPDF
 *
 * @param canvas - Canvas element for snapshot
 * @param results - Result data to include
 * @param options - Export options
 * @returns Promise resolving when export is complete
 */
export async function exportToPdf(
  canvas: HTMLCanvasElement | null,
  results: PdfResultData | null,
  options: PdfExportOptions = {}
): Promise<void> {
  if (!isPdfSupported()) {
    throw new Error('PDF export requires jsPDF library');
  }

  const {
    title = 'GeoNoise Report',
    includeCanvas = true,
    includeResults = true,
    orientation = 'landscape',
    paperSize = 'a4',
    filename = 'geonoise-report',
  } = options;

  // Dynamic import to avoid bundling jsPDF when not used
  // Access jsPDF from window object (loaded via CDN)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsPDF = (window as any).jspdf.jsPDF;
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: paperSize,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let yOffset = 20;

  // Title
  doc.setFontSize(18);
  doc.text(title, pageWidth / 2, yOffset, { align: 'center' });
  yOffset += 15;

  // Canvas snapshot
  if (includeCanvas && canvas) {
    const blob = await canvasToPngBlob(canvas, { backgroundColor: '#1a1a1a' });
    if (blob) {
      const dataUrl = await blobToDataUrl(blob);
      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;
      doc.addImage(dataUrl, 'PNG', 20, yOffset, imgWidth, imgHeight);
      yOffset += imgHeight + 10;
    }
  }

  // Results table
  if (includeResults && results) {
    doc.setFontSize(12);
    doc.text('Receiver Results', 20, yOffset);
    yOffset += 8;

    doc.setFontSize(9);
    for (const receiver of results.receivers) {
      if (yOffset > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yOffset = 20;
      }
      const line = `${receiver.id}: (${receiver.x.toFixed(1)}, ${receiver.y.toFixed(1)}) → ${receiver.LAeq.toFixed(1)} dB(A)`;
      doc.text(line, 25, yOffset);
      yOffset += 5;
    }

    if (results.panels.length > 0) {
      yOffset += 5;
      doc.setFontSize(12);
      doc.text('Panel Results', 20, yOffset);
      yOffset += 8;

      doc.setFontSize(9);
      for (const panel of results.panels) {
        if (yOffset > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          yOffset = 20;
        }
        const line = `${panel.panelId}: ${panel.sampleCount} samples, avg ${panel.LAeq_avg.toFixed(1)} dB(A)`;
        doc.text(line, 25, yOffset);
        yOffset += 5;
      }
    }
  }

  // Save
  doc.save(`${filename}.pdf`);
}

/**
 * Convert Blob to data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
