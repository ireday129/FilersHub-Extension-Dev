import React, { useEffect, useState } from 'react';
import { Link2, AlertCircle, Copy, Check, Eye, EyeOff, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { useExtensionMode } from '../hooks/useExtensionMode';
import {
  GhlConnectionStatus,
  getGhlStatus,
  connectGhl,
  disconnectGhl,
  revealActionsSecret,
  regenerateActionsSecret,
} from '../services/ghlConnection';
import { ACTION_TEMPLATES, actionBody } from '../services/ghlActionTemplates';

interface Props {
  firmId: string;
  onStatus?: (s: GhlConnectionStatus) => void;
}

const SCOPES = ['contacts.readonly', 'contacts.write', 'locations.readonly', 'users.readonly'];
const SIDEBAR_URL = 'https://app.filershub.com/widget?location_id={{location.id}}&email={{user.email}}';
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* clipboard unavailable */ }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline shrink-0">
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
};

const GhlConnectionCard: React.FC<Props> = ({ firmId, onStatus }) => {
  const { isExtension } = useExtensionMode();
  const [status, setStatus] = useState<GhlConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [secretBusy, setSecretBusy] = useState<'reveal' | 'regenerate' | null>(null);
  const anyBusy = busy || secretBusy !== null;
  const [editing, setEditing] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [openTemplate, setOpenTemplate] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const apply = (s: GhlConnectionStatus) => {
    setStatus(s);
    onStatus?.(s);
  };

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getGhlStatus(firmId)
      .then(s => {
        if (cancelled) return;
        apply(s);
        setLocationId(s.locationId || s.suggestedLocationId || '');
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load GHL connection.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, reloadKey]);

  const handleConnect = async () => {
    if (anyBusy) return;
    setBusy(true);
    setError('');
    try {
      const s = await connectGhl(firmId, locationId.trim(), token.trim());
      apply(s);
      setToken('');
      setEditing(false);
      setSecret(null);
      setSecretVisible(false);
    } catch (e: any) {
      setError(e.message || 'Could not connect to GHL.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (anyBusy) return;
    if (!confirm('Disconnect GoHighLevel? This deletes the stored token AND the workflow secret. Workflow actions and CRM sync will stop working. If you reconnect later, a NEW secret is created, so you must update your GHL workflows with it.')) return;
    setBusy(true);
    setError('');
    try {
      const s = await disconnectGhl(firmId);
      apply(s);
      setLocationId(s.suggestedLocationId || '');
      setToken('');
      setEditing(false);
      setSecret(null);
      setSecretVisible(false);
    } catch (e: any) {
      setError(e.message || 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    if (secretBusy) return;
    if (secretVisible) { setSecretVisible(false); return; }
    setError('');
    setSecretBusy('reveal');
    try {
      if (secret === null) setSecret(await revealActionsSecret(firmId));
      setSecretVisible(true);
    } catch (e: any) {
      setError(e.message || 'Could not reveal secret.');
    } finally {
      setSecretBusy(null);
    }
  };

  const handleRegenerate = async () => {
    if (anyBusy) return;
    if (!confirm('Regenerate the secret? Any GHL workflows using the old secret will stop working until you update them.')) return;
    setError('');
    setSecretBusy('regenerate');
    try {
      setSecret(await regenerateActionsSecret(firmId));
      setSecretVisible(true);
    } catch (e: any) {
      setError(e.message || 'Could not regenerate secret.');
    } finally {
      setSecretBusy(null);
    }
  };

  const connected = !!status?.connected;
  const broken = connected && status?.status === 'broken';
  const showForm = !connected || editing;
  const oldToken = !!status?.tokenAddedAt && Date.now() - new Date(status.tokenAddedAt).getTime() > NINETY_DAYS_MS;
  const pad = isExtension ? 'p-4' : 'p-6';
  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200';

  return (
    <section id="ghl-connection" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`${pad} border-b border-slate-100 flex items-center gap-3`}>
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
          <Link2 size={20} />
        </div>
        <div className="min-w-0">
          <h2 className={`${isExtension ? 'text-sm' : 'text-lg'} font-bold text-slate-800`}>GoHighLevel Connection</h2>
          <p className="text-xs text-slate-500">Connect your GHL sub-account with a Private Integration token.</p>
        </div>
      </div>

      <div className={`${pad} space-y-4`}>
        {loading && <p className="text-sm text-slate-400">Loading connection...</p>}

        {!loading && broken && status && (
          <div className="flex gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="break-words min-w-0">
              GHL connection stopped working on {fmtDate(status.lastCheckedAt)}: {status.lastError || 'unknown error'}. Paste a new token.
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="flex gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="break-words min-w-0 flex-1">{error}</span>
            {!status && (
              <button type="button" onClick={() => setReloadKey(k => k + 1)} className="shrink-0 text-xs font-bold text-red-700 underline">Retry</button>
            )}
          </div>
        )}

        {!loading && connected && status && (
          <div className="space-y-1.5 text-sm text-slate-600">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 break-words">{status.locationName || status.locationId}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${status.isFilersHubAgency ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                {status.isFilersHubAgency ? 'Your agency' : 'Other agency'}
              </span>
            </div>
            <p className="text-xs">Token added {fmtDate(status.tokenAddedAt)}</p>
            {oldToken && <p className="text-xs text-amber-600 font-medium">GHL recommends replacing this token every 90 days.</p>}
            <p className="text-xs text-slate-400">Last checked {fmtDateTime(status.lastCheckedAt)}</p>
            {!editing && (
              <div className="flex gap-4 pt-1">
                <button type="button" disabled={anyBusy} onClick={() => { setEditing(true); setError(''); }} className="text-xs font-bold text-indigo-600 hover:underline">Replace token</button>
                <button type="button" disabled={anyBusy} onClick={handleDisconnect} className="text-xs font-bold text-red-600 hover:underline">Disconnect</button>
              </div>
            )}
          </div>
        )}

        {!loading && showForm && (
          <div className="space-y-4">
            {!connected && (
              <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-600">
                <li>Open your GHL sub-account.</li>
                <li>Go to Settings, then Private Integrations.</li>
                <li>Click Create new integration.</li>
                <li>Name it "FilersHub".</li>
                <li>
                  Tick these scopes:{' '}
                  {SCOPES.map(s => <code key={s} className="text-xs bg-slate-100 rounded px-1 py-0.5 mr-1 inline-block">{s}</code>)}
                </li>
                <li>Copy the token and paste it below.</li>
              </ol>
            )}
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Location ID</span>
                <input type="text" value={locationId} onChange={e => setLocationId(e.target.value)} className={inputCls} placeholder="Sub-account Location ID" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Private Integration token</span>
                <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} className={inputCls} placeholder="pit-..." />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={anyBusy || !locationId.trim() || !token.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {busy ? 'Connecting...' : connected ? 'Save new token' : 'Connect'}
                </button>
                {editing && (
                  <button type="button" onClick={() => { setEditing(false); setToken(''); setError(''); }} className="text-xs font-bold text-slate-500 hover:underline">Cancel</button>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && connected && status && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Workflow actions</h3>
            <div className="text-xs text-slate-600 space-y-1">
              <p>In your GHL workflow add a <strong>Custom Webhook</strong> action:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Method: <strong>POST</strong></li>
                <li>URL: the Actions URL below</li>
                <li>Authorization: <strong>Bearer Token</strong> = your secret (header <code className="bg-slate-100 rounded px-1">Authorization: Bearer &lt;secret&gt;</code>)</li>
                <li>Content-Type: <strong>application/json</strong></li>
                <li>Body: paste a template below</li>
              </ul>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500">Actions URL</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 break-all">{status.actionsUrl}</code>
                <CopyButton text={status.actionsUrl} />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500">Secret</span>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 min-w-0 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 break-all">
                  {secretVisible && secret ? secret : '••••••••••••••••••••'}
                </code>
                <button type="button" disabled={anyBusy} onClick={handleReveal} className="disabled:opacity-50 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline shrink-0">
                  {secretVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                  {secretBusy === 'reveal' ? 'Revealing…' : secretVisible ? 'Hide' : 'Reveal'}
                </button>
                {secret && <CopyButton text={secret} />}
                <button type="button" disabled={anyBusy} onClick={handleRegenerate} className="disabled:opacity-50 inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline shrink-0">
                  <RefreshCw size={12} /> {secretBusy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {ACTION_TEMPLATES.map(t => {
                const open = openTemplate === t.key;
                const body = actionBody(t);
                return (
                  <div key={t.key} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenTemplate(open ? null : t.key)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="min-w-0 break-words">{t.label}</span>
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        <p className="text-xs text-slate-500">{t.description}</p>
                        <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 overflow-x-auto">{body}</pre>
                        <CopyButton text={body} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && connected && status && !status.isFilersHubAgency && (
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Add FilersHub to your GHL sidebar</h3>
            <p className="text-xs text-slate-500">
              In GHL, go to Settings, then Custom Menu Links, and create a link with this URL. Set it to open in an iframe and show in this sub-account only.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 break-all">{SIDEBAR_URL}</code>
              <CopyButton text={SIDEBAR_URL} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default GhlConnectionCard;
