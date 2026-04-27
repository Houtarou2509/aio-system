import { useState, useEffect, useCallback } from 'react';
import { Bell, Wrench, ShieldAlert, Check, Inbox } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

interface NotificationItem {
  id: string;
  type: 'WARRANTY_EXPIRING' | 'MAINTENANCE_OVERDUE';
  message: string;
  assetId: string;
  isRead: boolean;
  createdAt: string;
  asset: { id: string; name: string };
}

const API_BASE = '/api';

async function fetchNotifications(): Promise<NotificationItem[]> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
  return data.data;
}

async function markAsRead(id: string): Promise<void> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Failed to mark as read');
}

/* ─── Notification type config ─── */
const TYPE_CONFIG = {
  WARRANTY_EXPIRING: {
    icon: ShieldAlert,
    color: 'text-brand-red',
    bg: 'bg-brand-red/10',
    border: 'border-brand-red/30',
    label: 'Warranty',
  },
  MAINTENANCE_OVERDUE: {
    icon: Wrench,
    color: 'text-brand-orange',
    bg: 'bg-brand-orange/10',
    border: 'border-brand-orange/30',
    label: 'Maintenance',
  },
} as const;

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATION BELL — Redesigned
   ═══════════════════════════════════════════════════════════ */
export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch {
      // silently retry on next open
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleMarkRead = async (id: string) => {
    try {
      await markAsRead(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* ─── Bell Trigger ─── */}
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-white/70 hover:text-white transition-colors" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white px-1 animate-fade-in"
              style={{ background: '#7B1113' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      {/* ─── Popover Panel ─── */}
      <PopoverContent
        className="w-80 p-0 border-0 shadow-2xl rounded-xl overflow-hidden z-[100]"
        side="top"
        align="start"
        sideOffset={8}
      >
        {/* ─── Header ─── */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            background: '#012061',
            borderBottom: '2px solid #f8931f',
          }}
        >
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-orange" />
            <h3 className="text-sm font-bold text-white tracking-wide">Notifications</h3>
          </div>
          {unreadCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-orange text-white">
              {unreadCount} new
            </span>
          )}
        </div>

        {/* ─── Content ─── */}
        <div className="max-h-[340px] overflow-y-auto bg-white">
          {notifications.length === 0 ? (
            /* ─── Empty State ─── */
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3">
                <Inbox className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-400">All caught up</p>
              <p className="text-xs text-slate-300 mt-1">No new notifications</p>
            </div>
          ) : (
            /* ─── Notification List ─── */
            <div className="divide-y divide-slate-100">
              {notifications.map(n => {
                const conf = TYPE_CONFIG[n.type] || TYPE_CONFIG.MAINTENANCE_OVERDUE;
                const Icon = conf.icon;

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-l-[3px] ${conf.border}`}
                  >
                    {/* Type Icon */}
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5 ${conf.bg}`}>
                      <Icon className={`w-4 h-4 ${conf.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${conf.color}`}>
                          {conf.label}
                        </span>
                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-sm font-semibold text-brand-blue leading-tight truncate">
                        {n.asset.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 break-words line-clamp-2">
                        {n.message}
                      </p>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 hover:bg-brand-orange/20 text-slate-400 hover:text-brand-orange transition-colors shrink-0 mt-1"
                      title="Dismiss"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <button
              onClick={() => {
                notifications.forEach(n => handleMarkRead(n.id));
              }}
              className="w-full text-center text-xs font-medium text-brand-blue hover:text-brand-orange transition-colors py-1"
            >
              Mark all as read
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}