/**
 * Newsroom pagination is based on published rows, never an arbitrary max
 * query parameter. A valid first page exists even before the first genuine
 * technology story. Later pages exist only when they contain real stories.
 */
export function lastTechnologyPage(total: number, pageSize: number): number {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('invalid technology pagination count');
  }
  return Math.max(1, Math.ceil(total / pageSize));
}

export function technologyPage(raw: string | null, lastPage: number): number | null {
  if (!Number.isSafeInteger(lastPage) || lastPage < 1) return null;
  if (raw === null) return 1;
  if (!/^[1-9][0-9]*$/u.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed <= lastPage ? parsed : null;
}
