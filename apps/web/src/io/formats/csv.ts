/**
 * CSV Export
 *
 * Export scene results to CSV format for data analysis.
 * Re-exports from the existing export.ts module and adds download functionality.
 */

import { buildCsv, type SceneResults } from '../../export.js';
import { downloadBlob } from './png.js';

// Re-export types and buildCsv from existing module
export { buildCsv, type SceneResults, type ReceiverResult, type PanelResult, type PanelSample } from '../../export.js';

/**
 * CSV export options
 */
export type CsvExportOptions = {
  /** Custom filename (without extension) */
  filename?: string;
  /** Include BOM for Excel compatibility */
  includeBom?: boolean;
};

/**
 * Export results to CSV and trigger download
 *
 * @param results - Scene results to export
 * @param options - Export options
 */
export function downloadCsv(
  results: SceneResults,
  options: CsvExportOptions = {}
): void {
  const { filename = 'geonoise-results', includeBom = false } = options;

  const csvContent = buildCsv(results);
  const content = includeBom ? '\uFEFF' + csvContent : csvContent;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });

  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Convert results to CSV string
 *
 * @param results - Scene results
 * @returns CSV string
 */
export function resultsToCsv(results: SceneResults): string {
  return buildCsv(results);
}

/**
 * Create a CSV blob from results
 *
 * @param results - Scene results
 * @param includeBom - Include BOM for Excel
 * @returns Blob containing CSV data
 */
export function resultsToCsvBlob(results: SceneResults, includeBom = false): Blob {
  const csvContent = buildCsv(results);
  const content = includeBom ? '\uFEFF' + csvContent : csvContent;
  return new Blob([content], { type: 'text/csv;charset=utf-8' });
}
