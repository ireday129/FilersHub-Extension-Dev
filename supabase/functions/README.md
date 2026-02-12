# Deploying GHL Webhook Helper

To deploy this Edge Function, you need the Supabase CLI installed.

## Prerequisites
1.  **Supabase CLI**: [Installation Guide](https://supabase.com/docs/guides/cli)
2.  **Login**: Run `supabase login`
3.  **Link Project**: Run `supabase link --project-ref your-project-ref`

## Deploy

Run the following command in the root set of the project:

```bash
supabase functions deploy ghl-webhook --no-verify-jwt
```

**Note**: `--no-verify-jwt` is used because GHL webhooks do not send a Supabase Auth JWT. Only the Location ID signature (or just strict usage) validates it.

## Configuration in GoHighLevel

1.  Go to your GHL Account -> Automation -> Workflows.
2.  Create a Trigger: "Contact Created".
3.  Action: "Webhook".
4.  URL: `https://<project-ref>.supabase.co/functions/v1/ghl-webhook`
5.  Method: POST.
