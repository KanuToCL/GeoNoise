/**
 * Analytics Module
 *
 * Combines Vercel Analytics (visitor tracking) and PostHog (feature usage tracking).
 * All analytics concerns are centralized here to keep main.ts clean.
 */

import { inject } from '@vercel/analytics';
import posthog from 'posthog-js';

// PostHog project key - replace with your actual key
const POSTHOG_KEY = 'phc_REPLACE_WITH_YOUR_KEY';
const POSTHOG_HOST = 'https://us.i.posthog.com';

// Track whether PostHog is initialized (skip if no valid key)
let posthogInitialized = false;

/**
 * Initialize all analytics tracking.
 * Call once at app startup.
 */
export function initAnalytics(): void {
  // Vercel Analytics for page views
  inject();

  // PostHog for feature usage (only if key is configured)
  if (POSTHOG_KEY && !POSTHOG_KEY.includes('REPLACE')) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false, // Vercel handles page views
      capture_pageleave: true,
      autocapture: false, // We'll track manually for precision
    });
    posthogInitialized = true;
  }
}

// =============================================================================
// EVENT TRACKING FUNCTIONS
// =============================================================================

/**
 * Track a feature usage event
 */
function track(event: string, properties?: Record<string, unknown>): void {
  if (!posthogInitialized) return;
  posthog.capture(event, properties);
}

// =============================================================================
// ENTITY CREATION EVENTS
// =============================================================================

export function trackCreateBuilding(method: 'rectangle' | 'polygon'): void {
  track('entity_created', { type: 'building', method });
}

export function trackCreateSource(): void {
  track('entity_created', { type: 'source' });
}

export function trackCreateReceiver(): void {
  track('entity_created', { type: 'receiver' });
}

export function trackCreateBarrier(): void {
  track('entity_created', { type: 'barrier' });
}

export function trackCreatePanel(): void {
  track('entity_created', { type: 'panel' });
}

export function trackCreateProbe(): void {
  track('entity_created', { type: 'probe' });
}

export function trackDuplicateEntity(type: string): void {
  track('entity_duplicated', { type });
}

export function trackDeleteEntity(type: string): void {
  track('entity_deleted', { type });
}

// =============================================================================
// COMPUTATION EVENTS
// =============================================================================

export function trackCompute(): void {
  track('compute_triggered');
}

export function trackGenerateMap(): void {
  track('generate_map_triggered');
}

export function trackRefineMap(): void {
  track('refine_map_triggered');
}

// =============================================================================
// PHYSICS SETTINGS EVENTS
// =============================================================================

export function trackPhysicsSetting(setting: string, value: unknown): void {
  track('physics_setting_changed', { setting, value });
}

export function trackGroundEffectsToggle(enabled: boolean): void {
  track('physics_setting_changed', { setting: 'ground_effects', enabled });
}

export function trackGroundSurface(surface: string): void {
  track('physics_setting_changed', { setting: 'ground_surface', value: surface });
}

export function trackGroundEffectModel(model: string): void {
  track('physics_setting_changed', { setting: 'ground_effect_model', value: model });
}

export function trackSommerfeldCorrection(enabled: boolean): void {
  track('physics_setting_changed', { setting: 'sommerfeld_correction', enabled });
}

export function trackWallReflections(enabled: boolean): void {
  track('physics_setting_changed', { setting: 'wall_reflections', enabled });
}

export function trackReflectionOrder(order: number): void {
  track('physics_setting_changed', { setting: 'reflection_order', value: order });
}

export function trackComputeBackend(backend: string): void {
  track('physics_setting_changed', { setting: 'compute_backend', value: backend });
}

// =============================================================================
// UI / MENU EVENTS
// =============================================================================

export function trackToolChange(tool: string): void {
  track('tool_selected', { tool });
}

export function trackLayerToggle(layer: string, visible: boolean): void {
  track('layer_toggled', { layer, visible });
}

export function trackThemeChange(theme: string): void {
  track('theme_changed', { theme });
}

export function trackMapToggle(visible: boolean): void {
  track('map_toggled', { visible });
}

export function trackMapStyle(style: string): void {
  track('map_style_changed', { style });
}

// =============================================================================
// EXPORT EVENTS
// =============================================================================

export function trackExport(format: 'png' | 'pdf' | 'csv' | 'json'): void {
  track('export_triggered', { format });
}

export function trackSaveScene(): void {
  track('scene_saved');
}

export function trackLoadScene(): void {
  track('scene_loaded');
}

// =============================================================================
// PROBE EVENTS
// =============================================================================

export function trackPinProbe(): void {
  track('probe_pinned');
}

export function trackProbeSnapshot(): void {
  track('probe_snapshot_created');
}

// =============================================================================
// HELP / INFO EVENTS
// =============================================================================

export function trackOpenAbout(): void {
  track('about_opened');
}

export function trackDismissCanvasHelp(): void {
  track('canvas_help_dismissed');
}
