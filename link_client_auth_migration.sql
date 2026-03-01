-- =====================================================
-- RPC: link_client_auth
-- Links a Supabase auth user to their existing client record(s)
-- by matching email. Called after login/signup to populate auth_user_id.
-- =====================================================

DROP FUNCTION IF EXISTS public.link_client_auth(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.link_client_auth(
  p_email TEXT,
  p_firm_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Update client records matching this email where auth_user_id is not yet set.
  -- If p_firm_id is provided, scope to that firm only (portal login).
  -- If p_firm_id is NULL, link ALL matching client records (general login).
  UPDATE clients
  SET auth_user_id = auth.uid(),
      updated_at = NOW()
  WHERE LOWER(email) = LOWER(p_email)
    AND auth_user_id IS NULL
    AND is_active = TRUE
    AND (p_firm_id IS NULL OR firm_id = p_firm_id);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RETURN jsonb_build_object('success', true, 'linked', v_updated_count);
  ELSE
    -- Could be already linked or no matching record
    RETURN jsonb_build_object('success', false, 'error', 'no_matching_client');
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.link_client_auth(TEXT, UUID) TO authenticated;
