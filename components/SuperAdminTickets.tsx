import React, { useEffect, useMemo, useState, useRef } from 'react';
import { MessageCircle, Loader2, Send, ChevronDown, ChevronUp, Inbox } from 'lucide-react';
import { supabase } from '../services/supabase';

interface TicketRow {
  ticket_id: string;
  firm_id: string;
  subject: string;
  category: string;
  status: string;
  submitted_by_email: string;
  submitted_by_name: string | null;
  created_at: string;
  updated_at: string;
  firm_name: string;
  message_count: number;
}

interface TicketMessage {
  message_id: string;
  ticket_id: string;
  sender_type: 'firm' | 'admin';
  sender_name: string;
  sender_email: string | null;
  body: string;
  created_at: string;
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
  awaiting_response: 'Awaiting',
  resolved: 'Resolved',
  closed: 'Closed',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  billing: 'Billing',
  bug: 'Bug',
  feature_request: 'Feature',
  client_login: 'Client Login',
  staff_login: 'Staff Login',
};

const STATUSES = ['received', 'in_progress', 'awaiting_response', 'resolved', 'closed'];

interface SuperAdminTicketsProps {
  onOpenCountChange?: (count: number) => void;
}

const SuperAdminTickets: React.FC<SuperAdminTicketsProps> = ({ onOpenCountChange }) => {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('Open');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      // Get firm names
      const firmIds = [...new Set((ticketsData || []).map((t: any) => t.firm_id))];
      const { data: firmsData } = await supabase
        .from('firms')
        .select('firm_id, firm_name')
        .in('firm_id', firmIds);

      const nameMap = new Map((firmsData || []).map((f: any) => [f.firm_id, f.firm_name]));

      // Get message counts
      const ticketIds = (ticketsData || []).map((t: any) => t.ticket_id);
      let countMap: Record<string, number> = {};

      if (ticketIds.length > 0) {
        const { data: allMessages } = await supabase
          .from('ticket_messages')
          .select('ticket_id')
          .in('ticket_id', ticketIds);

        for (const m of (allMessages || [])) {
          countMap[m.ticket_id] = (countMap[m.ticket_id] || 0) + 1;
        }
      }

      const enriched: TicketRow[] = (ticketsData || []).map((t: any) => ({
        ...t,
        firm_name: nameMap.get(t.firm_id) || 'Unknown Firm',
        message_count: countMap[t.ticket_id] || 0,
      }));

      setTickets(enriched);

      // Report open count to parent
      const openCount = enriched.filter(t => !['resolved', 'closed'].includes(t.status)).length;
      onOpenCountChange?.(openCount);
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const filteredTickets = useMemo(() => {
    if (filter === 'All') return tickets;
    if (filter === 'Open') return tickets.filter(t => !['resolved', 'closed'].includes(t.status));
    if (filter === 'Awaiting') return tickets.filter(t => t.status === 'awaiting_response');
    if (filter === 'Resolved') return tickets.filter(t => t.status === 'resolved' || t.status === 'closed');
    return tickets;
  }, [tickets, filter]);

  const handleExpand = async (ticketId: string) => {
    if (expandedId === ticketId) {
      setExpandedId(null);
      setMessages([]);
      setReplyText('');
      return;
    }

    setExpandedId(ticketId);
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (expandedId && !messagesLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, messagesLoading]);

  const handleReply = async () => {
    if (!replyText.trim() || !expandedId) return;
    setSending(true);
    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: expandedId,
          sender_type: 'admin',
          sender_name: 'FilersHub Support',
          body: replyText.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      setMessages(prev => [...prev, data]);
      setReplyText('');

      // Update ticket status and timestamp
      await supabase
        .from('support_tickets')
        .update({ status: 'awaiting_response', updated_at: new Date().toISOString() })
        .eq('ticket_id', expandedId);

      setTickets(prev => prev.map(t =>
        t.ticket_id === expandedId ? { ...t, status: 'awaiting_response', updated_at: new Date().toISOString(), message_count: t.message_count + 1 } : t
      ));
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('ticket_id', ticketId);

      if (error) throw error;

      setTickets(prev => prev.map(t =>
        t.ticket_id === ticketId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t
      ));

      const openCount = tickets.filter(t => {
        if (t.ticket_id === ticketId) return !['resolved', 'closed'].includes(newStatus);
        return !['resolved', 'closed'].includes(t.status);
      }).length;
      onOpenCountChange?.(openCount);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 0) return `Today at ${time}`;
    if (diffDays === 1) return `Yesterday at ${time}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
            <MessageCircle size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Support Tickets</h2>
            <p className="text-xs text-slate-400">Manage support requests from firm owners</p>
          </div>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-1">
          {['Open', 'Awaiting', 'Resolved', 'All'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filter === f ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Inbox className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-sm text-slate-400">No tickets found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Firm</th>
                <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</th>
                <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Submitted By</th>
                <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Activity</th>
                <th className="text-center px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Msgs</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map(ticket => (
                <React.Fragment key={ticket.ticket_id}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${expandedId === ticket.ticket_id ? 'bg-slate-50' : ''}`}
                    onClick={() => handleExpand(ticket.ticket_id)}
                  >
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700">{ticket.firm_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-800">{ticket.subject}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold uppercase text-slate-500">{CATEGORY_LABELS[ticket.category] || ticket.category}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${STATUS_STYLES[ticket.status] || 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_LABELS[ticket.status] || ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <span className="text-xs font-medium text-slate-700">{ticket.submitted_by_name || '—'}</span>
                        <p className="text-[10px] text-slate-400">{ticket.submitted_by_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-500">{formatDate(ticket.updated_at)}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-xs font-bold text-slate-600 flex items-center justify-center gap-1">
                        <MessageCircle size={12} /> {ticket.message_count}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {expandedId === ticket.ticket_id
                        ? <ChevronUp size={14} className="text-slate-400" />
                        : <ChevronDown size={14} className="text-slate-400" />
                      }
                    </td>
                  </tr>

                  {/* Expanded Detail Panel */}
                  {expandedId === ticket.ticket_id && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 border-b border-slate-200">
                        <div className="px-6 py-4">
                          {/* Status Controls */}
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status:</span>
                            <div className="flex gap-1.5">
                              {STATUSES.map(s => (
                                <button
                                  key={s}
                                  onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.ticket_id, s); }}
                                  disabled={updatingStatus || ticket.status === s}
                                  className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                                    ticket.status === s
                                      ? STATUS_STYLES[s] + ' ring-1 ring-current'
                                      : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300'
                                  }`}
                                >
                                  {STATUS_LABELS[s]}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Conversation */}
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="max-h-80 overflow-y-auto p-4 space-y-3">
                              {messagesLoading ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                                </div>
                              ) : (
                                messages.map(msg => {
                                  const isAdmin = msg.sender_type === 'admin';
                                  return (
                                    <div key={msg.message_id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`max-w-[75%] rounded-xl px-3 py-2 ${isAdmin ? 'bg-violet-50 border border-violet-100' : 'bg-slate-50 border border-slate-100'}`}>
                                        <p className={`text-[10px] font-medium mb-0.5 ${isAdmin ? 'text-violet-600' : 'text-slate-500'}`}>
                                          {msg.sender_name}
                                          {msg.sender_email && msg.sender_type === 'firm' && (
                                            <span className="text-slate-300 ml-1">({msg.sender_email})</span>
                                          )}
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

                            {/* Reply */}
                            {['resolved', 'closed'].includes(ticket.status) ? (
                              <div className="border-t border-slate-100 px-4 py-3 text-center">
                                <p className="text-xs text-slate-400">This ticket has been {ticket.status}. No further replies can be added.</p>
                              </div>
                            ) : (
                              <div className="border-t border-slate-100 p-3">
                                <div className="flex gap-2">
                                  <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type your reply as FilersHub Support..."
                                    rows={2}
                                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 transition-colors resize-none"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleReply();
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleReply(); }}
                                    disabled={sending || !replyText.trim()}
                                    className="self-end p-2 rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
                                  >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {loading ? 'Loading...' : `${filteredTickets.length} ticket${filteredTickets.length !== 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  );
};

export default SuperAdminTickets;
