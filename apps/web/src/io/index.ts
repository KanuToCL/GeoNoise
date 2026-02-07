/**
 * I/O Module Barrel Exports
 *
 * Re-exports all I/O functionality from a single entry point.
 */

// Types
export {
  type PropagationConfig,
  type ScenePayload,
  type ValidationResult,
} from './types.js';

// Serialization
export {
  type SceneData,
  buildScenePayload,
  serializeScene,
  generateFilename,
  downloadScene,
} from './serialize.js';

// Deserialization
export {
  PROBE_DEFAULT_Z,
  type DeserializedScene,
  type ParseResult,
  validatePayload,
  nextSequence,
  deserializeScene,
  parseSceneJson,
  calculateSequences,
} from './deserialize.js';

// Import handling
export {
  type ImportResult,
  openSceneFile,
  loadSceneFile,
  loadFromDrop,
  loadSceneFromUrl,
  isValidSceneFile,
} from './import.js';

// Format exports
export {
  // PNG
  type PngExportOptions,
  downloadCanvasPng,
  canvasToPngBlob,
  downloadBlob,
  // PDF
  type PdfExportOptions,
  type PdfResultData,
  isPdfSupported,
  exportToPdf,
  // CSV
  type CsvExportOptions,
  type SceneResults,
  type ReceiverResult,
  type PanelResult,
  type PanelSample,
  buildCsv,
  downloadCsv,
  resultsToCsv,
  resultsToCsvBlob,
} from './formats/index.js';
