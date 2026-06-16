import { describe, it, expect } from 'vitest';
import { getPageSelectionState, togglePageSelection } from './assetSelection';

describe('assetSelection page-checkbox logic', () => {
  const page1 = ['p1-a', 'p1-b', 'p1-c'];
  const page2 = ['p2-a', 'p2-b'];

  it('reports none selected when no IDs are selected', () => {
    const state = getPageSelectionState(page1, new Set());
    expect(state.allSelected).toBe(false);
    expect(state.someSelected).toBe(false);
  });

  it('reports all selected only when every current-page ID is selected', () => {
    const selected = new Set(['p1-a', 'p1-b', 'p1-c']);
    const state = getPageSelectionState(page1, selected);
    expect(state.allSelected).toBe(true);
    expect(state.someSelected).toBe(false);
  });

  it('reports some selected when selection spans pages', () => {
    // Page 1 fully selected, plus an ID from page 2
    const selected = new Set([...page1, 'p2-a']);
    const state = getPageSelectionState(page1, selected);
    expect(state.allSelected).toBe(true);
    expect(state.someSelected).toBe(false);

    // For page 2 only a subset is selected
    const page2State = getPageSelectionState(page2, selected);
    expect(page2State.allSelected).toBe(false);
    expect(page2State.someSelected).toBe(true);
  });

  it('keeps page 2 selected when toggling page 1 off', () => {
    const selected = new Set([...page1, ...page2]);
    const next = togglePageSelection(page1, selected);
    expect(Array.from(next).sort()).toEqual([...page2].sort());
  });

  it('adds page 2 IDs without touching page 1 selections', () => {
    const selected = new Set(page1);
    const next = togglePageSelection(page2, selected);
    expect(Array.from(next).sort()).toEqual([...page1, ...page2].sort());
  });

  it('toggles page selection off when current page is fully selected', () => {
    const selected = new Set(page1);
    const next = togglePageSelection(page1, selected);
    expect(next.size).toBe(0);
  });

  it('toggles page selection on when current page has no selections', () => {
    const selected = new Set(page2);
    const next = togglePageSelection(page1, selected);
    expect(next.size).toBe(page1.length + page2.length);
    expect(page1.every(id => next.has(id))).toBe(true);
  });
});
