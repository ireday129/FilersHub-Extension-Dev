// Display helpers for the FilersHub tax-returns panel in GHL contact cards
// (components/GhlContactReturns.tsx).

// The Sync to FilersHub popup announces a finished sync here, so an open
// returns panel for the same contact reloads (both pages are on app.filershub.com).
export const CONTACT_SYNC_CHANNEL = 'filershub-ghl-contact';

export interface ContactSyncedMessage {
  type: 'contact-synced';
  contactId: string;
}

export interface ContactReturn {
  returnId: string;
  taxYear: string;
  returnType: string;
  status: string;
  updatedAt: string | null;
}

/** "Individual Tax Return (Form 1040)" -> "1040". Names without a form number are kept as-is. */
export function shortReturnType(returnType: string | null | undefined): string {
  const text = String(returnType ?? '').trim();
  const form = text.match(/\bForm\s+([0-9A-Z][0-9A-Z-]*)/i);
  return form ? form[1].toUpperCase() : text;
}

// Four-digit years sort as numbers; anything else sorts after them.
const yearValue = (year: string) => (/^\d{4}$/.test(year.trim()) ? Number(year.trim()) : -Infinity);

/** Newest tax year first; within a year, the most recently updated return first. */
export function sortReturns(returns: ContactReturn[]): ContactReturn[] {
  return [...returns].sort((a, b) => {
    const byYear = yearValue(b.taxYear) - yearValue(a.taxYear);
    if (byYear) return byYear; // NaN (both without a year) falls through
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
  });
}

// Same colors as the status cards on the FilersHub dashboard (components/Dashboard.tsx).
const STATUS_CLASSES: Record<string, string> = {
  'Intake Received': 'bg-blue-50 text-blue-600',
  'Missing Documents': 'bg-rose-50 text-rose-600',
  'Compliance Review': 'bg-indigo-50 text-indigo-600',
  'Invoice Sent': 'bg-emerald-50 text-emerald-600',
  'In Preparation': 'bg-slate-50 text-slate-600',
  'Ready for Signature': 'bg-purple-50 text-purple-600',
  'Filed': 'bg-cyan-50 text-cyan-600',
  'Accepted': 'bg-amber-50 text-amber-600',
  'Rejected': 'bg-red-50 text-red-600',
  'Bank Product': 'bg-slate-50 text-slate-600',
};

export function statusClass(status: string): string {
  return STATUS_CLASSES[status] ?? 'bg-slate-100 text-slate-600';
}
