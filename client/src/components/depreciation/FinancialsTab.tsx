import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip as ChartTooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateDepreciation, USEFUL_LIFE_YEARS } from '../../utils/depreciation';

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
      <div className="py-8 text-center text-sm text-muted-foreground">
        <p className="text-2xl mb-2">📊</p>
        <p>No financial data available.</p>
        <p className="text-xs mt-1">Add a purchase price and date to see depreciation.</p>
      </div>
    );
  }

  const chartData = {
    labels: result.schedule.map(p => p.label),
    datasets: [
      {
        label: 'Book Value (₱)',
        data: result.schedule.map(p => p.value),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#3b82f6',
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
      },
      x: {
        ticks: { font: { size: 10 } },
      },
    },
  };

  const usefulLife = USEFUL_LIFE_YEARS[asset.type] || 5;

  return (
    <div className="space-y-4">
      {/* Current Book Value — hero number */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Current Book Value</p>
        <p className={`text-3xl font-bold mt-1 ${result.isFullyDepreciated ? 'text-muted-foreground' : 'text-foreground'}`}>
          ₱{result.currentBookValue.toLocaleString()}
        </p>
        {result.isFullyDepreciated && (
          <p className="text-xs text-yellow-600 mt-1">Fully depreciated — at salvage value</p>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Purchase Price</p>
          <p className="text-sm font-semibold mt-0.5">₱{result.purchasePrice.toLocaleString()}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Salvage Value</p>
          <p className="text-sm font-semibold mt-0.5">₱{result.salvageValue.toLocaleString()}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Annual Depreciation</p>
          <p className="text-sm font-semibold mt-0.5">₱{result.annualDepreciation.toLocaleString()}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Asset Age</p>
          <p className="text-sm font-semibold mt-0.5">{result.ageYears} year{result.ageYears !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Useful Life ({asset.type})</p>
          <p className="text-sm font-semibold mt-0.5">{usefulLife} years</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Value Lost</p>
          <p className="text-sm font-semibold mt-0.5 text-red-500">
            ₱{Math.round((result.purchasePrice - result.currentBookValue) * 100) / 100 > 0
              ? (result.purchasePrice - result.currentBookValue).toLocaleString()
              : '0'}
          </p>
        </div>
      </div>

      {/* Depreciation chart */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-3">Depreciation Schedule</h3>
        <div className="h-56">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Depreciation table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Period</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Book Value</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cumulative Dep.</th>
            </tr>
          </thead>
          <tbody>
            {result.schedule.map((point, i) => (
              <tr key={i} className={`border-t border-border ${i === 0 ? 'font-medium' : ''}`}>
                <td className="px-3 py-1.5">{point.label}</td>
                <td className="text-right px-3 py-1.5">₱{point.value.toLocaleString()}</td>
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