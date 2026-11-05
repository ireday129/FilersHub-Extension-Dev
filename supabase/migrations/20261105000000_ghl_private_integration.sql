-- GHL Private Integration: per-firm GoHighLevel connection + Vault helpers.
-- Adds public.ghl_connections (RLS, read-only policies) and three service_role-only
-- Vault helper functions. Purely additive: no existing objects are altered or dropped.

CREATE TABLE IF NOT EXISTS public.ghl_connections (
  firm_id           uuid PRIMARY KEY REFERENCES public.firms(firm_id) ON DELETE CASCADE,
  "locationId"      text NOT NULL UNIQUE,
  "companyId"       text,
  location_name     text,
  token_secret_id   uuid,
  actions_secret_id uuid,
  status            text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'broken')),
  last_error        text,
  last_checked_at   timestamptz,
  token_added_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ghl_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Firm owners read own GHL connection" ON public.ghl_connections;
CREATE POLICY "Firm owners read own GHL connection"
  ON public.ghl_connections
  FOR SELECT
  USING (
    firm_id IN (
      SELECT s.firm_id
      FROM public.staff s
      WHERE s.auth_user_id = auth.uid()
        AND s.role = 'Firm Owner'
        AND s.is_active
    )
  );

DROP POLICY IF EXISTS "Super admins read GHL connections" ON public.ghl_connections;
CREATE POLICY "Super admins read GHL connections"
  ON public.ghl_connections
  FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean IS TRUE
  );

-- Vault helpers (callable only by service_role, e.g. from edge functions via admin.rpc)

CREATE OR REPLACE FUNCTION public.ghl_vault_store(p_name text, p_secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  DELETE FROM vault.secrets WHERE name = p_name;
  v_id := vault.create_secret(p_secret, p_name);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghl_vault_read(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = p_id;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghl_vault_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ghl_vault_store(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghl_vault_store(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.ghl_vault_read(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghl_vault_read(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ghl_vault_delete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghl_vault_delete(uuid) TO service_role;
