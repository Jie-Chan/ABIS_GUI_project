export const PAGE_SIZE_OPTIONS = Object.freeze([10, 20, 50, 100])
export const DEFAULT_PAGE_SIZE = 20

export function normalizePageSize(value) {
  return PAGE_SIZE_OPTIONS.includes(value) ? value : DEFAULT_PAGE_SIZE
}
