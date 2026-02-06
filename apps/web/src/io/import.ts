/**
 * File Import Handling
 *
 * Handles file selection and loading for scene imports.
 */

import { parseSceneJson, type ParseResult } from './deserialize.js';

/**
 * Import result with file metadata
 */
export type ImportResult = ParseResult & {
  /** Original filename */
  filename?: string;
  /** File size in bytes */
  fileSize?: number;
};

/**
 * Open a file picker and load a scene file
 *
 * @returns Promise resolving to import result
 */
export function openSceneFile(): Promise<ImportResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ success: false, error: 'No file selected' });
        return;
      }

      const result = await loadSceneFile(file);
      resolve(result);
    });

    // Handle cancel (user closes dialog without selecting)
    input.addEventListener('cancel', () => {
      resolve({ success: false, error: 'File selection cancelled' });
    });

    input.click();
  });
}

/**
 * Load a scene from a File object
 *
 * @param file - File object to load
 * @returns Promise resolving to import result
 */
export async function loadSceneFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    const result = parseSceneJson(text);

    return {
      ...result,
      filename: file.name,
      fileSize: file.size,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read file';
    return {
      success: false,
      error: message,
      filename: file.name,
      fileSize: file.size,
    };
  }
}

/**
 * Load a scene from a dropped file (drag and drop)
 *
 * @param dataTransfer - DataTransfer from drop event
 * @returns Promise resolving to import result or null if no valid file
 */
export async function loadFromDrop(dataTransfer: DataTransfer): Promise<ImportResult | null> {
  const file = dataTransfer.files[0];
  if (!file) return null;

  // Check file type
  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    return { success: false, error: 'Invalid file type. Expected JSON file.' };
  }

  return loadSceneFile(file);
}

/**
 * Load a scene from a URL
 *
 * @param url - URL to fetch scene from
 * @returns Promise resolving to import result
 */
export async function loadSceneFromUrl(url: string): Promise<ImportResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP error: ${response.status}` };
    }

    const text = await response.text();
    const result = parseSceneJson(text);

    // Extract filename from URL
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1] || 'remote-scene.json';

    return {
      ...result,
      filename,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch file';
    return { success: false, error: message };
  }
}

/**
 * Validate that a file is a valid scene file before full parsing
 *
 * @param file - File to validate
 * @returns Promise resolving to true if file appears valid
 */
export async function isValidSceneFile(file: File): Promise<boolean> {
  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    return false;
  }

  try {
    // Read just the first 1KB to check structure
    const slice = file.slice(0, 1024);
    const text = await slice.text();

    // Quick validation: should be JSON object with sources array
    if (!text.startsWith('{')) return false;

    // Try to find "sources" key
    return text.includes('"sources"');
  } catch {
    return false;
  }
}
