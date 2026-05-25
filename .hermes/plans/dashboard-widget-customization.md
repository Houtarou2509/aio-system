# Dashboard Widget Customization — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let users show/hide and reorder dashboard widgets. Preferences persist per user in localStorage.

**Architecture:** Widget registry defines all available widgets. User preferences (visibility + order) stored in localStorage under `aio_dashboard_layout`. A Customize panel slides in from the right — toggle visibility with switches, reorder with up/down arrows. The dashboard renders widgets dynamically based on preferences. No DnD library needed.

**Tech Stack:** React, TypeScript, TailwindCSS, Lucide icons, localStorage

---

## Widget Inventory

Seven total widgets. KPIs are always fixed at top — not toggleable.

| id | title | icon | default |
|----|-------|------|---------|
| `status-distribution` | Status Distribution | PieChart | visible |
| `assets-by-type` | Assets by Type | BarChart3 | visible |
| `warranty-maintenance` | Warranty & Maintenance | ShieldAlert | visible |
| `assets-by-location` | Assets by Location | Layers | visible |
| `assets-by-age` | Assets by Age | PieChart | visible |
| `activity-timeline` | Activity Timeline | Activity | visible |

---

### Task 1: Create Widget Registry + Types

**Objective:** Define the widget type system and default list.

**Files:**
- Create: `client/src/lib/widgetRegistry.ts`

**Step 1: Write the file**

```typescript
// client/src/lib/widgetRegistry.ts
import { PieChart, BarChart3, ShieldAlert, Layers, Activity } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface WidgetDef {
  id: string;
  title: string;
  icon: LucideIcon;
  defaultVisible: boolean;
}

export const WIDGET_DEFS: WidgetDef[] = [
  { id: 'status-distribution',  title: 'Status Distribution',  icon: PieChart,    defaultVisible: true },
  { id: 'assets-by-type',       title: 'Assets by Type',       icon: BarChart3,  defaultVisible: true },
  { id: 'warranty-maintenance', title: 'Warranty & Maintenance', icon: ShieldAlert, defaultVisible: true },
  { id: 'assets-by-location',   title: 'Assets by Location',   icon: Layers,     defaultVisible: true },
  { id: 'assets-by-age',        title: 'Assets by Age',        icon: PieChart,   defaultVisible: true },
  { id: 'activity-timeline',    title: 'Activity Timeline',    icon: Activity,   defaultVisible: true },
];

export const WIDGET_MAP = new Map(WIDGET_DEFS.map(d => [d.id, d]));

export interface WidgetPref {
  id: string;
  visible: boolean;
}

const STORAGE_KEY = 'aio_dashboard_layout';

export function loadWidgetPrefs(): WidgetPref[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return WIDGET_DEFS.map(d => ({ id: d.id, visible: d.defaultVisible }));
    const parsed: WidgetPref[] = JSON.parse(raw);
    // Merge: keep known widgets, preserve order from storage, add any new defaults
    const storedIds = new Set(parsed.map(p => p.id));
    const merged = [...parsed.filter(p => WIDGET_MAP.has(p.id))];
    for (const def of WIDGET_DEFS) {
      if (!storedIds.has(def.id)) merged.push({ id: def.id, visible: def.defaultVisible });
    }
    return merged;
  } catch {
    return WIDGET_DEFS.map(d => ({ id: d.id, visible: d.defaultVisible }));
  }
}

export function saveWidgetPrefs(prefs: WidgetPref[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
```

**Step 2: Verify**

```bash
cd client && npx tsc --noEmit --pretty 2>&1 | head -5
```

Expected: no errors for the new file.

**Step 3: Commit**

```bash
git add client/src/lib/widgetRegistry.ts
git commit -m "feat: add widget registry and localStorage prefs helper"
```

---

### Task 2: Build the Customize Panel Component

**Objective:** Create a slide-out panel with toggle switches and up/down reorder arrows.

**Files:**
- Create: `client/src/components/dashboard/CustomizePanel.tsx`

**Step 1: Write the component**

```tsx
// client/src/components/dashboard/CustomizePanel.tsx
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
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white dark:bg-slate-800 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">Customize Dashboard</h2>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
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
                {/* Grip handle (static) */}
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
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    pref.visible ? 'bg-[#f8931f]' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      pref.visible ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>

                {/* Reorder arrows */}
                <div className="flex flex-col gap-0 shrink-0">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-[#f8931f] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === draft.length - 1}
                    className="p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-[#f8931f] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="h-3 w-3" />
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
```

