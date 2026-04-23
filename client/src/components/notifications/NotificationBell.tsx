import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { Button } from '../ui/button';

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

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch {
      // silently ignore — will retry on next open
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
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

  const typeIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'WARRANTY_EXPIRING':
        return '🏷️';
      case 'MAINTENANCE_OVERDUE':
        return '🔧';
      default:
        return '🔔';
    }
  };

  const typeLabel = (type: NotificationItem['type']) => {
    switch (type) {
      case 'WARRANTY_EXPIRING':
        return 'text-amber-500';
      case 'MAINTENANCE_OVERDUE':
        return 'text-red-500';
      default:
        return '';
    }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-md hover:bg-muted transition-colors" aria-label="Notifications">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 max-h-96 overflow-y-auto">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold">Notifications</h3>
        </div>
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No new notifications
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map(n => (
              <div key={n.id} className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors">
                <span className="text-lg mt-0.5">{typeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${typeLabel(n.type)}`}>
                    {n.asset.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {n.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {timeAgo(n.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs shrink-0 h-7"
                  onClick={() => handleMarkRead(n.id)}
                >
                  Dismiss
                </Button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}