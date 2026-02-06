/**
 * Propagation Controls Module
 *
 * UI controls for configuring acoustic propagation settings including:
 * - Spreading loss model
 * - Atmospheric absorption
 * - Ground reflection and ground type
 * - Barrier side diffraction
 * - Calculation profiles (ISO 9613, Accurate, Custom)
 * - Meteorological conditions (temperature, humidity, pressure)
 *
 * Extracted from main.ts for modular architecture.
 */

import type { PropagationConfig } from '@geonoise/core';

// =============================================================================
// TYPES
// =============================================================================

/**
 * DOM elements for propagation controls
 */
export interface PropagationElements {
  spreading: HTMLSelectElement | null;
  absorption: HTMLSelectElement | null;
  groundReflection: HTMLInputElement | null;
  groundModel: HTMLSelectElement | null;
  groundType: HTMLSelectElement | null;
  groundMixedSigmaModel: HTMLSelectElement | null;
  groundMixedSigmaModelRow: HTMLLabelElement | null;
  maxDistance: HTMLInputElement | null;
  groundDetails: HTMLDivElement | null;
  groundHelp: HTMLDivElement | null;
  groundModelHelp: HTMLDivElement | null;
  barrierSideDiffraction: HTMLSelectElement | null;
  calculationProfile: HTMLSelectElement | null;
  profileIndicator: HTMLSpanElement | null;
}

/**
 * DOM elements for meteorological controls
 */
export interface MeteoElements {
  temperature: HTMLInputElement | null;
  humidity: HTMLInputElement | null;
  pressure: HTMLInputElement | null;
}

/**
 * Meteorological state
 */
export interface MeteoState {
  temperature: number;
  humidity: number;
  pressure: number;
}

/**
 * Callbacks for propagation control interactions
 */
export interface PropagationCallbacks {
  getPropagationConfig: () => PropagationConfig;
  updatePropagationConfig: (next: Partial<PropagationConfig>) => void;
  getMeteoState: () => MeteoState;
  setMeteoState: (next: Partial<MeteoState>) => void;
  markDirty: () => void;
  computeScene: () => void;
  updateSpeedOfSoundDisplay: () => void;
  updateAllEquations: () => void;
}

// =============================================================================
// CALCULATION PROFILES
// =============================================================================

export type CalculationProfile = 'iso9613' | 'accurate' | 'custom';

/**
 * Profile settings definition
 */
export interface ProfileSettings {
  spreadingLoss: string;
  groundType: string;
  groundReflection: boolean;
  groundModel: string;
  groundMixedSigmaModel: string;
  barrierSideDiffraction: string;
  atmosphericAbsorption: string;
}

/**
 * ISO 9613-2:1996 compliant profile
 */
export const ISO9613_PROFILE: ProfileSettings = {
  spreadingLoss: 'spherical',
  groundType: 'mixed',
  groundReflection: true,
  groundModel: 'legacy',            // ISO 9613-2 tables
  groundMixedSigmaModel: 'iso9613', // Linear interpolation
  barrierSideDiffraction: 'off',    // ISO assumes infinite barriers (over-top only)
  atmosphericAbsorption: 'iso9613'
};

/**
 * Physically accurate profile with full wave interference
 */
export const ACCURATE_PROFILE: ProfileSettings = {
  spreadingLoss: 'spherical',
  groundType: 'mixed',
  groundReflection: true,
  groundModel: 'twoRayPhasor',      // Full wave interference
  groundMixedSigmaModel: 'logarithmic', // More physically accurate
  barrierSideDiffraction: 'auto',   // Side diffraction for finite barriers
  atmosphericAbsorption: 'iso9613'
};

// =============================================================================
// UPDATE FUNCTIONS
// =============================================================================

/**
 * Update propagation control UI to match current config
 */
