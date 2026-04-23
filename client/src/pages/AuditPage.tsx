import { AuditTimeline } from '../components/audit';

export default function AuditPage() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-bold mb-4">Audit Trail</h1>
      <AuditTimeline />
    </div>
  );
}