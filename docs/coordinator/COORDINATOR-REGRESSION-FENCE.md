# Coordinator Management Regression Fence

## Authority and scope

Coordinator Network is the authoritative coordinator engine. Extend it sequentially; never create a parallel coordinator store, hierarchy, permission model, or CRUD flow. Movement CRM must consume authoritative Coordinator Network data when integration is implemented.

## Protected files and areas

Stop and report before changing any of the following:

- `src/App.tsx`
- `src/layouts/AppShell.tsx`
- `src/backend.ts` (existing coordinator contracts and authentication/session sections)
- `src/utils/auth.ts`
- `src/pages/CampaignAdminLoginPage.tsx`
- `src/pages/OnboardingWizard.tsx`
- `src/authorization/**`
- `src/secureFieldUploadAuth.ts`
- `src/scanApproval.ts`
- `src/documentIntelligence/**`
- `src/documentCamera/**`
- `src/pages/app/ScansTab.tsx`
- `src/mobileScanCapture.ts`
- `src/confirmationQueue.ts`
- `src/pages/PublicCampaignPage.tsx`
- `src/pages/app/CampaignsTab.tsx`
- `src/utils/campaign.ts`
- `src/utils/campaignAdminProvisioning.ts`
- `src/entitlements/**`
- `src/utils/subscription.ts`
- `src/pages/app/SubscriptionEntitlementsPanel.tsx`
- `supabase/functions/voiceup-trial-onboarding/**`
- `supabase/functions/voiceup-auth-context/**`
- `supabase/functions/_shared/voiceup.ts`
- `supabase/functions/voiceup-public-campaign/**`
- `supabase/functions/voiceup-otp/**` except an explicitly approved, coordinator-scoped additive change
- `supabase/migrations/20260720010000_field_collection_atomic_approval.sql`
- `supabase/migrations/20260720020000_coordinator_network_v1.sql`

Protected behavior includes authentication/session ownership, campaign creation and persistence, public signing, Field Collection approval, OCR, Document Camera, secure uploads, pricing, payments, trials, and unrelated OTP purposes.

## Locked rules

1. Never edit an existing coordinator migration in place; use a new forward migration.
2. Preserve current RPC names and data contracts unless adding a versioned replacement.
3. Preserve existing CRUD, OTP, hierarchy, campaign-linking, RLS, audit, and Field Collection behavior.
4. Do not modify unrelated modules or broaden a phase to include opportunistic refactoring.
5. Stop and report the file, reason, intended change, alternatives, and regression validation before changing a protected file.
6. Do not introduce a second coordinator engine or duplicate persisted coordinator state.
7. New writes must remain workspace-scoped, authorized server-side, audited, and covered by RLS/RPC tests.
8. Production changes require completed Preview validation and an explicit target; never use Production as a fallback.

## Required gate per phase

1. Start from `feature/coordinator-world-class-v1` with an understood working tree.
2. Limit the diff to the active phase.
3. Run `powershell -ExecutionPolicy Bypass -File .\scripts\coordinator-check.ps1`.
4. Complete applicable items in `COORDINATOR-BROWSER-ACCEPTANCE.md`.
5. Review forward migration safety, permission matrix, and rollback/forward remediation when database work exists.
6. Commit and tag using `COORDINATOR-PRODUCTION-PLAN.md` only after every gate passes.
