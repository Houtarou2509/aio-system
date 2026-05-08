import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  mobileHidden?: boolean;
  mobileFull?: boolean;
  className?: string;
  render: (item: T) => ReactNode;
  mobileRender?: (item: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  sortBy?: string;
  sortOrder?: string;
  onSort?: (field: string) => void;
  emptyMessage?: string;
  mobileLabelWidth?: string;
}

/* ── Sort icon helper ──────────────────────────────────────── */

function sortIcon(field: string, sortBy?: string, sortOrder?: string): string {
  if (sortBy !== field) return '';
  return sortOrder === 'asc' ? ' ↑' : ' ↓';
}

/* ═════════════════════════════════════════════════════════════
   RESPONSIVE TABLE
   - md+ : standard <table> with navy header row
   - <md : stacked label/value cards
   ═════════════════════════════════════════════════════════════ */

export function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  sortBy,
  sortOrder,
  onSort,
  emptyMessage = 'No data found',
  mobileLabelWidth = 'w-24',
}: Props<T>) {
  const visibleMobile = columns.filter(c => !c.mobileHidden);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-slate-500 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* ── Desktop Table (md+) ──────────────────────────── */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#012061] text-left">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-[10px] font-semibold tracking-widest text-white/70 uppercase whitespace-nowrap ${col.sortable && onSort ? 'cursor-pointer select-none' : ''} ${col.className || ''}`}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  {col.header}{col.sortable ? sortIcon(col.key, sortBy, sortOrder) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={`border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-3 py-2.5 text-xs ${col.className || ''}`}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Cards (<md) ────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {data.map(item => (
          <div
            key={keyExtractor(item)}
            onClick={() => onRowClick?.(item)}
            className={`rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 shadow-sm ${onRowClick ? 'active:scale-[0.98] transition-transform cursor-pointer' : ''}`}
          >
            {visibleMobile.map((col, i) => {
              if (col.mobileRender) {
                return (
                  <div key={col.key} className={col.mobileFull ? '' : `flex items-start gap-2 ${i > 0 ? 'mt-2 pt-2 border-t border-slate-50 dark:border-slate-700/50' : ''}`}>
                    {!col.mobileFull && (
                      <span className={`shrink-0 text-[10px] tracking-widest text-slate-400 dark:text-slate-500 uppercase font-medium ${mobileLabelWidth} leading-relaxed`}>
                        {col.header}
                      </span>
                    )}
                    <div className={col.mobileFull ? '' : 'flex-1 text-xs text-slate-700 dark:text-slate-300'}>
                      {col.mobileRender(item)}
                    </div>
                  </div>
                );
              }

              return (
                <div key={col.key} className={`flex items-start gap-2 ${i > 0 ? 'mt-2 pt-2 border-t border-slate-50 dark:border-slate-700/50' : ''}`}>
                  <span className={`shrink-0 text-[10px] tracking-widest text-slate-400 dark:text-slate-500 uppercase font-medium ${mobileLabelWidth} leading-relaxed`}>
                    {col.header}
                  </span>
                  <span className="flex-1 text-xs text-slate-700 dark:text-slate-300">
                    {col.render(item) as any}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
