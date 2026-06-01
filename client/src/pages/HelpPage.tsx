import { HelpCircle, Package, Edit3, FileSignature, RotateCcw, Repeat, QrCode, Link as LinkIcon, Trash2, Camera } from 'lucide-react';

const guides = [
  { icon: Package, title: 'Add an asset', body: 'Open Assets, select Add Asset, complete the required fields, then save. Use Property # when the official inventory number is available.' },
  { icon: Edit3, title: 'Edit an asset', body: 'Open the asset detail view and select Edit. The system records meaningful changes in the audit trail.' },
  { icon: FileSignature, title: 'Issue asset to personnel', body: 'Go to Issuances, select New Issuance, choose ready personnel, select assets, and complete the issuance.' },
  { icon: RotateCcw, title: 'Return asset', body: 'Open Issuances and use Return on active issuances. Returned assets are cleared from the assigned person.' },
  { icon: Repeat, title: 'Transfer asset', body: 'Use transfer actions on active issuances when the asset moves from one personnel record to another.' },
  { icon: QrCode, title: 'Print and scan QR labels', body: 'Select assets, choose Print QR, and use the AIO System Scan feature to resolve PROP: or ASSET: labels inside the app.' },
  { icon: LinkIcon, title: 'Generate guest link', body: 'Guest links are temporary public viewer links with expiry and access limits. They are separate from permanent inventory QR labels.' },
  { icon: Trash2, title: 'Dispose or retire asset', body: 'Use Dispose from the asset detail view when an asset is no longer active. Disposed assets appear under the Disposed / Retired filter.' },
  { icon: Camera, title: 'Camera note', body: 'Camera capture works on HTTPS or localhost. Browsers block camera access on plain HTTP LAN/IP addresses.' },
];

export default function HelpPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#012061] pt-14 md:pt-0 md:bg-transparent">
      <header className="sticky top-[56px] z-30 bg-[#012061] px-4 py-4 md:top-0 sm:px-6">
        <div className="flex items-center gap-3">
          <HelpCircle className="h-6 w-6 text-[#f8931f]" />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Quick Guide</h1>
            <p className="hidden text-xs text-white/50 sm:block">Common AIO System workflows for rollout support</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto bg-light-bg px-4 py-4 pb-24 dark:bg-slate-900 sm:px-6 md:pb-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {guides.map(({ icon: Icon, title, body }) => (
            <section key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f8931f]/10">
                  <Icon className="h-5 w-5 text-[#f8931f]" />
                </div>
                <h2 className="text-sm font-bold text-[#012061] dark:text-slate-100">{title}</h2>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
