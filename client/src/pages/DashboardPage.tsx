import { DashboardWidgets } from '../components/dashboard';

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-bold mb-4">Dashboard</h1>
      <DashboardWidgets />
    </div>
  );
}