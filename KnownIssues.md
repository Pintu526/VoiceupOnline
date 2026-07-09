# Known Issues

## Bundle Size

`npm run build` succeeds. The largest bundles are still produced by PDF/export, OCR, and main application code. Further code splitting can reduce this after first deployment.

## ESLint

The project does not currently include an ESLint configuration or lint script. TypeScript strict build is the current code-quality gate.

## Authentication

Authentication is MVP-level. Platform admin can use Supabase Auth when configured, otherwise an environment-variable passcode fallback is used. Customer workspace auth is session-based after OTP onboarding. Production should move customer and platform auth fully into Supabase Auth with proper authorization policies.

## OTP

The onboarding OTP is provider-ready and simulated in the browser. It includes resend timing and local rate limiting, but it does not send a real SMS until a provider integration is added.

## Backend Shape

Supabase persistence stores the workspace as a JSON blob in `voiceup_workspaces`. This is acceptable for the current MVP but should be normalized when multi-tenant scale, auditing, and reporting requirements grow.

## Browser QA

The local server was verified by HTTP and served-module checks. In this Codex session, the browser connector reported no available browser sessions, so visual click-through screenshots were not available from the tool.
