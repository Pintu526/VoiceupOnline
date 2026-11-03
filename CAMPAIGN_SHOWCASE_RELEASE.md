# GSAA Campaign Showcase Release

## Release identity

- Candidate: **Voiceup-Campaign-Showcase-20261103-RC**
- Source: sealed **GSAA-MVRC-20261102-3eb4363f6a4d** Stage 1 extraction
- Source archive SHA-256: **9ebeeb7fca029aef59534a9d74f45b6581b5307a3f6b20e8e54e63208642149e**
- Sealed manifest verification: **637/637** file hashes passed before creating this candidate
- Vercel target: project **voiceup-development** (**prj_1b8PL4aXQw3ArAYsLAJaBcb1RDHp**), Preview only
- Preview URL: https://voiceup-development-qnm5nu5wv-debasish1.vercel.app
- Deployment ID: **dpl_82ssJe6Kwgg95CajonHyjX7CSfWk**
- Deployment status: **Ready**, target **Preview**, no aliases

## Scope

Retains the role- and entitlement-aware Campaign Command Center over existing application navigation and adds the candidate's supporter registration/login, email confirmation and recovery, account claiming, and owner-scoped dashboard. The two SQL migrations are versioned source only; neither was applied. No Supabase settings, database data, Production configuration, aliases, DNS, or deployment were changed.

## Changed application and test files

- **src/campaignShowcaseCatalog.ts**: 47 capabilities, seven tracks, localized English/Hindi/Odia content and readiness metadata.
- **src/campaignCompletion.ts**: weighted capability acceptance criteria, evidence states, status history, track/status aggregates, and Production readiness accounting.
- **src/pages/app/CommandCenterTab.tsx**: responsive accessible module cards, evidence-based completion, status history, and gated actions.
- **src/layouts/AppShell.tsx**: reuse existing workspace-tab and AI Copilot guards for navigation.
- **src/styles.css**: responsive cards, assessment details, badges, and visible keyboard focus.
- **src/i18n/locales/hi.json**: Hindi framework strings.
- **src/i18n/locales/or.json**: Odia framework strings.
- **tests/campaignShowcaseCatalog.test.mjs**: inventory, translations, access, blockers, and non-simulated workflow regression checks.
- **tests/campaignCompletion.test.mjs**: exact 47-capability preservation, status history, weighted calculations, and explicit assessed/unassessed evidence coverage.
- Supporter account runtime: **src/accountAccess.ts**, **src/authSession.ts**, **src/campaignAuthContext.ts**, **src/supporterAuth.ts**, **src/supporterAccountClaim.ts**, **src/supporterEmailConfirmation.ts**, and **src/supporterPasswordResetPage.ts**, with login/account pages and claim/auth panels.
- **src/backend.ts**, **src/App.tsx**, **src/pages/PublicCampaignPage.tsx**, and **supabase/functions/voiceup-public-signing/index.ts**: integrate the existing account flows and grant issuance while retaining signing behavior and permission checks.
- **supabase/migrations/20261025010000_supporter_account_claim_grants.sql** and **supabase/migrations/20261029010000_account_access_manifest_and_supporter_dashboard.sql**: migration sources only; not executed.
- **supporter-email-confirmed.html**, **supporter-reset-password.html**, their public bootstrap scripts, **vite.config.ts**, and the relevant account/auth tests: confirmation and recovery build entries and regression coverage.

## Explicit exclusions