export function updatePropagationControls(
  elements: PropagationElements,
  config: PropagationConfig
): void {
  const {
    spreading,
    absorption,
    groundReflection,
    groundModel,
    groundType,
    groundMixedSigmaModel,
    groundMixedSigmaModelRow,
    maxDistance,
    groundDetails,
    groundHelp,
    groundModelHelp,
    barrierSideDiffraction,
  } = elements;

  const groundEnabled = config.groundReflection;

  if (spreading) spreading.value = config.spreading;
  if (absorption) absorption.value = config.atmosphericAbsorption;
  if (groundReflection) groundReflection.checked = groundEnabled;

  if (groundModel) {
    groundModel.value = config.groundModel;
    groundModel.disabled = !groundEnabled;
  }

  if (groundType) {
    groundType.value = config.groundType;
    groundType.disabled = !groundEnabled;
  }

  // Mixed Ground Model dropdown: only visible when ground reflection is enabled AND ground type is "mixed"
  const mixedModelVisible = groundEnabled && config.groundType === 'mixed';
  if (groundMixedSigmaModel) {
    groundMixedSigmaModel.value = config.groundMixedSigmaModel ?? 'iso9613';
    groundMixedSigmaModel.disabled = !mixedModelVisible;
  }
  if (groundMixedSigmaModelRow) {
    groundMixedSigmaModelRow.classList.toggle('is-hidden', !mixedModelVisible);
  }

  if (maxDistance) maxDistance.value = config.maxDistance.toString();

  if (barrierSideDiffraction) {
    barrierSideDiffraction.value = config.barrierSideDiffraction ?? 'auto';
  }

  if (groundDetails) {
    groundDetails.classList.toggle('is-hidden', !groundEnabled);
  }

  if (groundHelp) {
    groundHelp.classList.toggle('is-hidden', !groundEnabled);
  }

  if (groundModelHelp) {
    if (!groundEnabled) {
      groundModelHelp.textContent = '';
    } else if (config.groundModel === 'legacy') {
      groundModelHelp.textContent = 'Best for quick A-weighted maps; does not model interference ripples.';
    } else {
      groundModelHelp.textContent = 'Models interference between direct + reflected sound; results vary by frequency and geometry.';
    }
  }
}

/**
 * Update profile indicator text and styling
 */
export function updateProfileIndicator(
  indicator: HTMLSpanElement | null,
  profile: CalculationProfile
): void {
  if (!indicator) return;

  switch (profile) {
    case 'iso9613':
      indicator.textContent = 'iso 9613-2:1996';
      indicator.classList.remove('is-custom');
      break;
    case 'accurate':
      indicator.textContent = 'physically accurate';
      indicator.classList.remove('is-custom');
      break;
    case 'custom':
      indicator.textContent = 'custom';
      indicator.classList.add('is-custom');
      break;
  }
}

/**
 * Update profile dropdown value and enable/disable custom option
 */
export function updateProfileDropdown(
  dropdown: HTMLSelectElement | null,
  profile: CalculationProfile
): void {
  if (!dropdown) return;

  dropdown.value = profile;

  // Enable/disable Custom option based on current profile
  const customOption = dropdown.querySelector('option[value="custom"]') as HTMLOptionElement | null;
  if (customOption) {
    customOption.disabled = profile !== 'custom';
  }
}

/**
 * Get current settings as a profile object
 */
export function getCurrentSettingsAsProfile(elements: PropagationElements): ProfileSettings {
  return {
    spreadingLoss: elements.spreading?.value ?? 'spherical',
    groundType: elements.groundType?.value ?? 'mixed',
    groundReflection: elements.groundReflection?.checked ?? true,
    groundModel: elements.groundModel?.value ?? 'twoRayPhasor',
    groundMixedSigmaModel: elements.groundMixedSigmaModel?.value ?? 'logarithmic',
    barrierSideDiffraction: elements.barrierSideDiffraction?.value ?? 'auto',
    atmosphericAbsorption: elements.absorption?.value ?? 'iso9613'
  };
}

