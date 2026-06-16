/** Pure helpers for page-level row selection in a paginated table. */

export function getPageSelectionState(pageIds: string[], selectedIds: Set<string>) {
  const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const someSelected = pageIds.some(id => selectedIds.has(id)) && !allSelected;
  return { allSelected, someSelected };
}

/** Toggle selection for the current page only. */
export function togglePageSelection(pageIds: string[], selectedIds: Set<string>): Set<string> {
  const { allSelected } = getPageSelectionState(pageIds, selectedIds);
  const next = new Set(selectedIds);
  if (allSelected) {
    pageIds.forEach(id => next.delete(id));
  } else {
    pageIds.forEach(id => next.add(id));
  }
  return next;
}
