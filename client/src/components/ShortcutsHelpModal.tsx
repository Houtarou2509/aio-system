import { X, Command, Keyboard } from 'lucide-react';

interface Shortcut {
  key: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: 'Ctrl + K', description: 'Focus search bar on any page' },
  { key: 'Ctrl + N', description: 'Open New Asset modal (Assets page)' },
  { key: 'Escape', description: 'Close any open modal or dialog' },
  { key: '?', description: 'Show this shortcuts list' },
  { key: 'Enter', description: 'Confirm action in modals' },
  { key: 'Arrow Up / Down', description: 'Navigate dropdowns and lists' },
];

interface ShortcutsHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsHelpModal({ open, onClose }: ShortcutsHelpModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ backgroundColor: '#012061', borderBottom: '2px solid #f8931f' }}
        >
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-[#f8931f]" />
            <h3 className="text-sm font-bold text-white tracking-wide">Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcut List */}
        <div className="p-0">
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <span className="text-sm text-slate-700 dark:text-slate-300">{s.description}</span>
              <kbd className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
                {s.key.includes('Ctrl') && <Command className="w-3 h-3 inline" />}
                {s.key.replace(/Ctrl \+ /g, '')}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Press <kbd className="px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-mono text-[10px]">?</kbd> anywhere to open this</p>
        </div>
      </div>
    </div>
  );
}
