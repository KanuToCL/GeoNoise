/**
 * Types and router interfaces for engine backends
 */

import type { Engine } from '@geonoise/engine';
import type { ComputePreference, BackendId } from '@geonoise/shared';

export interface BackendEntry {
  id: BackendId;
  engine: Engine;
  capabilityScore?: number; // heuristic
}

export interface BackendRouterOptions {
  defaultPreference?: ComputePreference;
}
