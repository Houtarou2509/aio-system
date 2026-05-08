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
