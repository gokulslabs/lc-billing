/** Escape a scanned inventory number so it is treated as a literal LIKE pattern. */
export function inventoryNumberLikePattern(value: string): string {
  return value.replace(/[\\%_*]/g, "\\$&");
}
