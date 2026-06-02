import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Wrench, ShieldAlert, ShieldX, Clock, Check, Inbox, CheckCheck,
  ChevronLeft, ChevronRight, ExternalLink,
} from 'lucide-react';

/* ─── Types ─── */
interface NotificationItem {
  id: string;
  type: 'WARRANTY_EXPIRING' | 'WARRANTY_EXPIRED' | 'MAINTENANCE_OVERDUE' | 'MAINTENANCE_DUE_SOON';
  message: string;
  assetId: string;
  isRead: boolean;
  createdAt: string;
  asset: { id: string; name: string };
}

interface NotificationsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const API_BASE = '/api';

async function apiFetch(url: string, options?: RequestInit) {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'Request failed');
  return json;
}

/* ─── Type config ─── */
const TYPE_CONFIG = {
  WARRANTY_EXPIRING: {
    icon: ShieldAlert,
    color: 'text-[#7B1113]',
    bg: 'bg-[#7B1113]/10',
    border: 'border-[#7B1113]/30',
    label: 'Warranty Expiring',
    dot: 'bg-[#7B1113]',
  },
  WARRANTY_EXPIRED: {
    icon: ShieldX,
    color: 'text-[#991b1b]',
    bg: 'bg-[#991b1b]/10',
    border: 'border-[#991b1b]/30',
    label: 'Warranty Expired',
    dot: 'bg-[#991b1b]',
  },
  MAINTENANCE_OVERDUE: {
    icon: Wrench,
    color: 'text-[#f8931f]',
    bg: 'bg-[#f8931f]/10',
    border: 'border-[#f8931f]/30',
    label: 'Maintenance Overdue',
    dot: 'bg-[#f8931f]',
  },
  MAINTENANCE_DUE_SOON: {
    icon: Clock,
    color: 'text-[#b45309]',
    bg: 'bg-[#b45309]/10',
    border: 'border-[#b45309]/30',
    label: 'Maintenance Due Soon',
    dot: 'bg-[#b45309]',
  },
} as const;

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS INBOX PAGE
   ═══════════════════════════════════════════════════════════ */
export default function NotificationsPage() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [meta, setMeta] = useState<NotificationsMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchData = useCallback(async (page: number, all: boolean) => {
    setLoading(true);
    try {
      const result = await apiFetch(`/notifications?page=${page}&limit=20&all=${all}`);
      setNotifications(result.data);
      setMeta(result.meta);

      // Fetch unread count separately for KPI
      const unreadResult = await apiFetch('/notifications?limit=1');
      setUnreadCount(unreadResult.meta?.total ?? 0);
    } catch (err: any) {
      console.error('[NotificationsPage] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch total count for KPI
  useEffect(() => {
    apiFetch('/notifications?all=true&limit=1')
      .then(r => setTotalCount(r.meta?.total ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData(1, showAll);
  }, [showAll, fetchData]);

  const handleMarkRead = async (id: string) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiFetch('/notifications/read-all', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > meta.totalPages) return;
    fetchData(p, showAll);
  };

  const toggleFilter = () => {
    setShowAll(!showAll);
  };

  const KPI = [
    { key: 'unread', label: 'UNREAD', icon: Bell, value: unreadCount, color: '#7B1113' },
    { key: 'total', label: 'ALL NOTIFICATIONS', icon: Inbox, value: totalCount, color: '#012061' },
  ];

  return (
    <div className="flex flex-col h-screen pt-14 md:pt-0 bg-[#012061] md:bg-transparent">

      {/* ═══ STICKY NAVY HEADER ═════════════════════════════ */}
      <header className="sticky top-[56px] md:top-0 z-30 shrink-0 bg-[#012061] px-4 sm:px-6 py-3 sm:py-4 min-h-[56px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-[#f8931f]" />
            <h1 className="text-lg font-bold text-white tracking-tight">Notifications</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFilter}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                showAll
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              {showAll ? 'All Notifications' : 'Unread Only'}
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f8931f] px-3 py-2 text-xs font-bold text-white hover:bg-[#e0841a] shadow-sm transition-colors disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAll ? 'Marking…' : 'Mark All Read'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══ CONTENT AREA ════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-auto bg-light-bg dark:bg-slate-900">

        {/* ═══ KPI TILES ═══════════════════════════════════════ */}
        <section className="px-4 sm:px-6 pt-4 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {KPI.map(({ key, label, icon: Icon, value, color }) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}15` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-tight" style={{ color }}>{value}</p>
                  <p className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ NOTIFICATION LIST ═══════════════════════════════ */}
        <section className="flex-1 px-4 sm:px-6 pt-4 pb-6 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f8931f] border-t-transparent" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f8931f]/10 mb-3">
                <Inbox className="h-8 w-8 text-[#f8931f]" />
              </div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">All caught up</p>
              <p className="text-xs text-slate-400">
                {showAll ? 'No notifications yet' : 'No unread notifications'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#012061]">
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase w-8"></th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Asset</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase">Message</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase w-24">Type</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest text-white/70 uppercase w-36">Date</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold tracking-widest text-white/70 uppercase w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map(n => {
                      const conf = TYPE_CONFIG[n.type] || TYPE_CONFIG.MAINTENANCE_OVERDUE;
                      const Icon = conf.icon;
                      return (
                        <tr
                          key={n.id}
                          className={`group border-b border-slate-100 dark:border-slate-700 transition-colors ${
                            !n.isRead
                              ? 'bg-[#f8931f]/5 dark:bg-[#f8931f]/5 font-medium'
                              : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          {/* Unread dot */}
                          <td className="px-4 py-3">
                            {!n.isRead && (
                              <span className={`inline-block h-2 w-2 rounded-full ${conf.dot}`} />
                            )}
                          </td>

                          {/* Asset name */}
                          <td className="px-4 py-3">
                            <span className="font-semibold text-[#012061] dark:text-slate-100">
                              {n.asset.name}
                            </span>
                          </td>

                          {/* Message */}
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                            {n.message}
                          </td>

                          {/* Type badge */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${conf.bg} ${conf.color} border ${conf.border}`}>
                              <Icon className="h-3 w-3" />
                              {conf.label}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDate(n.createdAt)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {formatTime(n.createdAt)}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigate(`/assets?id=${n.assetId}`)}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[#012061] dark:text-slate-100 hover:bg-[#012061]/5 dark:hover:bg-slate-700/40 transition-colors"
                                title="View asset"
                              >
                                <ExternalLink className="h-3 w-3" /> View
                              </button>
                              {!n.isRead && (
                                <button
                                  onClick={() => handleMarkRead(n.id)}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 hover:text-[#f8931f] hover:bg-[#f8931f]/10 transition-colors"
                                  title="Dismiss"
                                >
                                  <Check className="h-3 w-3" /> Read
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ═══ PAGINATION ══════════════════════════════ */}
              {meta.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(meta.page - 1)}
                      disabled={meta.page <= 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-3 w-3" /> Prev
                    </button>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      Page {meta.page} of {meta.totalPages}
                    </span>
                    <button
                      onClick={() => goToPage(meta.page + 1)}
                      disabled={meta.page >= meta.totalPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Next <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