**Step 2: Verify**

```bash
cd client && npx tsc --noEmit --pretty 2>&1 | head -5
```

Expected: no errors.

**Step 3: Commit**

```bash
git add client/src/components/dashboard/CustomizePanel.tsx
git commit -m "feat: add CustomizePanel with toggle + reorder UI"
```

---

### Task 3: Wire Customize Button into Command Center Header

**Objective:** Add a "Customize" gear button in the dashboard header that opens the panel. Wire state management.

**Files:**
- Modify: `client/src/pages/DashboardPage.tsx`

**Step 1: Add imports at top (after line 11)**

In the import block (around line 1-10), add:
```typescript
import { SlidersHorizontal } from 'lucide-react';
import { CustomizePanel } from '../components/dashboard/CustomizePanel';
import { loadWidgetPrefs, saveWidgetPrefs, type WidgetPref } from '../lib/widgetRegistry';
```

**Step 2: Add state to the component (after line 263, inside DashboardPage)**

```typescript
const [widgetPrefs, setWidgetPrefs] = useState<WidgetPref[]>(() => loadWidgetPrefs());
const [customizeOpen, setCustomizeOpen] = useState(false);
```

**Step 3: Add Customize button in the header (between Audit and Settings buttons, lines 388-395)**

Replace the section between the Audit button and the Settings button gate to include:

```tsx
            <button onClick={() => navigate('/audit')} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 hidden sm:inline-flex">
              <ClipboardList className="h-3.5 w-3.5 text-[#f8931f]" />
              Audit
            </button>
            <button onClick={() => setCustomizeOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#f8931f]" />
              <span className="hidden sm:inline">Customize</span>
            </button>
```

**Step 4: Add CustomizePanel render at the bottom of the return (before closing `</div>` of main, around line 641)**

```tsx
      {/* Customize Panel */}
      {customizeOpen && (
        <CustomizePanel
          prefs={widgetPrefs}
          onSave={(newPrefs) => {
            saveWidgetPrefs(newPrefs);
            setWidgetPrefs(newPrefs);
          }}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
```

**Step 5: Verify**

```bash
cd client && npx tsc --noEmit --pretty 2>&1 | head -10
```

Expected: no TypeScript errors.

**Step 6: Commit**

```bash
git add client/src/pages/DashboardPage.tsx
git commit -m "feat: wire Customize button into dashboard header"
```

---

### Task 4: Make Dashboard Render Respect Widget Preferences

**Objective:** The bento grid rows now render only visible widgets, in user-defined order. Widgets flow into rows automatically — 3 per row, each `col-span-1`.

**Files:**
- Modify: `client/src/pages/DashboardPage.tsx`

**Step 1: Build the widget render lookup**

Add a helper component file or render map inside DashboardPage. Since each widget needs its data (statusData, typeData, etc.), we'll use a render function that takes a widget id and returns the JSX.

**Step 2: Replace the hardcoded bento rows (lines 418-639)**

Replace the entire `{loading || !data ? (...)` block content with dynamic rendering. The approach:

```tsx
        ) : (
          <div className="space-y-4 mt-1">
            {/* Filter visible widgets in order */}
            {(() => {
              const visible = widgetPrefs.filter(p => p.visible);
              if (visible.length === 0) {
                return (
                  <BentoCard className="flex flex-col items-center justify-center py-16">
                    <SlidersHorizontal className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No widgets enabled</p>
                    <p className="text-xs text-slate-400 mt-1">Click "Customize" to add widgets</p>
                  </BentoCard>
                );
              }

              // Render widgets in rows of 3
              const rows: WidgetPref[][] = [];
              for (let i = 0; i < visible.length; i += 3) {
                rows.push(visible.slice(i, i + 3));
              }

              return rows.map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {row.map(pref => renderWidget(pref.id))}
                </div>
              ));
            })()}
          </div>
        )}
```

**Step 3: Create the renderWidget function**

This is a switch on widget id that returns the appropriate BentoCard. Each widget's content is extracted from the existing code (lines 424-638). For example:

