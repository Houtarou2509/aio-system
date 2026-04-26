import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip as ChartTooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateDepreciation, USEFUL_LIFE_YEARS } from '../../utils/depreciation';
import { TrendingDown, DollarSign, Percent } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, ChartTooltip);

interface Props {
  asset: {
    id: string;
    name: string;
    type: string;
    purchasePrice?: number | null;
    purchaseDate?: string | null;
  };
}

/* ─── Stat Card ─── */
function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color = 'indigo',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sublabel?: string;
  color?: 'indigo' | 'red' | 'slate' | 'emerald';
}) {
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${colorMap[color]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color === 'red' ? 'text-red-600' : color === 'indigo' ? 'text-indigo-600' : 'text-slate-900'}`}>{value}</p>
      {sublabel && <p className="text-[11px] text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default function FinancialsTab({ asset }: Props) {
  const result = useMemo(
    () => calculateDepreciation(
      Number(asset.purchasePrice) || 0,
      asset.purchaseDate,
      asset.type,
    ),
    [asset.purchasePrice, asset.purchaseDate, asset.type],
  );

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <DollarSign className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No financial data available</p>
        <p className="text-xs mt-1">Add a purchase price and date to see depreciation.</p>
      </div>
    );
  }

  const chartData = {
    labels: result.schedule.map(p => p.label),
    datasets: [
      {
        label: 'Asset Value (₱)',
        data: result.schedule.map(p => p.value),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#4f46e5',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
      {
        label: 'Cumulative Depreciation (₱)',
        data: result.schedule.map(p => p.depreciation),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderDash: [5, 5],
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ₱${Number(ctx.parsed.y).toLocaleString()}`,
        },
      },
      legend: {
        position: 'bottom' as const,
        labels: { boxWidth: 12, font: { size: 11 } },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `₱${Number(value).toLocaleString()}`,
          font: { size: 10 },
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      x: {
        ticks: { font: { size: 10 } },
        grid: { display: false },
      },
    },
  };

  const usefulLife = USEFUL_LIFE_YEARS[asset.type] || 5;

  return (
    <div className="space-y-4">
      {/* ─── 3-Column Stats Row ─── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={DollarSign}
          label="Current Value"
          value={`₱${result.currentBookValue.toLocaleString()}`}
          sublabel={result.isFullyDepreciated ? 'Fully depreciated' : `${result.ageYears} yr${result.ageYears !== 1 ? 's' : ''} old`}
          color={result.isFullyDepreciated ? 'slate' : 'indigo'}
        />
        <StatCard
          icon={TrendingDown}
          label="Total Depreciated"
          value={`₱${Math.round((result.purchasePrice - result.currentBookValue) * 100) / 100 > 0 ? (result.purchasePrice - result.currentBookValue).toLocaleString() : '0'}`}
          sublabel={`of ₱${result.purchasePrice.toLocaleString()} purchase price`}
          color="red"
        />
        <StatCard
          icon={Percent}
          label="Salvage Value"
          value={`₱${result.salvageValue.toLocaleString()}`}
          sublabel={`${usefulLife} yr useful life · ${asset.type}`}
          color="emerald"
        />
      </div>

      {/* ─── Quick Metrics ─── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Purchase Price</p>
            <p className="text-sm font-bold text-slate-900">₱{result.purchasePrice.toLocaleString()}</p>
          </div>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50">
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Annual Depreciation</p>
            <p className="text-sm font-bold text-slate-900">₱{result.annualDepreciation.toLocaleString()}</p>
          </div>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50">
            <TrendingDown className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* ─── Depreciation Chart ─── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">Depreciation Schedule</h3>
        <div className="h-56">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* ─── Depreciation Table ─── */}
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Depreciation Table</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-slate-500 text-xs">Period</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 text-xs">Asset Value</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 text-xs">Cumulative Dep.</th>
            </tr>
          </thead>
          <tbody>
            {result.schedule.map((point, i) => (
              <tr key={i} className={`border-t border-slate-100 hover:bg-slate-50 transition-colors ${i === 0 ? 'font-medium' : ''}`}>
                <td className="px-3 py-1.5 text-slate-700">{point.label}</td>
                <td className="text-right px-3 py-1.5 text-indigo-600 font-medium">₱{point.value.toLocaleString()}</td>
                <td className="text-right px-3 py-1.5 text-red-500">
                  {point.depreciation > 0 ? `₱${point.depreciation.toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}