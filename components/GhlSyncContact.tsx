import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Link2, Loader2, UserPlus, XCircle } from 'lucide-react';
import { supabase } from '../services/supabase';
import { syncGhlContact, GhlContactSyncResult } from '../services/ghlConnection';
import { FILERSHUB_LOGO_URL } from '../constants';
import WidgetSignIn from './WidgetSignIn';

// Popup opened by the "Sync to FilersHub" button on GHL contact pages
// (public/ghl-contact-button.js): /ghl/sync-contact?location_id=…&contact_id=…
const HEADLINES: Record<GhlContactSyncResult['outcome'], string> = {
  already: 'Already synced',
  linked: 'Linked to existing client',
  created: 'New client created',
};

const DETAILS: Record<GhlContactSyncResult['outcome'], string> = {
  already: 'This GHL contact was already linked to this FilersHub client.',
  linked: 'This GHL contact is now linked to the FilersHub client with the same email.',
  created: 'No FilersHub client had this email, so a new client was created and linked.',
};

type State =
  | { kind: 'checking' }
  | { kind: 'signin' }
  | { kind: 'syncing' }
  | { kind: 'done'; result: GhlContactSyncResult }
  | { kind: 'error'; message: string };

const GhlSyncContact: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('location_id') || '';
  const contactId = params.get('contact_id') || '';
  const [state, setState] = useState<State>({ kind: 'checking' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!locationId || !contactId) {
      setState({ kind: 'error', message: 'This link is missing the GHL location or contact. Open it from a contact page in GHL.' });
      return;
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setState({ kind: 'signin' });
        return;
      }
      setState({ kind: 'syncing' });
      try {
        const result = await syncGhlContact(locationId, contactId);
        setState({ kind: 'done', result });
      } catch (e: any) {
        setState({ kind: 'error', message: e?.message || 'Could not sync this contact.' });
      }
    })();
  }, [locationId, contactId]);

  if (state.kind === 'signin') return <WidgetSignIn />;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center space-y-4">
        <img src={FILERSHUB_LOGO_URL} alt="FilersHub" className="h-8 mx-auto" />

        {(state.kind === 'checking' || state.kind === 'syncing') && (
          <div className="py-6 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto" />
            <p className="text-sm text-slate-600">Syncing this contact with FilersHub…</p>
          </div>
        )}

        {state.kind === 'done' && (
          <div className="space-y-3">
            {state.result.outcome === 'created'
              ? <UserPlus className="w-10 h-10 text-green-600 mx-auto" />
              : state.result.outcome === 'linked'
                ? <Link2 className="w-10 h-10 text-green-600 mx-auto" />
                : <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />}
            <h1 className="text-lg font-bold text-slate-800">{HEADLINES[state.result.outcome]}</h1>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-left">
              <p className="text-sm font-semibold text-slate-800 break-words">{state.result.clientName || 'Client'}</p>
              <p className="text-xs text-slate-500 break-all">{state.result.clientEmail}</p>
              {state.result.firmName && <p className="text-xs text-slate-400 mt-1">{state.result.firmName}</p>}
            </div>
            <p className="text-sm text-slate-600">{DETAILS[state.result.outcome]}</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="space-y-3">
            <XCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h1 className="text-lg font-bold text-slate-800">Couldn't sync</h1>
            <p className="text-sm text-red-600 break-words">{state.message}</p>
          </div>
        )}

        {(state.kind === 'done' || state.kind === 'error') && (
          <button
            type="button"
            onClick={() => window.close()}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export default GhlSyncContact;
