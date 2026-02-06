export function formatLevel(value: number) {
  return value.toFixed(1);
}

export function formatMeters(value: number) {
  return value.toFixed(1);
}

/**
 * Format level for legend display - removes trailing ".0"
 * Example: 45.0 -> "45", 45.5 -> "45.5"
 */
export function formatLegendLevel(value: number) {
  const text = formatLevel(value);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}
