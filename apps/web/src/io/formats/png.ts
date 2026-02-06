/**
 * PNG Export
 *
 * Export canvas content to PNG image files.
 */

/**
 * Options for PNG export
 */
export type PngExportOptions = {
  /** Image quality (0-1), only used for certain formats */
  quality?: number;
  /** Background color (default: transparent) */
  backgroundColor?: string;
  /** Scale factor for higher resolution output */
  scale?: number;
  /** Custom filename (without extension) */
  filename?: string;
};

/**
 * Export a canvas element to PNG and trigger download
 *
 * @param canvas - The canvas element to export
 * @param options - Export options
 */
export function downloadCanvasPng(
  canvas: HTMLCanvasElement,
  options: PngExportOptions = {}
): void {
  const { filename = 'geonoise-export', scale = 1, backgroundColor } = options;

  let exportCanvas = canvas;

  // Create scaled canvas if needed
  if (scale !== 1 || backgroundColor) {
    exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width * scale;
    exportCanvas.height = canvas.height * scale;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Fill background if specified
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    // Scale and draw original canvas
    ctx.scale(scale, scale);
    ctx.drawImage(canvas, 0, 0);
  }

  // Convert to data URL and download
  const dataUrl = exportCanvas.toDataURL('image/png');
  triggerDownload(dataUrl, `${filename}.png`);
}

/**
 * Export canvas to PNG blob for further processing
 *
 * @param canvas - The canvas element to export
 * @param options - Export options
 * @returns Promise resolving to Blob
 */
export function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  options: PngExportOptions = {}
): Promise<Blob | null> {
  const { scale = 1, backgroundColor } = options;

  return new Promise((resolve) => {
    let exportCanvas = canvas;

    if (scale !== 1 || backgroundColor) {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width * scale;
      exportCanvas.height = canvas.height * scale;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      }

      ctx.scale(scale, scale);
      ctx.drawImage(canvas, 0, 0);
    }

    exportCanvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Trigger a file download from a data URL
 */
function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Trigger a file download from a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
