/**
 * Physical units and conversions for acoustic calculations
 */

import { STANDARD_TEMPERATURE, STANDARD_PRESSURE, STANDARD_HUMIDITY } from '@geonoise/shared';

// ============================================================================
// Speed of Sound
// ============================================================================

/**
 * Calculate the speed of sound in air (m/s)
 * Based on simplified formula: c = 331.3 + 0.606 * T
 * @param temperatureC - Temperature in Celsius
 */
export function speedOfSound(temperatureC: number = STANDARD_TEMPERATURE): number {
  return 331.3 + 0.606 * temperatureC;
}

/**
 * Calculate the speed of sound using more accurate formula
 * @param temperatureC - Temperature in Celsius
 * @param relativeHumidity - Relative humidity (0-100)
 * @param pressureKPa - Atmospheric pressure in kPa
 */
export function speedOfSoundAccurate(
  temperatureC: number = STANDARD_TEMPERATURE,
  relativeHumidity: number = STANDARD_HUMIDITY,
  pressureKPa: number = STANDARD_PRESSURE
): number {
  const T = temperatureC + 273.15; // Convert to Kelvin
  const h = relativeHumidity / 100;

  // Saturation vapor pressure (simplified)
  const psat = 6.1078 * Math.pow(10, (7.5 * temperatureC) / (237.3 + temperatureC));
  const pv = h * psat; // Vapor pressure

  // Mole fraction of water vapor
  const xw = pv / (pressureKPa * 10); // Convert kPa to hPa

  // Ratio of specific heats (gamma)
  const gamma = 1.4 - 0.04 * xw;

  // Molar mass of moist air (approximate)
  const M = 0.02897 * (1 - xw) + 0.01802 * xw;

  // Gas constant
  const R = 8.314;

  return Math.sqrt((gamma * R * T) / M);
}

// ============================================================================
// Atmospheric Absorption
// ============================================================================

/**
 * Calculate atmospheric absorption coefficient (dB/m)
 * Simplified formula for single frequency
 * @param frequencyHz - Frequency in Hz
 * @param temperatureC - Temperature in Celsius
 * @param relativeHumidity - Relative humidity (0-100)
 */
export function atmosphericAbsorptionSimple(
  frequencyHz: number,
  temperatureC: number = STANDARD_TEMPERATURE,
  relativeHumidity: number = STANDARD_HUMIDITY
): number {
  // Simplified absorption coefficient (dB/100m)
  // Based on ISO 9613-1 approximation
  const f = frequencyHz / 1000; // Convert to kHz
  const T = temperatureC;
  const h = relativeHumidity;

  // Very simplified formula
  const alpha =
    (1.84e-11 * (T + 273.15) ** 0.5 * f ** 2) / (1 + (f / (0.1 + 10 * h / 100)) ** 2) +
    f ** 2 * (1.275e-2 * Math.exp(-2239.1 / (T + 273.15))) /
      (1 + (f / (0.1 + 10 * h / 100)) ** 2);

  return alpha / 100; // Convert to dB/m
}

/**
 * Calculate atmospheric absorption per ISO 9613-1
 * @param frequencyHz - Frequency in Hz
 * @param temperatureC - Temperature in Celsius
 * @param relativeHumidity - Relative humidity (0-100)
 * @param pressureKPa - Atmospheric pressure in kPa
 */
export function atmosphericAbsorptionISO9613(
  frequencyHz: number,
  temperatureC: number = STANDARD_TEMPERATURE,
  relativeHumidity: number = STANDARD_HUMIDITY,
  pressureKPa: number = STANDARD_PRESSURE
): number {
  const T = temperatureC + 273.15; // Kelvin
  const T0 = 293.15; // Reference temperature (20°C)
  const T01 = 273.16; // Triple point of water
  const ps0 = STANDARD_PRESSURE; // Reference pressure

  const ps = pressureKPa;
  const f = frequencyHz;

  // Molar concentration of water vapor
  const C = -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151;
  const psat = ps0 * Math.pow(10, C);
  const h = relativeHumidity * psat / ps;

  // Oxygen relaxation frequency
  const frO = (ps / ps0) * (24 + 4.04e4 * h * ((0.02 + h) / (0.391 + h)));

  // Nitrogen relaxation frequency
  const frN = (ps / ps0) * Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));

  // Absorption coefficient (dB/m)
  const alpha =
    8.686 *
    f *
    f *
    ((1.84e-11 * (ps / ps0) ** -1 * (T / T0) ** 0.5) +
      (T / T0) ** -2.5 *
        (0.01275 * Math.exp(-2239.1 / T) * (frO / (frO * frO + f * f)) +
          0.1068 * Math.exp(-3352 / T) * (frN / (frN * frN + f * f))));

  return alpha;
}

