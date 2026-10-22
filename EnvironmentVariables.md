# Environment Variables

## Required for Shared Backend

`VITE_SUPABASE_URL`

Supabase project URL used by `src/backend.ts`.

`VITE_SUPABASE_ANON_KEY`

Supabase anon key used by `src/backend.ts`.

`VITE_VOICEUP_WORKSPACE_ID`

Workspace row ID in the `voiceup_workspaces` table. Defaults to `default` when unset.

## GSAA Public Signing Screen Verification

`VITE_VOICEUP_SHOW_OTP`

Set to `true` in the Vercel scope serving GSAA so the six-digit server-generated
verification code is shown on the existing Verify step. This is a public browser
flag and is not a credential.

`VOICEUP_SHOW_OTP`

Set to `true` for the `voiceup-otp` Edge Function so GSAA public-signing requests
use `screen_otp` and return the code. This does not require `DEV_MODE` or an OTP
provider. It does not affect onboarding or coordinator-mobile OTP purposes.

The screen verification proves completion of the active signing challenge only.
It does not prove ownership of the supplied mobile number.

## Required for MVP Platform Admin Login

`VITE_VOICEUP_APP_ADMIN_EMAIL`

Platform admin email for the MVP passcode login fallback.

`VITE_VOICEUP_APP_ADMIN_PASSCODE`

Platform admin passcode for the MVP passcode login fallback.

## Documented but Not Currently Used in Runtime

`VITE_RAZORPAY_KEY_ID`

Listed in `.env.example` and README for future provider-ready payment setup. Current payment UI does not process real payments.

`VITE_PUBLIC_ANALYTICS_KEY`

Listed in `.env.example` and README for future analytics provider setup. Current onboarding analytics are stored locally/audited in-app.

## Security Notes

- Never commit `.env`.
- Vite exposes `VITE_*` variables to the browser bundle.
- Do not store private service-role keys in Vite variables.
- Replace MVP passcode login with Supabase Auth and row-level security before broad public production use.

