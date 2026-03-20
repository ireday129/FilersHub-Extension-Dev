-- Vault RPC Functions for IRS Token Storage
-- Run this in the Supabase SQL Editor

-- Store a secret in Vault and return its ID
-- Deletes any existing secret with the same name first (for token rotation)
CREATE OR REPLACE FUNCTION public.vault_store_secret(new_secret TEXT, new_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_id UUID;
BEGIN
  -- Delete existing secret with same name (supports token rotation)
  DELETE FROM vault.secrets WHERE name = new_name;

  -- Insert new secret and return its ID
  INSERT INTO vault.secrets (secret, name)
  VALUES (new_secret, new_name)
  RETURNING id INTO secret_id;

  RETURN secret_id;
END;
$$;

-- Retrieve a decrypted secret from Vault by its ID
CREATE OR REPLACE FUNCTION public.vault_get_secret(secret_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result TEXT;
BEGIN
  SELECT decrypted_secret INTO result
  FROM vault.decrypted_secrets
  WHERE id = secret_id;

  RETURN result;
END;
$$;

-- Grant execute permissions to the service role (used by Vercel functions)
GRANT EXECUTE ON FUNCTION public.vault_store_secret(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_get_secret(UUID) TO service_role;
