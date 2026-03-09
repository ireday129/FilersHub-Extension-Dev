import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { locationId, email, action, subject, category, ticketId, body } = req.body;

    if (!locationId || !email || !action) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Layer 1: Resolve firm by locationId
        const { data: firm, error: firmError } = await supabaseAdmin
            .from('firms')
            .select('firm_id, firm_name')
            .eq('ghl_location_id', locationId)
            .maybeSingle();

        if (firmError) throw new Error(`Firm lookup failed: ${firmError.message}`);
        if (!firm) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const firmId = firm.firm_id;

        // Layer 2: Verify email is an active staff member for this firm
        const { data: staffMember, error: staffError } = await supabaseAdmin
            .from('staff')
            .select('staff_id, full_name, email')
            .eq('firm_id', firmId)
            .ilike('email', email.toLowerCase())
            .eq('is_active', true)
            .maybeSingle();

        if (staffError) throw new Error(`Staff lookup failed: ${staffError.message}`);
        if (!staffMember) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Handle actions
        if (action === 'list') {
            const { data: tickets, error: ticketsError } = await supabaseAdmin
                .from('support_tickets')
                .select('*')
                .eq('firm_id', firmId)
                .order('updated_at', { ascending: false })
                .limit(50);

            if (ticketsError) throw new Error(`Failed to fetch tickets: ${ticketsError.message}`);

            // Get message counts for each ticket
            const ticketIds = (tickets || []).map((t: any) => t.ticket_id);
            let messageCounts: Record<string, { count: number; last_at: string | null }> = {};

            if (ticketIds.length > 0) {
                const { data: messages } = await supabaseAdmin
                    .from('ticket_messages')
                    .select('ticket_id, created_at')
                    .in('ticket_id', ticketIds);

                for (const msg of (messages || [])) {
                    if (!messageCounts[msg.ticket_id]) {
                        messageCounts[msg.ticket_id] = { count: 0, last_at: null };
                    }
                    messageCounts[msg.ticket_id].count++;
                    if (!messageCounts[msg.ticket_id].last_at || msg.created_at > messageCounts[msg.ticket_id].last_at!) {
                        messageCounts[msg.ticket_id].last_at = msg.created_at;
                    }
                }
            }

            const enrichedTickets = (tickets || []).map((t: any) => ({
                ...t,
                message_count: messageCounts[t.ticket_id]?.count || 0,
                last_message_at: messageCounts[t.ticket_id]?.last_at || null,
            }));

            return res.status(200).json({ tickets: enrichedTickets });
        }

        if (action === 'create') {
            if (!subject || !body) {
                return res.status(400).json({ error: 'Missing subject or body' });
            }

            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('support_tickets')
                .insert({
                    firm_id: firmId,
                    subject,
                    category: category || 'general',
                    submitted_by_email: staffMember.email,
                    submitted_by_name: staffMember.full_name,
                })
                .select()
                .single();

            if (ticketError) throw new Error(`Failed to create ticket: ${ticketError.message}`);

            const { data: message, error: msgError } = await supabaseAdmin
                .from('ticket_messages')
                .insert({
                    ticket_id: ticket.ticket_id,
                    sender_type: 'firm',
                    sender_name: staffMember.full_name || staffMember.email,
                    sender_email: staffMember.email,
                    body,
                })
                .select()
                .single();

            if (msgError) throw new Error(`Failed to create message: ${msgError.message}`);

            return res.status(200).json({ ticket, message });
        }

        if (action === 'get') {
            if (!ticketId) {
                return res.status(400).json({ error: 'Missing ticketId' });
            }

            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('support_tickets')
                .select('*')
                .eq('ticket_id', ticketId)
                .eq('firm_id', firmId)
                .maybeSingle();

            if (ticketError) throw new Error(`Failed to fetch ticket: ${ticketError.message}`);
            if (!ticket) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            const { data: messages, error: msgsError } = await supabaseAdmin
                .from('ticket_messages')
                .select('*')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });

            if (msgsError) throw new Error(`Failed to fetch messages: ${msgsError.message}`);

            return res.status(200).json({ ticket, messages: messages || [] });
        }

        if (action === 'reply') {
            if (!ticketId || !body) {
                return res.status(400).json({ error: 'Missing ticketId or body' });
            }

            // Verify ticket belongs to this firm
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('support_tickets')
                .select('ticket_id')
                .eq('ticket_id', ticketId)
                .eq('firm_id', firmId)
                .maybeSingle();

            if (ticketError) throw new Error(`Ticket lookup failed: ${ticketError.message}`);
            if (!ticket) {
                return res.status(404).json({ error: 'Ticket not found' });
            }

            const { data: message, error: msgError } = await supabaseAdmin
                .from('ticket_messages')
                .insert({
                    ticket_id: ticketId,
                    sender_type: 'firm',
                    sender_name: staffMember.full_name || staffMember.email,
                    sender_email: staffMember.email,
                    body,
                })
                .select()
                .single();

            if (msgError) throw new Error(`Failed to send reply: ${msgError.message}`);

            // Update ticket timestamp
            await supabaseAdmin
                .from('support_tickets')
                .update({ updated_at: new Date().toISOString() })
                .eq('ticket_id', ticketId);

            return res.status(200).json({ message });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (err: any) {
        console.error('Support tickets error:', err);
        return res.status(500).json({ error: err.message || 'Failed to process request' });
    }
}
