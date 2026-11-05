import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../services/supabase';
import { fetchGhlContactReturns, isSessionProblem } from '../services/ghlConnection';
import {
  CONTACT_SYNC_CHANNEL,
  ContactReturn,
  ContactSyncedMessage,
  shortReturnType,
  sortReturns,
  statusClass,
} from '../services/contactReturns';
import WidgetSignIn from './WidgetSignIn';

// Read-only panel shown inside the GHL contact card by public/ghl-contact-button.js:
// /ghl/contact-returns?location_id=…&contact_id=…  Lists each tax return FilersHub
// has for the linked client, newest year first, with its status.

// Must match HEIGHT_MESSAGE in public/ghl-contact-button.js.
const HEIGHT_MESSAGE = 'filershub-contact-returns:height';

type State =
  | { kind: 'loading' }
  | { kind: 'signin' }
  | { kind: 'unlinked' }
  | { kind: 'list'; returns: ContactReturn[] }
  | { kind: 'error'; message: string };

// Signs out of FilersHub in this browser only, not on the person's other devices.
const switchAccount = async () => {
  await supabase.auth.signOut({ scope: 'local' });
  window.location.reload();
};

const GhlContactReturns: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('location_id') || '';
  const contactId = params.get('contact_id') || '';
  const [state, setState] = useState<State>({ kind: 'loading' });
  // The sign-in form stays folded away until asked for, so it doesn't push the contact details down.
  const [showSignIn, setShowSignIn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!locationId || !contactId) {
      setState({ kind: 'error', message: 'Open this from a contact page in GHL.' });
      return;
    }
    setState({ kind: 'loading' });
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setState({ kind: 'signin' });
      return;
    }
    try {
      const result = await fetchGhlContactReturns(locationId, contactId);
      setState(result.linked ? { kind: 'list', returns: sortReturns(result.returns ?? []) } : { kind: 'unlinked' });
    } catch (e: any) {
      const message = e?.message || "Couldn't load tax returns.";
      // Ask for a fresh sign-in; signing in again replaces the old session.
      setState(isSessionProblem(message) ? { kind: 'signin' } : { kind: 'error', message });
    }
  }, [locationId, contactId]);

  useEffect(() => {
    load();
  }, [load]);

  // Reload after the Sync to FilersHub popup links this contact.
  useEffect(() => {
    if (!contactId || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CONTACT_SYNC_CHANNEL);
    channel.onmessage = (event: MessageEvent<ContactSyncedMessage>) => {
      if (event.data?.type === 'contact-synced' && event.data.contactId === contactId) load();
    };
    return () => channel.close();
  }, [contactId, load]);

  // Tell the GHL page how tall the panel is, so the card fits it without a scrollbar.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || window.parent === window) return;
    const send = () =>
      window.parent.postMessage({ type: HEIGHT_MESSAGE, height: Math.ceil(el.getBoundingClientRect().height) }, '*');
    send();
    const observer = new ResizeObserver(send);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="bg-white rounded-lg border border-slate-200 px-3 py-2.5 text-left">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">FilersHub tax returns</p>
        {(state.kind === 'list' || state.kind === 'unlinked' || state.kind === 'error') && (
          <button
            type="button"
            onClick={load}
            title="Refresh"
            aria-label="Refresh tax returns"
            className="text-slate-400 hover:text-slate-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {state.kind === 'loading' && (
        <div className="flex justify-center py-1.5">
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        </div>
      )}

      {state.kind === 'signin' && !showSignIn && (
        <p className="text-sm text-slate-500">
          <button type="button" onClick={() => setShowSignIn(true)} className="font-semibold text-blue-600 hover:underline">
            Sign in to FilersHub
          </button>{' '}
          to see this contact's tax returns.
        </p>
      )}

      {state.kind === 'signin' && showSignIn && <WidgetSignIn subtitle="Sign in to see this contact's tax returns." />}

      {state.kind === 'unlinked' && (
        <p className="text-sm text-slate-500">
          Not in FilersHub yet. Use <span className="font-semibold">Sync to FilersHub</span> above to link this contact.
        </p>
      )}

      {state.kind === 'list' && state.returns.length === 0 && (
        <p className="text-sm text-slate-500">No tax returns yet.</p>
      )}

      {state.kind === 'list' && state.returns.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {state.returns.map((r) => (
            <li key={r.returnId} className="flex items-center gap-2 py-1.5">
              <span className="w-10 shrink-0 text-sm font-semibold text-slate-800">{r.taxYear || '—'}</span>
              <span className="flex-1 min-w-0 truncate text-xs text-slate-500" title={r.returnType}>
                {shortReturnType(r.returnType)}
              </span>
              <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusClass(r.status)}`}>
                {r.status || 'No status'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.kind === 'error' && (
        <div className="space-y-1">
          <p className="text-sm text-red-600 break-words">{state.message}</p>
          <div className="flex flex-wrap gap-x-3 text-xs">
            <button type="button" onClick={load} className="font-semibold text-slate-600 underline hover:text-slate-800">
              Try again
            </button>
            <button type="button" onClick={switchAccount} className="text-slate-500 underline hover:text-slate-700">
              Sign in with a different account
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GhlContactReturns;
