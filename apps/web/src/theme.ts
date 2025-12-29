export type Theme = 'default' | 'neumorphic';

const STORAGE_KEY = 'geonoise.theme';

export function getSystemThemeFallback(): Theme {
  return 'default';
}

export function getSavedTheme(storage: Storage = window.localStorage): Theme {
  const value = storage.getItem(STORAGE_KEY);
  if (value === 'default' || value === 'neumorphic') return value;
  return getSystemThemeFallback();
}

export function saveTheme(theme: Theme, storage: Storage = window.localStorage): void {
  storage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function isNeumorphismAllowed(): boolean {
  const forcedColors = window.matchMedia?.('(forced-colors: active)')?.matches ?? false;
  const reduceTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)')?.matches ?? false;
  return !(forcedColors || reduceTransparency);
}
