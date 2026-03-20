-- Add queue_counter_enabled to firms table
ALTER TABLE firms
ADD COLUMN IF NOT EXISTS queue_counter_enabled BOOLEAN DEFAULT FALSE;

-- Create RPC to calculate queue position
CREATE OR REPLACE FUNCTION get_client_queue_position(p_tax_return_id UUID, p_firm_id UUID, p_status TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_position INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM tax_returns
    WHERE firm_id = p_firm_id
      AND tax_return_status = p_status
      AND created_at < (SELECT created_at FROM tax_returns WHERE return_id = p_tax_return_id);

    RETURN v_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
