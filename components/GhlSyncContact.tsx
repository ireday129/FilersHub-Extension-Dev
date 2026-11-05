import React, { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, UserPlus, XCircle } from 'lucide-react';
import { supabase } from '../services/supabase';
import { isSessionProblem, syncGhlContact, GhlContactSyncResult } from '../services/ghlConnection';
import { CONTACT_SYNC_CHANNEL, ContactSyncedMessage } from '../services/contactReturns';
import { FILERSHUB_LOGO_URL } from '../constants';
import WidgetSignIn from './WidgetSignIn';

// Popup opened by the "Sync to FilersHub" button on GHL contact pages
// (public/ghl-contact-button.js): /ghl/sync-contact?location_id=…&contact_id=…
// Syncing needs a click, so a forwarded link can't change anything on its own.
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
  | { kind: 'ready'; email: string }
  | { kind: 'syncing'; email: string }
  | { kind: 'done'; result: GhlContactSyncResult }
  | { kind: 'error'; message: string };

// Signs out of FilersHub in this browser only, not on the person's other devices.
const switchAccount = async () => {
  await supabase.auth.signOut({ scope: 'local' });
  window.location.reload();
};

// Lets an open tax-returns panel for this contact refresh itself.
function announceSync(contactId: string) {
  try {
    const channel = new BroadcastChannel(CONTACT_SYNC_CHANNEL);
    const message: ContactSyncedMessage = { type: 'contact-synced', contactId };
    channel.postMessage(message);
    channel.close();
  } catch { /* BroadcastChannel unavailable: the panel's refresh button still works */ }
}

const GhlSyncContact: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('location_id') || '';
  const contactId = params.get('contact_id') || '';
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    if (!locationId || !contactId) {
      setState({ kind: 'error', message: 'This link is missing the GHL location or contact. Open it from a contact page in GHL.' });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setState({ kind: 'signin' });
      else setState({ kind: 'ready', email: data.session.user.email || '' });
    });
  }, [locationId, contactId]);

  const runSync = async (email: string) => {
    setState({ kind: 'syncing', email });
    try {
      const result = await syncGhlContact(locationId, contactId);
      setState({ kind: 'done', result });
      announceSync(contactId);
    } catch (e: any) {
      const message = e?.message || 'Could not sync this contact.';
      if (isSessionProblem(message)) {
        setState({ kind: 'signin' });
      } else {
        setState({ kind: 'error', message });
      }
    }
  };

  if (state.kind === 'signin') {
    return <WidgetSignIn subtitle="Sign in to sync this GHL contact with FilersHub." />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center space-y-4">
        <img src={FILERSHUB_LOGO_URL} alt="FilersHub" className="h-8 mx-auto" />

        {state.kind === 'checking' && (
          <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto" />
        )}

        {(state.kind === 'ready' || state.kind === 'syncing') && (
          <div className="space-y-3">
            <h1 className="text-lg font-bold text-slate-800">Sync this contact to FilersHub</h1>
            <p className="text-sm text-slate-600">
              Links this GHL contact to the FilersHub client with the same email, or creates the client if there isn't one.
            </p>
            <button
              type="button"
              disabled={state.kind === 'syncing'}
              onClick={() => runSync(state.email)}
              className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {state.kind === 'syncing' && <Loader2 className="w-4 h-4 animate-spin" />}
              {state.kind === 'syncing' ? 'Syncing…' : 'Sync contact'}
            </button>
            {state.email && (
              <p className="text-xs text-slate-400">
                Signed in as {state.email} ·{' '}
                <button type="button" onClick={switchAccount} className="underline hover:text-slate-600">
                  Not you?
                </button>
              </p>
            )}
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
            <button type="button" onClick={switchAccount} className="text-xs font-semibold text-slate-500 underline hover:text-slate-700">
              Sign in with a different FilersHub account
            </button>
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
