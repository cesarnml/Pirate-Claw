/** Stable lookup key for movie cache (normalized title + year). */
export function movieMatchKey(normalizedTitle: string, year?: number): string {
  return `${normalizedTitle.toLowerCase().trim()}|${year ?? '_'}`;
}

/** Stable lookup key for TV show cache. */
export function tvMatchKey(normalizedTitle: string): string {
  return normalizedTitle.toLowerCase().trim();
}