- TopicWise and all **sites/** content.
- Participation email receipts, receipt-worker/activation experiments, and their migrations.
- Coordinator-binding and location-scope experiments and their migrations.
- **supporter-auth-test.html**.
- Local environment files, **node_modules**, **dist**, **.vercel** project metadata, **.git** metadata, and **supabase/.temp**.
- No production configuration, data, DNS, alias, or credentials are included.

## Validation

- Supporter-account, catalogue, evidence, and CampaignOS tests: **PASS**, 68/68.
- GSAA signing, OTP/idempotency, and campaign-admin authorization regressions: **PASS**, 192/192.
- TypeScript typecheck: **PASS**.
- Production build: **PASS**; both confirmation and password-recovery HTML entries emitted. The existing large-chunk warning remains.
- Development Supabase project **ravweavcfrpiykfgtmbf** was inspected read-only. Claim/dashboard tables, RLS, required base columns, RPCs, and privileges exist; the four live RPC bodies match the source migration function bodies. The migration history relation is unavailable, so migration lineage cannot be asserted and no migration was applied.
- Active Development signing Edge Function version 29 source matches the candidate. It issues the supporter claim grant after a successful support submission; grant errors do not roll back signing.
- The administrator confirmed the existing Auth redirect wildcard covers the Preview origin and callback paths. No Auth configuration was changed.
- Prior candidate Preview deployment evidence above is historical; **this release branch has not been deployed**. No interactive signed-in acceptance was performed.

## Baseline readiness totals (before final acceptance verification)

| Status | Count |
|---|---:|
| Completed | 0 |
| Pending Final Review | 30 |
| In Progress | 8 |
| Not Started | 8 |
| Blocked | 1 |

## Baseline capability status (before final acceptance verification)

| Track | Capability | Status |
|---|---|---|
| ORGANIZE | Organizations & workspaces | In Progress |
| ORGANIZE | Volunteers & coordinators | In Progress |
| ORGANIZE | Roles & permissions | Pending Final Review |
| ORGANIZE | Resources & locations | Pending Final Review |
| PLAN | Campaign creation & lifecycle | Pending Final Review |
| PLAN | Campaign settings & branding | Pending Final Review |
| PLAN | Objectives, activities & milestones | In Progress |
| PLAN | Task & resource allocation | In Progress |
| ACT | GSAA public campaign | Pending Final Review |
| ACT | Six-step digital signing | Pending Final Review |
| ACT | OTP verification | Pending Final Review |
| ACT | Signing idempotency & duplicate prevention | Pending Final Review |
| ACT | Field Collection | Pending Final Review |
| ACT | Field evidence collection | Pending Final Review |
| ACT | Offline & paper signatures | In Progress |
| ACT | Supporter registration & account claiming | Blocked |
| ACT | Owner-scoped supporter dashboard | Pending Final Review |
| ACT | Participation receipts | Not Started |
| FUND | Crowdfunding & budgets | Not Started |
| FUND | Donation management | Not Started |
| FUND | Financial reporting | Not Started |
| FUND | Expenses & reconciliation | Not Started |
| FUND | Fundraising transparency | Not Started |
| PROVE | Paper-signature scanning | Pending Final Review |
| PROVE | OCR processing | Pending Final Review |
| PROVE | Manual transcription | In Progress |
| PROVE | Review & approval | Pending Final Review |
| PROVE | Evidence management | Pending Final Review |
| PROVE | Progress reports & analytics | Pending Final Review |
| PROVE | Audit trails | Pending Final Review |
| GROW | Referrals & attribution | Pending Final Review |
| GROW | QR, WhatsApp & social sharing | Pending Final Review |
| GROW | Growth Dashboard | Pending Final Review |
| GROW | Rewards & recognition | Not Started |
| GROW | Movement CRM | Pending Final Review |
| GROW | Volunteer mobilization | In Progress |
| GROW | Engagement Hub | Pending Final Review |
| GROW | Action Center | Pending Final Review |
| BUSINESS OS | SaaS administration | Pending Final Review |
| BUSINESS OS | Subscriptions & trials | Pending Final Review |
| BUSINESS OS | Authentication & account access | Pending Final Review |
| BUSINESS OS | English, Hindi & Odia | Pending Final Review |
| BUSINESS OS | AI Campaign Copilot | Pending Final Review |
| BUSINESS OS | Content Studio | Not Started |
| BUSINESS OS | Reporting & dashboards | Pending Final Review |
| BUSINESS OS | Shared communication services | In Progress |
| BUSINESS OS | Document intelligence | Pending Final Review |

## Final acceptance evidence (updated 2026-11-04)

- All **47 existing capabilities** and all **seven existing tracks** remain in the catalogue. Existing names, descriptions, module destinations, and original statuses are protected by a catalogue SHA-256 regression assertion.
- Development completion: **69%**, calculated from five weighted acceptance criteria per capability: implemented slice (25), full described scope (20), capability-specific regression evidence (25), existing route/permission integration (15), and signed-in Preview acceptance (15). Only verified criteria receive credit; signed-in Preview acceptance remains pending. A capability reaches 100% only when every defined criterion passes.
- Overall aggregation uses capability weights: **3** for release-priority areas (Campaign Management, signing, Field Collection/Scans/OCR, CRM, reporting, referrals, and SaaS administration), **2** for standard capabilities, and **1** for preview-only/unimplemented items. Track percentages use those same weights.
- Verified Production readiness: **Not assessed**. Production was not accessed or changed; the release evidence covers Preview only. All 47 Production readiness checks remain unassessed.
- Capabilities with no Development completion assessment: **0**. **62** acceptance criteria remain unassessed, including authenticated Preview acceptance; the account/auth unit and regression evidence is now available and passing. All 47 Production readiness checks remain unassessed.
- Current branch validation: **260 focused tests passed, 0 failed** across the two focused runs; TypeScript **PASS**; Vite build **PASS**. The full suite was not rerun. Vite still reports the existing large-chunk warning.

| Track | Weighted development completion |
|---|---:|
| ORGANIZE | 75% |
| PLAN | 69% |
| ACT | 78% |
| FUND | 15% |
| PROVE | 72% |
| GROW | 60% |
| BUSINESS OS | 74% |

| Status | Before verification | Actual verified |
|---|---:|---:|
| Completed | 0 | 0 |
| Pending Final Review | 30 | 29 |
| In Progress | 8 | 10 |
| Not Started | 8 | 7 |
| Blocked | 1 | 1 |

Two evidence-supported status corrections retain their original status in history: **Rewards & recognition** changed from `Not Started` to **In Progress** because Growth Dashboard and merchant runtime code demonstrate an implemented slice; **Evidence management** changed from `Pending Final Review` to **In Progress** because the dedicated Prove route is still a placeholder, while evidence capture exists in Field Collection. Direct reward workflow regression, a dedicated evidence library and its regression coverage, and signed-in Preview acceptance remain outstanding.

The existing Command Center now displays original and verified status, per-capability completion, weighted criteria and evidence, working functionality, remaining acceptance, blockers, status history, and last verification date. All seven track totals and all five status counts are computed from the existing capability catalogue.

Authenticated Preview browser acceptance and live Development-backend acceptance remain unverified. No interactive authenticated browser session was available, and no integration credentials or endpoint deployment were used for this task.

The release candidate contains no verified `voiceup.live/CampaignOS` product route or `gaumata.claud` domain mapping evidence. No route, DNS, authentication redirect, deployment, or Production configuration was changed. Do not treat the existing `/app` or `/admin` workspaces as the intended CampaignOS product route.

## Known blocker

The existing Development Supabase Auth redirect wildcard is administrator-confirmed sufficient. Supporter registration/account claiming remains **Blocked** pending authenticated Development Preview acceptance; the implementation and required database objects are present, but no signed-in walkthrough was performed against this branch. The migration files remain source only, and the database was not changed.

## Integrity inventory

**CAMPAIGN_SHOWCASE_SHA256SUMS.txt** lists SHA-256 values for the candidate's regular source/release files. The original sealed **SHA256SUMS.txt** remains unchanged. The new inventory excludes itself, generated build output, dependencies, local environment files, and Vercel project metadata. It was refreshed after the final release-manifest edit; all listed hashes must verify before release.

## Promotion and rollback notes

- Production promotion is not authorized. Complete authenticated Development Preview acceptance before considering promotion; any Production work still requires explicit approval and Production-specific review.
- The prior Ready Preview remains available as a comparison/rollback reference: https://voiceup-development-i56lt1d9p-debasish1.vercel.app (**dpl_HMikwCwFok8RF4umGZrXp99hrZJb**). No aliases were changed.
