import { useEffect, useCallback, useState } from 'react';

export interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
}

const GLOBAL_SHORTCUTS: ShortcutDef[] = [
  { key: 'k', ctrl: true, description: 'Focus search bar' },
  { key: '?', description: 'Show keyboard shortcuts' },
];

const PAGE_SHORTCUTS: Record<string, ShortcutDef[]> = {
  assets: [
    { key: 'n', ctrl: true, description: 'New asset' },
  ],
};

let focusSearchCallback: (() => void) | null = null;
let newAssetCallback: (() => void) | null = null;

export function setFocusSearchCallback(fn: (() => void) | null) { focusSearchCallback = fn; }
export function setNewAssetCallback(fn: (() => void) | null) { newAssetCallback = fn; }

export function getAllShortcuts(): ShortcutDef[] {
  return [...GLOBAL_SHORTCUTS, ...PAGE_SHORTCUTS.assets];
}

/**
 * Global keyboard shortcuts hook.
 * Attach this once in the app layout (or App) for global shortcuts.
 */
export function useKeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      // Allow Escape to still work inside inputs
      if (e.key !== 'Escape') return;
    }

    // ? — show help (not when shift is pressed for other combos)
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setHelpOpen(true);
      return;
    }

    // Escape — close modals/help
    if (e.key === 'Escape') {
      setHelpOpen(false);
      return;
    }

    // Ctrl/Cmd + K — focus search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      focusSearchCallback?.();
      return;
    }

    // Ctrl/Cmd + N — new asset (on assets page)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      newAssetCallback?.();
      return;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return { helpOpen, setHelpOpen };
}