```tsx
function renderWidget(id: string): React.ReactNode {
  switch (id) {
    case 'status-distribution':
      return (
        <BentoCard>
          <BentoCardTitle icon={PieChart} accent="#014da3">Status Distribution</BentoCardTitle>
          <div className="px-5 pb-5 h-56 flex items-center justify-center">
            {statusData && Object.keys(data!.byStatus).length > 0 ? (
              <Doughnut data={statusData} options={{...chartCommonOpts, plugins: {legend: legendOpts, tooltip: {...}}}} />
            ) : (
              <p className="text-xs text-slate-400 italic">No status data yet</p>
            )}
          </div>
        </BentoCard>
      );

    case 'assets-by-type':
      return (
        <BentoCard>
          <BentoCardTitle icon={BarChart3} accent="#014da3">Assets by Type</BentoCardTitle>
          <div className="px-5 pb-5 h-56 flex items-center justify-center">
            {typeData && Object.keys(data!.byType).length > 0 ? (
              <Bar data={typeData} options={{...chartCommonOpts, plugins: {legend: {display: false}}, scales: {...}}} />
            ) : (
              <p className="text-xs text-slate-400 italic">No type data yet</p>
            )}
          </div>
        </BentoCard>
      );

    // ... repeat for warranty-maintenance, assets-by-location, assets-by-age, activity-timeline

    default:
      return null;
  }
}
```

**Important:** Each widget must be self-contained with all its data dependencies resolved at the top of the component (all data is already fetched in useEffect). Use the existing chart configs, empty states, and conditional glow patterns exactly as they are — just move them into the switch cases.

**Step 4: Verify**

```bash
cd client && npx tsc --noEmit --pretty 2>&1 | head -10
```

Expected: no errors.

**Step 5: Test manually**

Open `http://localhost:3000/aio-system/` — dashboard should render identically to before.
Click "Customize" — panel slides in from right.
Toggle a widget off — it disappears from dashboard.
Use up/down arrows — widgets reorder.
Click "Save Layout" — panel closes, layout persists.
Refresh the page — layout is restored from localStorage.

**Step 6: Commit**

```bash
git add client/src/pages/DashboardPage.tsx
git commit -m "feat: dynamic widget rendering based on user preferences"
```

---

### Task 5: Edge Cases & Polish

**Objective:** Handle edge cases: all widgets hidden, single widget in a row, localStorage corruption, mobile responsiveness of the panel.

**Files:**
- Modify: `client/src/pages/DashboardPage.tsx`
- Modify: `client/src/components/dashboard/CustomizePanel.tsx`

**Step 1: Empty state**

Already handled in Task 4 — shows "No widgets enabled" with a prompt to customize.

**Step 2: Single widget in row**

The grid is always `lg:grid-cols-3`. A single widget will span 1/3 width on desktop, which is intentionally compact. This is fine — each BentoCard is self-contained.

**Step 3: localStorage corruption**

Already handled in `loadWidgetPrefs()` — try/catch + fallback to defaults.

**Step 4: Mobile CustomizePanel**

The panel is `w-80` on all screens. On mobile (< ~400px), it should be full-width. Add responsive width:

```tsx
className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-80 bg-white ..."
```

**Step 5: Animate panel entry**

Add a simple slide-in animation. Tailwind's `animate-in` may not be available. Use a manual approach with CSS transition or just accept the instant open — simple, clean, industrial.

**Step 6: Verify full flow**

```bash
cd client && npx tsc --noEmit --pretty
```

Expected: Clean, no errors or warnings.

**Step 7: Commit**

```bash
git add client/src/pages/DashboardPage.tsx client/src/components/dashboard/CustomizePanel.tsx
git commit -m "fix: edge cases for dashboard customization"
```

---

## Verification Checklist

- [ ] TypeScript compiles with zero errors
- [ ] Dashboard renders identically to before on first load (all defaults)
- [ ] Customize button visible in header (sliders icon)
- [ ] Panel slides in from right on click
- [ ] Toggle switch turns widgets on/off immediately in preview
- [ ] Up/down arrows reorder widgets
- [ ] Reset restores all widgets to default state
- [ ] Save Layout persists to localStorage
- [ ] Page refresh restores saved layout
- [ ] All widgets hidden shows empty state message
- [ ] Each widget type renders correctly: charts, lists, timeline
- [ ] Brand colors maintained (navy `#012061`, orange `#f8931f`)
- [ ] Dark mode compatible
- [ ] Mobile responsive (panel full-width, dashboard stacks to 1-col)
