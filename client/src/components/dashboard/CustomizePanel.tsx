import { useState } from 'react';
import { X, GripVertical, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { WIDGET_DEFS, type WidgetPref } from '../../lib/widgetRegistry';

interface Props {
  prefs: WidgetPref[];
  onSave: (prefs: WidgetPref[]) => void;
  onClose: () => void;
}

export function CustomizePanel({ prefs, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<WidgetPref[]>(() => prefs.map(p => ({ ...p })));

  const toggle = (id: string) => {
    setDraft(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setDraft(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    if (idx === draft.length - 1) return;
    setDraft(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const reset = () => {
    setDraft(WIDGET_DEFS.map(d => ({ id: d.id, visible: d.defaultVisible })));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-80 bg-white dark:bg-slate-800 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">Customize Dashboard</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Instructions */}
        <p className="px-5 pt-3 pb-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Toggle widgets on/off and use arrows to reorder them.
        </p>

        {/* Widget list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1" style={{ scrollbarWidth: 'thin' }}>
          {draft.map((pref, i) => {
            const def = WIDGET_DEFS.find(d => d.id === pref.id);
            if (!def) return null;
            const Icon = def.icon;

            return (
              <div
                key={pref.id}
                className={`flex items-center gap-2 px-2 py-2.5 rounded-lg transition-all duration-200 ${
                  pref.visible
                    ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                    : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 opacity-60'
                }`}
              >
                {/* Grip handle */}
                <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />

                {/* Icon + Title */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${pref.visible ? 'text-[#f8931f]' : 'text-slate-300 dark:text-slate-600'}`} />
                  <span className={`text-xs font-medium truncate ${pref.visible ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                    {def.title}
                  </span>
                </div>

                {/* Toggle switch */}
                <button
                  onClick={() => toggle(pref.id)}
                  className={`relative inline-flex h-6 w-11 sm:h-5 sm:w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    pref.visible ? 'bg-[#f8931f]' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 sm:h-3.5 sm:w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      pref.visible ? 'translate-x-[22px] sm:translate-x-[18px]' : 'translate-x-[4px] sm:translate-x-[3px]'
                    }`}
                  />
                </button>

                {/* Reorder arrows */}
                <div className="flex flex-col gap-0 shrink-0">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-1.5 rounded text-slate-300 dark:text-slate-600 hover:text-[#f8931f] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === draft.length - 1}
                    className="p-1.5 rounded text-slate-300 dark:text-slate-600 hover:text-[#f8931f] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-all duration-200 active:scale-95"
            style={{ backgroundColor: '#f8931f' }}
          >
            Save Layout
          </button>
        </div>
      </div>
    </>
  );
}
