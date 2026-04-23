import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { RoleGate } from '../auth';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement);

interface DashboardData {
  totalAssets: number;
  totalAssigned: number;
  underMaintenance: number;
  available: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  activityFeed: string[];
}

interface UpcomingSchedule {
  id: string;
  title: string;
  scheduledDate: string;
  status: string;
  asset: { id: string; name: string };
}

interface WarrantyExpiring {
  id: string;
  name: string;
  warrantyExpiry: string;
  status: string;
  location: string | null;
  daysUntilExpiry: number;
  warrantyStatus: 'expired' | 'expiring' | 'active';
}

interface LocationStat {
  location: string;
  count: number;
}

interface AgeStat {
  label: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#22c55e',
  ASSIGNED: '#3b82f6',
  MAINTENANCE: '#eab308',
  RETIRED: '#9ca3af',
  LOST: '#ef4444',
};

const TYPE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#f97316'];

export function DashboardWidgets() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<UpcomingSchedule[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [warrantiesExpiring, setWarrantiesExpiring] = useState<WarrantyExpiring[]>([]);
  const [warrantiesLoading, setWarrantiesLoading] = useState(true);
  const [locationStats, setLocationStats] = useState<LocationStat[]>([]);
  const [ageStats, setAgeStats] = useState<AgeStat[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/maintenance/upcoming', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setUpcomingMaintenance(d.data); })
      .catch(() => {})
      .finally(() => setMaintenanceLoading(false));

    fetch('/api/dashboard/warranties-expiring', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setWarrantiesExpiring(d.data); })
      .catch(() => {})
      .finally(() => setWarrantiesLoading(false));

    fetch('/api/dashboard/location-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setLocationStats(d.data); })
      .catch(() => {});

    fetch('/api/dashboard/age-stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setAgeStats(d.data); })
      .catch(() => {});
  }, []);

  if (loading || !data) return <p className="text-muted-foreground">Loading dashboard...</p>;

  const statusData = {
    labels: Object.keys(data.byStatus),
    datasets: [{ data: Object.values(data.byStatus), backgroundColor: Object.keys(data.byStatus).map(s => STATUS_COLORS[s] || '#9ca3af'), borderWidth: 0 }],
  };

  const typeData = {
    labels: Object.keys(data.byType),
    datasets: [{ data: Object.values(data.byType), backgroundColor: TYPE_COLORS.slice(0, Object.keys(data.byType).length), borderWidth: 0 }],
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions — Print Labels removed */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => navigate('/assets')} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
          📦 View Assets
        </button>
        <RoleGate roles={['ADMIN', 'STAFF_ADMIN']}>
          <button onClick={() => navigate('/assets?action=create')} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent">
            ➕ Add Asset
          </button>
        </RoleGate>
        <button onClick={() => navigate('/audit')} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent">
          📋 Audit Trail
        </button>
        <RoleGate roles={['ADMIN']}>
          <button onClick={() => navigate('/settings')} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent">
            ⚙️ Settings
          </button>
        </RoleGate>
      </div>

      {/* Summary cards — replaced depreciation cards with status counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Assets</p>
          <p className="text-2xl font-bold">{data.totalAssets}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Assigned</p>
          <p className="text-2xl font-bold">{data.totalAssigned}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Under Maintenance</p>
          <p className="text-2xl font-bold">{data.underMaintenance}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Available</p>
          <p className="text-2xl font-bold">{data.available}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-2">Assets by Status</h3>
          <div className="h-48 flex items-center justify-center">
            <Doughnut data={statusData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-2">Assets by Type</h3>
          <div className="h-48 flex items-center justify-center">
            <Bar data={typeData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }} />
          </div>
        </div>
      </div>

      {/* Upcoming Maintenance + Warranties Expiring — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upcoming Maintenance Widget */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">🔧 Upcoming Maintenance</h3>
          {maintenanceLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {!maintenanceLoading && upcomingMaintenance.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center">No upcoming maintenance</p>
          )}
          {!maintenanceLoading && upcomingMaintenance.length > 0 && (
            <div className="space-y-0">
              {upcomingMaintenance.slice(0, 5).map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{schedule.asset.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{schedule.title}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(schedule.scheduledDate).toLocaleDateString('en-GB')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${schedule.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {schedule.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
              {upcomingMaintenance.length > 5 && (
                <p className="text-xs text-muted-foreground mt-2">Showing 5 of {upcomingMaintenance.length}</p>
              )}
            </div>
          )}
          <div className="mt-3 text-right">
            <button onClick={() => navigate('/assets')} className="text-xs text-muted-foreground hover:underline">
              View All Assets →
            </button>
          </div>
        </div>

        {/* Warranties Expiring Soon Widget */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">⚠️ Warranties Expiring Soon</h3>
          {warrantiesLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {!warrantiesLoading && warrantiesExpiring.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center">No warranties expiring within 90 days</p>
          )}
          {!warrantiesLoading && warrantiesExpiring.length > 0 && (
            <div className="space-y-0">
              {warrantiesExpiring.slice(0, 5).map(asset => (
                <div key={asset.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{asset.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{asset.location || '—'}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(asset.warrantyExpiry).toLocaleDateString('en-GB')}
                    </span>
                    <span className={`text-xs font-medium ${
                      asset.daysUntilExpiry < 0 ? 'text-red-600' :
                      asset.daysUntilExpiry === 0 ? 'text-red-600' :
                      asset.daysUntilExpiry <= 30 ? 'text-yellow-600' : 'text-orange-500'
                    }`}>
                      {asset.daysUntilExpiry < 0
                        ? `Expired ${Math.abs(asset.daysUntilExpiry)} days ago`
                        : asset.daysUntilExpiry === 0
                          ? 'Expires today'
                          : `Expires in ${asset.daysUntilExpiry} days`}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                      asset.warrantyStatus === 'expired' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {asset.warrantyStatus === 'expired' ? 'EXPIRED' : 'EXPIRING SOON'}
                    </span>
                  </div>
                </div>
              ))}
              {warrantiesExpiring.length > 5 && (
                <p className="text-xs text-muted-foreground mt-2">Showing 5 of {warrantiesExpiring.length}</p>
              )}
            </div>
          )}
          <div className="mt-3 text-right">
            <button onClick={() => navigate('/assets')} className="text-xs text-muted-foreground hover:underline">
              View All Assets →
            </button>
          </div>
        </div>
      </div>

      {/* Assets by Location + Assets by Age */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-2">📍 Assets by Location</h3>
          {locationStats.length === 0 ? (
            <p className="text-xs text-muted-foreground">No location data</p>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <Bar
                data={{
                  labels: locationStats.map(l => l.location),
                  datasets: [{ data: locationStats.map(l => l.count), backgroundColor: '#3b82f6', borderWidth: 0 }],
                }}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } },
                }}
              />
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium mb-2">📅 Assets by Age</h3>
          {ageStats.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No purchase date data available</p>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <Doughnut
                data={{
                  labels: ageStats.map(a => a.label),
                  datasets: [{
                    data: ageStats.map(a => a.count),
                    backgroundColor: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#9ca3af'],
                    borderWidth: 0,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                  },
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data.activityFeed.map((item, i) => (
            <div key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-3 py-1">{cleanActivityText(item)}</div>
          ))}
          {data.activityFeed.length === 0 && <p className="text-xs text-muted-foreground">No recent activity</p>}
        </div>
      </div>
    </div>
  );
}

// Clean up date strings in activity text for display
function cleanActivityText(text: string): string {
  return text
    // Replace ISO date strings
    .replace(
      /"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^"]*"/g,
      (match) => {
        const dateStr = match.replace(/"/g, '');
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return match;
        return `"${date.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' })}"`;
      }
    )
    // Replace long JS Date.toString() outputs
    .replace(
      /"[A-Z][a-z]+ [A-Z][a-z]+ \d+ \d{4}[^"]*"/g,
      (match) => {
        const dateStr = match.replace(/"/g, '');
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return match;
        return `"${date.toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' })}"`;
      }
    );
}