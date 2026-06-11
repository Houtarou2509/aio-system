import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  SearchX,
  WifiOff,
  Copy,
  Check,
  ArrowLeft,
  Link2,
  FileText,
  LogIn,
} from 'lucide-react';

/* ─── Types ─── */

interface VerifySuccess {
  verified: boolean;
  reason?: string;
  documentNumber?: string;
  signedAt?: string;
  signatoryName?: string;
}

interface ApiResponse {
  success: boolean;
  data?: VerifySuccess;
  error?: { message: string };
}

type VerificationState = 'loading' | 'verified' | 'not_signed' | 'not_verified' | 'not_found' | 'error';

/* ─── Helpers ─── */

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/* ─── Component ─── */

export default function AgreementVerificationPage() {
  const { documentNumber } = useParams<{ documentNumber: string }>();
  const [state, setState] = useState<VerificationState>('loading');
  const [data, setData] = useState<VerifySuccess | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedDocNum, setCopiedDocNum] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');

  const showCopyMsg = (msg: string) => {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2500);
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    if (!documentNumber) {
      setState('not_found');
      return;
    }

    fetch(`/api/agreements/verify/${documentNumber}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 404 });
          throw new Error(`Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((body: ApiResponse) => {
        if (!body.success || !body.data) {
          throw new Error(body.error?.message || 'Unexpected response');
        }
        const d = body.data;
        if (d.verified) {
          setData(d);
          setState('verified');
        } else if (d.reason === 'not_signed') {
          setData(d);
          setState('not_signed');
        } else if (d.reason === 'hash_mismatch') {
          setData(d);
          setState('not_verified');
        } else {
          setData(d);
          setState('not_verified');
        }
      })
      .catch(err => {
        if (err.code === 404 || err.message === 'not_found') {
          setState('not_found');
        } else {
          setErrorMsg(err.message || 'Network error');
          setState('error');
        }
      });
  }, [documentNumber]);

  /* ─── Render ─── */

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      {/* ── Branded Header ── */}
      <header className="w-full bg-[#012061] border-b border-[#001a4d] shrink-0">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 sm:px-6 h-16 sm:h-[72px]">
          {/* Left — Branding */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f8931f]">
              <span className="text-white font-extrabold text-[11px] leading-none">AIO</span>
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold tracking-tight text-[#f8931f] leading-tight">
                AIO System
              </span>
              <span className="text-[10px] tracking-widest font-medium text-slate-400 uppercase leading-tight">
                Document Verification
              </span>
            </div>
          </div>

          {/* Right — Login link */}
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Login</span>
          </Link>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex flex-1 items-start sm:items-center justify-center px-4 pt-8 pb-12 sm:py-8">
        {state === 'loading' && <LoadingState />}
        {state === 'not_found' && (
          <Card>
            <StatusIcon color="slate">
              <SearchX className="h-8 w-8" />
            </StatusIcon>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Document Not Verified</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              We could not verify this agreement document number.
            </p>
            {documentNumber && (
              <p className="mt-2 text-xs text-slate-400 font-mono break-all">
                {documentNumber}
              </p>
            )}
            <Actions documentNumber={documentNumber} currentUrl={currentUrl} copiedLink={copiedLink} onCopiedLink={setCopiedLink} onCopyMsg={showCopyMsg} copyMsg={copyMsg} />
          </Card>
        )}
        {state === 'error' && (
          <Card>
            <StatusIcon color="red">
              <WifiOff className="h-8 w-8" />
            </StatusIcon>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Unable to Verify</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Please try again or contact an administrator.
            </p>
            {errorMsg && (
              <p className="mt-2 text-xs text-red-400 break-all">{errorMsg}</p>
            )}
            <Actions documentNumber={documentNumber} currentUrl={currentUrl} copiedLink={copiedLink} onCopiedLink={setCopiedLink} onCopyMsg={showCopyMsg} copyMsg={copyMsg} />
          </Card>
        )}
        {state === 'verified' && (
          <Card wide>
            <StatusIcon color="green">
              <ShieldCheck className="h-8 w-8" />
            </StatusIcon>
            <h2 className="mt-4 text-lg font-bold text-emerald-800">Digital sign-off verified</h2>
            <p className="mt-1 text-sm text-emerald-600">
              This agreement document was digitally signed and verified by AIO System.
            </p>

            <div className="mt-6 w-full rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              <DetailRow label="Agreement No." value={data?.documentNumber || documentNumber || '—'} mono />
              <DetailRow label="Signed by" value={data?.signatoryName || '—'} />
              <DetailRow label="Signed at" value={formatDateTime(data?.signedAt)} />
              <DetailRow
                label="Verification status"
                value="Verified ✓"
                badge="green"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <CopyButton
                text={data?.documentNumber || documentNumber || ''}
                label="Copy Agreement No."
                copied={copiedDocNum}
                onCopied={setCopiedDocNum}
                onCopyMsg={showCopyMsg}
              />
              <CopyButton
                text={currentUrl}
                label="Copy verification link"
                copied={copiedLink}
                onCopied={setCopiedLink}
                onCopyMsg={showCopyMsg}
                secondary
              />
              <a
                href="/aio-system/"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Go to AIO System
              </a>
            </div>
            <CopyToast message={copyMsg} />

            <Footer />
          </Card>
        )}
        {state === 'not_signed' && (
          <Card>
            <StatusIcon color="amber">
              <ShieldAlert className="h-8 w-8" />
            </StatusIcon>
            <h2 className="mt-4 text-lg font-bold text-amber-800">Document not signed yet</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              This agreement exists, but it has not been digitally signed yet.
              Digital sign-off verification will be available after signing.
            </p>

            <div className="mt-5 w-full rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              <DetailRow label="Agreement No." value={data?.documentNumber || documentNumber || '—'} mono />
              <DetailRow label="Verification status" value="Not signed" badge="amber" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <CopyButton
                text={data?.documentNumber || documentNumber || ''}
                label="Copy Agreement No."
                copied={copiedDocNum}
                onCopied={setCopiedDocNum}
                onCopyMsg={showCopyMsg}
              />
              <CopyButton
                text={currentUrl}
                label="Copy verification link"
                copied={copiedLink}
                onCopied={setCopiedLink}
                onCopyMsg={showCopyMsg}
                secondary
              />
              <a
                href="/aio-system/"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Go to AIO System
              </a>
            </div>
            <CopyToast message={copyMsg} />

            <Footer />
          </Card>
        )}
        {state === 'not_verified' && (
          <Card>
            <StatusIcon color="red">
              <ShieldX className="h-8 w-8" />
            </StatusIcon>
            <h2 className="mt-4 text-lg font-bold text-red-800">Verification failed</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              The digital sign-off could not be verified. The document may be unsigned, altered, or invalid.
            </p>

            <div className="mt-5 w-full rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              <DetailRow label="Agreement No." value={data?.documentNumber || documentNumber || '—'} mono />
              <DetailRow label="Verification status" value="Failed" badge="red" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <CopyButton
                text={data?.documentNumber || documentNumber || ''}
                label="Copy Agreement No."
                copied={copiedDocNum}
                onCopied={setCopiedDocNum}
                onCopyMsg={showCopyMsg}
              />
              <CopyButton
                text={currentUrl}
                label="Copy verification link"
                copied={copiedLink}
                onCopied={setCopiedLink}
                onCopyMsg={showCopyMsg}
                secondary
              />
              <a
                href="/aio-system/"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Go to AIO System
              </a>
            </div>
            <CopyToast message={copyMsg} />

            <Footer />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function LoadingState() {
  return (
    <div className="text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#012061] border-t-transparent mb-4" />
      <p className="text-sm font-medium text-slate-600">Verifying document...</p>
      <p className="mt-1 text-xs text-slate-400">Checking document signature integrity</p>
    </div>
  );
}

function Card({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`w-full rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm text-center ${
        wide ? 'max-w-xl' : 'max-w-lg'
      }`}
    >
      {children}
    </div>
  );
}

function StatusIcon({ color, children }: { color: 'green' | 'amber' | 'red' | 'slate'; children: React.ReactNode }) {
  const bg: Record<string, string> = {
    green: 'bg-emerald-50 border-emerald-200',
    amber: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
    slate: 'bg-slate-100 border-slate-200',
  };
  const text: Record<string, string> = {
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    slate: 'text-slate-500',
  };
  return (
    <div
      className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border ${bg[color]} ${text[color]}`}
    >
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: 'green' | 'amber' | 'red';
}) {
  if (badge) {
    const badgeColors: Record<string, string> = {
      green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      amber: 'bg-amber-50 text-amber-700 border-amber-200',
      red: 'bg-red-50 text-red-700 border-red-200',
    };
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${badgeColors[badge]}`}>
          {value}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-medium text-slate-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function CopyButton({
  text,
  label,
  copied,
  onCopied,
  secondary,
  onCopyMsg,
}: {
  text: string;
  label: string;
  copied: boolean;
  onCopied: (v: boolean) => void;
  secondary?: boolean;
  onCopyMsg?: (msg: string) => void;
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap';
  const styles = copied
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    : secondary
    ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'
    : 'bg-[#012061] text-white hover:bg-[#001a4d]';
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          onCopied(true);
          onCopyMsg?.(secondary ? 'Verification link copied.' : 'Agreement No. copied.');
          setTimeout(() => onCopied(false), 2500);
        }).catch(() => {});
      }}
      className={`${base} ${styles}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 shrink-0" /> : secondary ? <Link2 className="h-3.5 w-3.5 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
      <span className="whitespace-nowrap">{copied ? 'Copied' : label}</span>
    </button>
  );
}

function Actions({ documentNumber: docNum, currentUrl, copiedLink, onCopiedLink, onCopyMsg, copyMsg }: {
  documentNumber?: string;
  currentUrl: string;
  copiedLink: boolean;
  onCopiedLink: (v: boolean) => void;
  onCopyMsg: (msg: string) => void;
  copyMsg: string;
}) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {docNum && (
          <CopyButton
            text={currentUrl}
            label="Copy verification link"
            copied={copiedLink}
            onCopied={onCopiedLink}
            onCopyMsg={onCopyMsg}
            secondary
          />
        )}
        <a
          href="/aio-system/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Go to AIO System
        </a>
      </div>
      <CopyToast message={copyMsg} />
    </div>
  );
}

function CopyToast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-emerald-600 animate-fade-in">
      <Check className="h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}

function Footer() {
  return (
    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider">
      <FileText className="h-3 w-3" />
      This page verifies the digital sign-off record stored in AIO System.
    </div>
  );
}