// ============================================================================
// Ground Effects
// ============================================================================

/** Ground type classification */
export enum GroundType {
  /** Hard reflective surface (concrete, asphalt, water) */
  Hard = 'hard',
  /** Mixed surface */
  Mixed = 'mixed',
  /** Soft absorptive surface (grass, soil, vegetation) */
  Soft = 'soft',
}

/**
 * Get ground factor (G) for ISO 9613-2
 * @param groundType - Type of ground surface
 */
export function groundFactor(groundType: GroundType): number {
  switch (groundType) {
    case GroundType.Hard:
      return 0;
    case GroundType.Mixed:
      return 0.5;
    case GroundType.Soft:
      return 1;
    default:
      return 0.5;
  }
}

// ============================================================================
// Wavelength and Period
// ============================================================================

/**
 * Calculate wavelength from frequency
 * @param frequencyHz - Frequency in Hz
 * @param temperatureC - Temperature in Celsius (affects speed of sound)
 */
export function wavelength(
  frequencyHz: number,
  temperatureC: number = STANDARD_TEMPERATURE
): number {
  const c = speedOfSound(temperatureC);
  return c / frequencyHz;
}

/**
 * Calculate period from frequency
 * @param frequencyHz - Frequency in Hz
 */
export function period(frequencyHz: number): number {
  return 1 / frequencyHz;
}

/**
 * Calculate frequency from wavelength
 * @param wavelengthM - Wavelength in meters
 * @param temperatureC - Temperature in Celsius
 */
export function frequencyFromWavelength(
  wavelengthM: number,
  temperatureC: number = STANDARD_TEMPERATURE
): number {
  const c = speedOfSound(temperatureC);
  return c / wavelengthM;
}

// ============================================================================
// Reference Level Conversions
// ============================================================================

/**
 * Convert sound power (W) to sound power level (dB re 1pW)
 * @param powerW - Sound power in Watts
 */
export function powerToLevel(powerW: number): number {
  return 10 * Math.log10(powerW / 1e-12);
}

/**
 * Convert sound power level (dB re 1pW) to sound power (W)
 * @param levelDB - Sound power level in dB
 */
export function levelToPower(levelDB: number): number {
  return 1e-12 * Math.pow(10, levelDB / 10);
}

/**
 * Convert sound pressure (Pa) to sound pressure level (dB re 20µPa)
 * @param pressurePa - Sound pressure in Pascals
 */
export function pressureToLevel(pressurePa: number): number {
  return 20 * Math.log10(pressurePa / 2e-5);
}

/**
 * Convert sound pressure level (dB re 20µPa) to sound pressure (Pa)
 * @param levelDB - Sound pressure level in dB
 */
export function levelToPressure(levelDB: number): number {
  return 2e-5 * Math.pow(10, levelDB / 20);
}

// ============================================================================
// Directivity
// ============================================================================

/**
 * Calculate directivity factor Q for a source position
 * @param onGround - Source is on/near ground (hemisphere radiation)
 * @param nearWall - Source is near a wall (quarter sphere)
 * @param inCorner - Source is in a corner (eighth sphere)
 */
export function directivityFactor(
  onGround = false,
  nearWall = false,
  inCorner = false
): number {
  if (inCorner) return 8;
  if (nearWall) return 4;
  if (onGround) return 2;
  return 1;
}

/**
 * Calculate directivity index DI from directivity factor Q
 * @param Q - Directivity factor
 */
export function directivityIndex(Q: number): number {
  return 10 * Math.log10(Q);
}