/**
 * Check if current settings match a target profile
 */
export function settingsMatchProfile(current: ProfileSettings, target: ProfileSettings): boolean {
  return (
    current.spreadingLoss === target.spreadingLoss &&
    current.groundType === target.groundType &&
    current.groundReflection === target.groundReflection &&
    current.groundModel === target.groundModel &&
    current.groundMixedSigmaModel === target.groundMixedSigmaModel &&
    current.barrierSideDiffraction === target.barrierSideDiffraction &&
    current.atmosphericAbsorption === target.atmosphericAbsorption
  );
}

/**
 * Detect which profile the current settings match
 */
export function detectCurrentProfile(elements: PropagationElements): CalculationProfile {
  const current = getCurrentSettingsAsProfile(elements);

  if (settingsMatchProfile(current, ISO9613_PROFILE)) return 'iso9613';
  if (settingsMatchProfile(current, ACCURATE_PROFILE)) return 'accurate';
  return 'custom';
}

// =============================================================================
// WIRING FUNCTION
// =============================================================================

/**
 * Wire up all propagation control event listeners
 *
 * @param elements - DOM elements for propagation controls
 * @param meteoElements - DOM elements for meteo controls
 * @param callbacks - Callback functions for state updates
 */
export function wirePropagationControls(
  elements: PropagationElements,
  meteoElements: MeteoElements,
  callbacks: PropagationCallbacks
): void {
  const {
    spreading,
    absorption,
    groundReflection,
    groundModel,
    groundType,
    groundMixedSigmaModel,
    barrierSideDiffraction,
    calculationProfile,
    profileIndicator,
  } = elements;

  const {
    getPropagationConfig,
    updatePropagationConfig,
    getMeteoState,
    setMeteoState,
    markDirty,
    computeScene,
    updateSpeedOfSoundDisplay,
    updateAllEquations,
  } = callbacks;

  // Early return if no controls present
  if (!spreading && !absorption && !groundReflection && !groundType) {
    return;
  }

  // Initial UI sync
  updatePropagationControls(elements, getPropagationConfig());

  // Track current profile
  let currentProfile: CalculationProfile = detectCurrentProfile(elements);

  // Helper to update profile state from current settings
  const updateProfileFromSettings = () => {
    currentProfile = detectCurrentProfile(elements);
    updateProfileDropdown(calculationProfile, currentProfile);
    updateProfileIndicator(profileIndicator, currentProfile);
  };

  // Helper to apply a profile's settings
  const applyProfile = (profile: ProfileSettings) => {
    // Update DOM elements
    if (spreading) spreading.value = profile.spreadingLoss;
    if (groundType) groundType.value = profile.groundType;
    if (groundReflection) groundReflection.checked = profile.groundReflection;
    if (groundModel) groundModel.value = profile.groundModel;
    if (groundMixedSigmaModel) groundMixedSigmaModel.value = profile.groundMixedSigmaModel;
    if (barrierSideDiffraction) barrierSideDiffraction.value = profile.barrierSideDiffraction;
    if (absorption) absorption.value = profile.atmosphericAbsorption;

    // Update propagation config
    updatePropagationConfig({
      spreading: profile.spreadingLoss as PropagationConfig['spreading'],
      groundType: profile.groundType as PropagationConfig['groundType'],
      groundReflection: profile.groundReflection,
      groundModel: profile.groundModel as PropagationConfig['groundModel'],
      groundMixedSigmaModel: profile.groundMixedSigmaModel as PropagationConfig['groundMixedSigmaModel'],
      barrierSideDiffraction: profile.barrierSideDiffraction as PropagationConfig['barrierSideDiffraction'],
      atmosphericAbsorption: profile.atmosphericAbsorption as PropagationConfig['atmosphericAbsorption']
    });

    // Update all controls UI
    updatePropagationControls(elements, getPropagationConfig());

    // Update all equation displays to match new dropdown values
    updateAllEquations();

    // Recalculate scene with new settings
    markDirty();
    computeScene();
  };

  // Wire individual control change handlers
  spreading?.addEventListener('change', () => {
    updatePropagationConfig({ spreading: spreading.value as PropagationConfig['spreading'] });
    markDirty();
    computeScene();
  });

  absorption?.addEventListener('change', () => {
    updatePropagationConfig({ atmosphericAbsorption: absorption.value as PropagationConfig['atmosphericAbsorption'] });
    markDirty();
    computeScene();
  });

  groundReflection?.addEventListener('change', () => {
    updatePropagationConfig({ groundReflection: groundReflection.checked });
    updatePropagationControls(elements, getPropagationConfig());
    markDirty();
    computeScene();
  });

  groundModel?.addEventListener('change', () => {
    updatePropagationConfig({ groundModel: groundModel.value as PropagationConfig['groundModel'] });
    updatePropagationControls(elements, getPropagationConfig());
    markDirty();
    computeScene();
  });

  barrierSideDiffraction?.addEventListener('change', () => {
    updatePropagationConfig({ barrierSideDiffraction: barrierSideDiffraction.value as PropagationConfig['barrierSideDiffraction'] });
    markDirty();
    computeScene();
  });

  // Wire up profile dropdown change
  calculationProfile?.addEventListener('change', () => {
    const selectedProfile = calculationProfile.value as CalculationProfile;

    if (selectedProfile === 'iso9613') {
      currentProfile = 'iso9613';
      applyProfile(ISO9613_PROFILE);
    } else if (selectedProfile === 'accurate') {
      currentProfile = 'accurate';
      applyProfile(ACCURATE_PROFILE);
    }
    // Custom is not selectable manually - it's auto-detected

    updateProfileDropdown(calculationProfile, currentProfile);
    updateProfileIndicator(profileIndicator, currentProfile);
    markDirty();
    computeScene();
  });

  // Hook into all physics setting changes to detect when profile should switch to Custom
  const profileAffectingControls = [
    spreading,
    groundType,
    groundReflection,
    groundModel,
    groundMixedSigmaModel,
    barrierSideDiffraction,
    absorption
  ];

  for (const control of profileAffectingControls) {
    if (control) {
      control.addEventListener('change', () => {
        // Use setTimeout to ensure the change is processed first
        setTimeout(() => updateProfileFromSettings(), 0);
      });
    }
  }

  // Initialize profile state on load
  updateProfileFromSettings();

  // ================================================================
  // Meteorological Controls
  // ================================================================

  const { temperature, humidity, pressure } = meteoElements;

  temperature?.addEventListener('change', () => {
    const meteo = getMeteoState();
    const next = Number(temperature.value);
    if (!Number.isFinite(next)) {
      temperature.value = String(meteo.temperature);
      return;
    }
    const clamped = Math.max(-10, Math.min(40, next));
    setMeteoState({ temperature: clamped });
    temperature.value = String(clamped);
    updateSpeedOfSoundDisplay();
    markDirty();
    computeScene();
  });

  humidity?.addEventListener('change', () => {
    const meteo = getMeteoState();
    const next = Number(humidity.value);
    if (!Number.isFinite(next)) {
      humidity.value = String(meteo.humidity);
      return;
    }
    const clamped = Math.max(10, Math.min(100, next));
    setMeteoState({ humidity: clamped });
    humidity.value = String(clamped);
    markDirty();
    computeScene();
  });

  pressure?.addEventListener('change', () => {
    const meteo = getMeteoState();
    const next = Number(pressure.value);
    if (!Number.isFinite(next)) {
      pressure.value = String(meteo.pressure);
      return;
    }
    const clamped = Math.max(95, Math.min(108, next));
    setMeteoState({ pressure: clamped });
    pressure.value = String(clamped.toFixed(3));
    markDirty();
    computeScene();
  });

  // Initialize speed of sound display
  updateSpeedOfSoundDisplay();
}
