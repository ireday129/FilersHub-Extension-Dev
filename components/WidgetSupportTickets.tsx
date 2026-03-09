import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Send, Loader2, MessageCircle, ChevronRight, Inbox } from 'lucide-react';

const FH_GREEN = '#42ab30';

interface Ticket {
  ticket_id: string;
  subject: string;
  category: string;
  status: string;
  submitted_by_name: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string | null;
}

interface Message {
  message_id: string;
  ticket_id: string;
  sender_type: 'firm' | 'admin';
  sender_name: string;
  body: string;
  created_at: string;
}

interface WidgetSupportTicketsProps {
  locationId: string;
  email: string;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  received: 'bg-blue-50 text-blue-600',
  in_progress: 'bg-amber-50 text-amber-600',
  awaiting_response: 'bg-violet-50 text-violet-600',
  resolved: 'bg-emerald-50 text-emerald-600',
  closed: 'bg-slate-100 text-slate-400',
};

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  in_progress: 'In Progress',
  awaiting_response: 'Awaiting Response',
  resolved: 'Resolved',
  closed: 'Closed',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  billing: 'Billing',
  bug: 'Bug Report',
  feature_request: 'Feature Request',
};

function formatDate(iso: string): string {
  const now = new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
}

const WidgetSupportTickets: React.FC<WidgetSupportTicketsProps> = ({ locationId, email, onClose }) => {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Create form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiCall = async (payload: Record<string, any>) => {
    const res = await fetch('/api/support-tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, email, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  // Load ticket list
  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await apiCall({ action: 'list' });
      setTickets(data.tickets || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // Load ticket detail
  const openTicket = async (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setView('detail');
    setMessagesLoading(true);
    try {
      const data = await apiCall({ action: 'get', ticketId });
      setSelectedTicket(data.ticket);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load ticket:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Scroll to bottom of messages
  useEffect(() => {
    if (view === 'detail' && !messagesLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, messagesLoading, view]);

  // Create ticket
  const handleCreate = async () => {
    if (!subject.trim() || !body.trim()) return;
    setCreating(true);
    try {
      await apiCall({ action: 'create', subject: subject.trim(), category, body: body.trim() });
      setSubject('');
      setCategory('general');
      setBody('');
      setView('list');
      await loadTickets();
    } catch (err) {
      console.error('Failed to create ticket:', err);
    } finally {
      setCreating(false);
    }
  };

  // Send reply
  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicketId) return;
    setSending(true);
    try {
      const data = await apiCall({ action: 'reply', ticketId: selectedTicketId, body: replyText.trim() });
      setMessages(prev => [...prev, data.message]);
      setReplyText('');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  };

  // ── Ticket List View ──
  if (view === 'list') {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1 -ml-1 rounded-lg hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
            <h2 className="text-sm font-semibold text-slate-800">Support Tickets</h2>
          </div>
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
            style={{ background: FH_GREEN }}
          >
            <Plus className="w-3.5 h-3.5" /> New Ticket
          </button>
        </div>

        {/* Ticket List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <Inbox className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm text-slate-400 text-center">No tickets yet</p>
            <p className="text-xs text-slate-300 text-center mt-1">Need help? Create a support ticket and we'll get back to you.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <button
                key={ticket.ticket_id}
                onClick={() => openTicket(ticket.ticket_id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{ticket.subject}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[ticket.status] || 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABELS[ticket.status] || ticket.status}
                    </span>
                    <span className="text-[10px] text-slate-400">{CATEGORY_LABELS[ticket.category] || ticket.category}</span>
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className="text-[10px] text-slate-400">{formatDate(ticket.updated_at)}</span>
                    {ticket.message_count > 1 && (
                      <>
                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <MessageCircle className="w-3 h-3" /> {ticket.message_count}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Create Ticket View ──
  if (view === 'create') {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <button onClick={() => setView('list')} className="p-1 -ml-1 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <h2 className="text-sm font-semibold text-slate-800">New Support Ticket</h2>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-green-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-green-400 transition-colors bg-white"
            >
              <option value="general">General</option>
              <option value="billing">Billing</option>
              <option value="bug">Bug Report</option>
              <option value="feature_request">Feature Request</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your issue or question in detail..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-green-400 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setView('list')}
              className="flex-1 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !subject.trim() || !body.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: FH_GREEN }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Ticket'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Ticket Detail / Conversation View ──
  const isResolved = selectedTicket?.status === 'resolved' || selectedTicket?.status === 'closed';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <button
          onClick={() => { setView('list'); setSelectedTicketId(null); setSelectedTicket(null); setMessages([]); setReplyText(''); }}
          className="p-1 -ml-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{selectedTicket?.subject || 'Loading...'}</p>
        </div>
        {selectedTicket && (
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${STATUS_STYLES[selectedTicket.status] || 'bg-slate-100 text-slate-500'}`}>
            {STATUS_LABELS[selectedTicket.status] || selectedTicket.status}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 120 }}>
        {messagesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : (
          messages.map((msg) => {
            const isFirm = msg.sender_type === 'firm';
            return (
              <div key={msg.message_id} className={`flex ${isFirm ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${isFirm ? 'bg-green-50 border border-green-100' : 'bg-slate-50 border border-slate-100'}`}>
                  <p className={`text-[10px] font-medium mb-0.5 ${isFirm ? 'text-green-600' : 'text-slate-500'}`}>
                    {isFirm ? 'You' : msg.sender_name}
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.body}</p>
                  <p className="text-[10px] text-slate-300 mt-1">{formatTime(msg.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input */}
      {!isResolved && (
        <div className="border-t border-slate-100 p-3 shrink-0">
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your reply..."
              rows={2}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-green-400 transition-colors resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleReply();
                }
              }}
            />
            <button
              onClick={handleReply}
              disabled={sending || !replyText.trim()}
              className="self-end p-2 rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: FH_GREEN }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {isResolved && (
        <div className="border-t border-slate-100 px-4 py-3 text-center shrink-0">
          <p className="text-xs text-slate-400">This ticket has been {selectedTicket?.status}. Create a new ticket if you need further help.</p>
        </div>
      )}
    </div>
  );
};

export default WidgetSupportTickets;
