/**
 * Analytics Module
 *
 * Initializes Vercel Analytics for visitor tracking.
 * This is a thin wrapper that keeps analytics concerns separate from main.ts.
 */

import { inject } from '@vercel/analytics';

/**
 * Initialize analytics tracking.
 * Call once at app startup.
 */
export function initAnalytics(): void {
  inject();
}
