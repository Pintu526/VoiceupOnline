# VOICEUP GSAA — Final Missing Audit Addendum

**Scope:** read-only DEV investigation of the six incomplete GSAA signing requirements. This addendum does not repeat the completed role-approval or Command Center audit. No application source, database, or deployment was changed.

**Evidence boundary:** repository HEAD/worktree and focused contract tests only; no live Development database row, Edge log, or browser network trace was inspected. Therefore the deterministic defect in the code path is confirmed, but the particular data event that triggered any reported occurrence is not.

> **Approved requirement update — 2026-11-18:** The product owner has superseded this addendum's proposed mandatory campaign-signing Email OTP and any new signing-OTP infrastructure. Google OAuth, email/password, and optional Supabase Auth Email OTP remain account-authentication paths. Public signing remains available to guests and requires neither Email OTP nor account activation. Google authentication may occur before or after signing and requires no additional Email OTP. The duplicate/idempotency, privacy, account-claim, role-display, and regression findings below remain historical evidence, but remediation must reuse the existing canonical signing, authentication, supporter-identity, routing, and account-claim services. SMS OTP remains disabled by default. The authoritative execution checklist is Section 21 of `ROLE_APPLICATION_APPROVAL_COMMAND_CENTER_READ_ONLY_AUDIT.md`.

## Executive conclusion

**Implementation readiness: BLOCKED.** The current GSAA path deliberately uses on-screen OTP, does not verify email ownership for signing, uses campaign+phone as its participation identity, asks for GSAA location fields, always creates a post-sign account-claim opportunity, and labels any confirmed Supabase user as a public-page “Supporter” even when the access manifest says Platform/Campaign Admin only. These are direct conflicts with the requested end state.

The stage-5 duplicate is not a database duplicate insert. It is a deterministic contract mismatch: the privacy-safe anonymous precheck intentionally omits the internal route, the UI nevertheless expects that route to divert an existing participant, and the screen-OTP database wrapper then rejects the already-present campaign+phone only at submit time. The incident-specific reason the phone was already present—earlier successful-but-unacknowledged submission, previous visit, imported/paper signer, or another prior record—cannot be selected without live evidence.

## 1. Stage-5 duplicate failure

### End-to-end trace

| Layer | Confirmed behavior and evidence | Finding |
|---|---|---|
| Stage definition | GSAA has Phone, Verify, Profile, Details, Review, Done; Details is required because GSAA currently requires state/district/block. Review is therefore stage 5 (`src/pages/PublicCampaignPage.tsx:282-290`, `1208-1229`, `3118-3203`). | The reported stage matches the final `submit_support` boundary. |
| Frontend precheck | The debounced phone precheck opens Sign In only if `supporterRoute` is returned (`PublicCampaignPage.tsx:1273-1283`). The request button is disabled while checking/failing, but not for an existing route (`2791-2809`). | The UI expects an anonymous classification that the server contract intentionally withholds. |
| Anonymous routing backend | The Edge function forwards `data.supporterRoute` (`supabase/functions/voiceup-supporter-routing/index.ts:77-100`), but the latest RPC deliberately returns only an opaque token and expiry (`supabase/migrations/20261110010000_supporter_precheck_route_dev.sql:67-103`). | `supporterRoute` is always absent under the current SQL contract; the diversion branch is unreachable without weakening privacy. |
| Submission idempotency | The browser keeps a payload fingerprint, idempotency key, and consent time only in a React ref (`src/App.tsx:602`, `2197-2226`; `src/publicSigningJourney.ts:188-200`). Same-payload retries in the same mounted page reuse the key. | Same-page transport retries are idempotent; reload/recreated journeys do not retain the signing attempt. |
| Signing Edge | The Edge passes campaign, phone, verification token, idempotency key, and profile to `mutate_voiceup_public_participation_screen_safe` and maps `screen_verification_existing_supporter` to HTTP 409 (`supabase/functions/voiceup-public-signing/index.ts:230-317`, `46-53`). | The backend is faithfully exposing the database decision. |
| Participation uniqueness | The screen-safe wrapper finds a signer by exact campaign and canonical phone. An unbound screen challenge plus any existing match raises `screen_verification_existing_supporter`; a bound challenge accepts only its original submit key (`supabase/migrations/20261019010000_screen_otp_public_signing.sql:221-248`). | **Confirmed immediate cause of the stage-5 error:** an existing signer row for that campaign+phone reaches the late screen-OTP gate. |
| Base atomic RPC | The underlying RPC locks the workspace row (`20260824080000_preserve_signer_owner_referral_code.sql:253-262`), replays a matching key (`338-353`), resolves one canonical campaign+phone signer (`320-393`), and preserves already-completed support rather than inserting a second signer (`564-625`). | The base mutation is already idempotent/upsert-like; the screen wrapper prevents that permanent behavior from handling a new post-refresh attempt. |
| Draft restoration | Session storage deliberately strips OTP/challenge/token and restores at Phone (`src/publicSigningJourney.ts:136-174`; `PublicCampaignPage.tsx:1633-1661`). Server draft saving is disabled for an unbound screen OTP (`src/App.tsx:2608-2611`). The submission idempotency key is not part of the stored draft. | A refresh cannot resume the verified attempt. If the first commit succeeded but its response was lost, the new screen challenge sees the committed signer and produces the stage-5 duplicate. This replay path is confirmed by code; whether it caused the reported occurrence is unconfirmed without logs. |
| Account claim | Claim grant issuance occurs only after a successful signing result and failures are explicitly fail-open (`voiceup-public-signing/index.ts:319-345`). The grant is bound to authoritative signing idempotency evidence (`20261025010000_supporter_account_claim_grants.sql:118-176`). | Account claim is **not** the cause of the signing failure. |
| Workspace saves | Admin workspace saves preserve server `publicParticipationIdempotency` and merge server-owned participation fields (`supabase/functions/_shared/workspaceStateMerge.ts:240-331`, `383-418`). | Current merge logic protects a committed signer; stale admin state is not a confirmed cause. |

### Confirmed versus unconfirmed

- **Confirmed defect:** route-neutral precheck + UI route expectation + late screen-wrapper uniqueness rejection.
- **Confirmed replay weakness:** signing attempt identity is memory-only; refresh clears verification and the key.
- **Not confirmed for the reported incident:** whether the existing record came from a prior successful request with a lost response, a previous completed signature, paper/import approval, or deployment/data drift.
- **Not supported by evidence:** account-claim failure, workspace merge overwrite, or the base atomic RPC inserting two online signers.

### Permanent idempotent resolution

Do not bypass the duplicate check. Replace the late error with a durable server operation:

1. Add a normalized `voiceup_public_participation_operations` ledger keyed uniquely by `(workspace_id, campaign_id, idempotency_key)`, with payload hash, status, supporter ID, and replayable response. Do not rely on the bounded 100-item JSON history as the permanent replay ledger.
2. Add/backfill a normalized participation identity registry with a unique `(workspace_id, campaign_id, canonical_phone_hash)` (and supporter ID) so uniqueness is database-enforced outside JSONB.
3. Create the signing-attempt ID before OTP issuance, persist only the opaque ID in session storage, and bind Email OTP, optional SMS OTP, consent, and submit to that attempt.
4. In one transaction: lock the attempt/identity, replay completed attempts, verify fresh campaign-bound email proof, verify SMS only when configured, create or return the canonical participation, write consent/audit, and mark the attempt completed.
5. For an already-recorded participation with matching verified email, return `already_recorded` plus the safe canonical result and route to Done—never create a second signer and never report a failure. For mismatched identity, return a privacy-safe conflict requiring authenticated recovery.

## 2. Mandatory fresh campaign-specific Email OTP

**Current status: NOT IMPLEMENTED for signing.** The only signing challenge is phone/screen based. `voiceup_otp_challenges` is phone-hash keyed and permits only public-signing/onboarding/coordinator-mobile purposes (`supabase/migrations/20260720015000_voiceup_otp_challenges_prerequisite.sql:174-191`). The signing RPC validates only phone hash, campaign slug/ID, and the phone verification token (`20260824080000_preserve_signer_owner_referral_code.sql:299-318`). Screen proof explicitly records `emailOwnershipVerified: false` (`20261019010000_screen_otp_public_signing.sql:251-301`).

Reusable pieces exist but are not sufficient:

- Supabase Auth email OTP request/verify supports account login (`src/supporterAuth.ts:258-294`), but it creates an auth session and is not bound to a campaign, signing attempt, or one signature. It must not be treated as the required fresh signing proof.
- The Resend receipt worker provides a hardened email-send pattern (`supabase/functions/voiceup-participation-receipts/index.ts:5-6`, `62-70`, `149-160`), but it is a receipt queue, not an OTP provider contract.
- Existing OTP has 10-minute expiry, four sends per ten minutes, five attempts, atomic single verification, and provider fail-closed behavior (`supabase/functions/voiceup-otp/index.ts:14-19`, `123-176`, `179-278`). These controls should be generalized.

**Required capability:** a service-role-only email challenge table/function (or a safely generalized identifier challenge table) storing normalized email hash, code hash, campaign/workspace/attempt binding, expiry, send/attempt counters, verified/consumed timestamps, and provider metadata. A verified token must be single-purpose and consumed atomically by the participation operation. Google login, an existing VoiceUp session, and a guest must all complete this fresh challenge; authentication may prefill name/email but cannot waive it.

Security gates: generic success messages to prevent email enumeration; per-email, per-IP/client, per-campaign and global rate limits; constant-time hash comparison; invalidate older challenges on resend; 5–10 minute expiry; maximum attempts; one successful consumption; audit without raw code/email; provider failure must stop signing, while receipt failure remains post-commit/fail-open.

## 3. Optional SMS OTP and screen verification

**Current status conflicts with the requirement.** GSAA screen OTP is enabled by `VOICEUP_SHOW_OTP` plus a hard-coded slug set (`voiceup-otp/index.ts:17-19`, `110-120`, `145-176`), and the GSAA blueprint explicitly declares `screen_otp` (`src/config/goudhanCampaignBlueprint.ts:81-87`). Non-screen public signing always invokes the SMS webhook provider (`voiceup-otp/index.ts:32-51`, `145-152`). No `Campaign` field or Campaign Admin control exists for SMS OTP, screen verification, Email OTP, or activation (`src/types.ts:352-419`; `src/pages/app/CampaignsTab.tsx:2096-2105`). Integration metadata lists MSG91/Gupshup/Twilio/Airtel IQ for SMS and Resend/SendGrid/SES for email, but the OTP runtime uses only one generic webhook (`src/types.ts:623-632`; `src/pages/app/SaasTab.tsx:1114-1149`).

Required precedence, fail closed:

1. Platform security floor: Email OTP required and cannot be disabled.
2. Campaign safety override: GSAA `screenVerificationEnabled=false` regardless of environment; the feature remains available only to other explicitly enabled campaigns.
3. Campaign Admin setting: `smsOtpEnabled`, default `false`; enabling is rejected unless an approved platform provider is ready.
4. Legacy/default: missing policy means Email OTP on, SMS off, screen off. Environment variables may select provider credentials or DEV delivery, never change campaign policy.

The existing `verificationMethod` enum is a single value. The new flow needs independent evidence (`emailOtpVerified=true`, `smsOtpVerified` conditional, `screenVerificationUsed` conditional), not mutually exclusive methods.

## 4. Guest signing

**Partially implemented, but not compliant.** The page offers Google or guest signing and does not require auth to enter the wizard (`PublicCampaignPage.tsx:2730-2741`). Account creation occurs only after success. Referral input and a personal referral link are preserved (`3086-3107`, `3350-3365`).

Conflicts:

- GSAA currently requires name, email, state, district and block (`goudhanCampaignBlueprint.ts:81-87`), and renders location collection when required (`PublicCampaignPage.tsx:2995-3055`). The requested guest contract permits only Name, Email, Phone, mandatory Email OTP, configured SMS OTP, and affirmative campaign consent.
- Email is format-checked but not ownership-verified (`src/App.tsx:2147-2155`; screen wrapper `203-210`, `251-257`).
- Existing campaign+phone guests are sent through the late duplicate error rather than idempotent already-recorded recovery.
- A temporary browser draft is supported, but screen verification deliberately cannot save a server draft.

Required result: guest signing remains unauthenticated; auth is optional prefilling only. Store the canonical campaign participation/profile after successful proof, but do not create an Auth user or `voiceup_supporter_accounts` mapping. Keep referral attribution/share code on the participation. Location/profile completion must move to optional post-sign account/profile flows and must not gate GSAA signing.

## 5. Optional account activation

**Signing is transactionally independent today, but activation is not configurable.** The Edge commits signing before attempting a claim grant and ignores claim-grant failure (`voiceup-public-signing/index.ts:319-345`). However, every eligible success issues a 24-hour grant (`20261025010000_supporter_account_claim_grants.sql:197-249`) and the post-sign UI shows the claim panel whenever that grant/link exists (`PublicCampaignPage.tsx:3368-3415`). There is no campaign toggle.

Secure later activation is partly reusable: authenticated routing can issue a fresh historical verified-email claim grant without re-signing (`supabase/migrations/20261104010000_existing_supporter_routing.sql:263-344`), and claim consumes a confirmed-email-bound token into a unique supporter account (`20261025010000_supporter_account_claim_grants.sql:253-385`).

Required changes:

- Add `accountActivationOfferEnabled=false` to the server-owned campaign verification policy. OFF means no immediate grant/UI prompt, not “delete eligibility.”
- Add an explicit later “Activate my account” flow that requires fresh verified email, re-derives the existing canonical participation, issues a short-lived single-use claim, and never calls `submit_support` again.
- Preserve the signer/referral record independently of account state. Profile completion starts after claim and never changes signing status.
- Certificates currently require a claimed `voiceup_supporter_accounts` row and verified participation (`20261105010000_campaign_participation_certificates.sql:434-529`); preserve eligibility from participation and issue after later claim.
- GauPoints signing awards currently reject unclaimed supporters (`20261116010000_gaupoints_verified_signing_award.sql:180-189`). Add a durable pending entitlement keyed to signing evidence, settled idempotently after activation; otherwise “preserve GauPoints” conflicts with activation OFF.
- “Grow Zone” has no named backend contract in this repository. Treat it as an account-only UI entitlement derived from verified participation plus the approved role/profile rules; do not make signing depend on it.

## 6. Admin displayed as Supporter

**Confirmed display/session-classification defect; no authorization escalation found.** `getCurrentSupporterIdentity` accepts any confirmed Supabase Auth user and does not inspect role (`src/supporterAuth.ts:239-255`). The public campaign page loads the manifest, correctly requires supporter ownership before loading an owned supporter dashboard (`PublicCampaignPage.tsx:972-999`), but then creates `supporterSession` for every authenticated identity and falls back to the literal name “Supporter” even without ownership (`1000-1018`). The public header renders that session as the supporter account identity (`1931-1964`). Thus a Platform/Campaign Admin session can display as Supporter.

The authorization model remains separated: the manifest independently returns `platformAdmin`, supporter ownerships, volunteer assignments, coordinator bindings, and workspace memberships (`supabase/migrations/20261029010000_account_access_manifest_and_supporter_dashboard.sql:181-227`), and destination routing distinguishes Platform, Workspace, Campaign Admin, Supporter, and Coordinator (`src/accountAccess.ts:409-485`). `ownedCampaignSignature` is true only when an owner-scoped dashboard contains a verified signer (`PublicCampaignPage.tsx:989-1031`). No code evidence shows that the Supporter label grants dashboard ownership, workspace membership, or campaign authority.

Permanent fix: derive a public header identity model from the manifest. Show “Supporter” only with campaign supporter ownership; otherwise show Platform Admin, Campaign Admin, Workspace role, Coordinator, or neutral “Signed in,” with role-aware destinations. Keep signing eligibility separate so an authenticated admin who has not signed may still use the guest-equivalent signing flow and must complete fresh campaign Email OTP.

## Reconciliation with Section 18’s 15 decisions

| §18 decision | Reconciliation with this addendum | Blocking effect |
|---|---|---|
| 1. Canonical role taxonomy | No change; signing/activation must not infer Volunteer/Coordinator role. | Not a blocker for the reliability transaction; remains a blocker for role implementation. |
| 2. Mandatory profile | Split minimal signing fields from role/account profile completion. GSAA location cannot remain a signing prerequisite under the new requirement. | **Decision required.** |
| 3. Identity standard | Must define fresh Email OTP as signing proof, conditional SMS, phone uniqueness, expiry, and evidence access. | **Direct blocker.** |
| 4. Qualified referral | Guest referral attribution can persist, but whether unclaimed accounts count remains undecided. | Blocks referral/Grow eligibility, not recording support. |
| 5. Qualified Volunteer | No role is granted by signing or activation; eligibility remains policy-driven. | Blocks Grow/role eligibility. |
| 6. Invitation bypass | Must never bypass Email OTP, consent, uniqueness, or approval. | No signing bypass permitted. |
| 7. Inviter/approver separation | Unchanged; account activation and signing confer no approval authority. | Role workflow only. |
| 8. Role-to-Business-OS permissions | The admin-header defect reinforces that display identity, supporter ownership, and workspace authority must stay separate. | **Direct security acceptance criterion.** |
| 9. Jurisdiction semantics | Requested location-free guest signing conflicts with current GSAA geography requirements; jurisdiction may be collected later for roles. | **Decision required.** |
| 10. Approval levels/SLA | Unchanged; no approval queue belongs in signing. | Role workflow only. |
| 11. Withdrawal/reapplication | An idempotent already-recorded response is not reapplication or withdrawal. Define those separately. | Not a blocker for duplicate recovery. |
| 12. Notification providers | Must select/operate Email OTP and optional SMS providers, templates, retry ownership, and consent boundaries. | **Direct blocker.** |
| 13. Legacy migration | Backfill normalized participation identity/operation evidence and retain historical verified-email claim paths. | **Direct data-migration blocker.** |
| 14. Funnel instrumentation | Add server events for OTP requested/verified, submit started/replayed/completed/conflicted; never count replay as a new signature. | Required before readiness sign-off. |
| 15. Retention/privacy | Define retention/access for email/phone hashes, challenges, attempt ledger, provider IDs, IP/client throttles, and audit. | **Direct blocker.** |

These six findings do not close the 15 decisions. Decisions 2, 3, 8, 9, 12, 13, 14, and 15 directly constrain this implementation; the remaining decisions still block the role-approval scope documented in the parent audit.

## Affected files and required migrations

### Application/Edge files

- `src/types.ts`: campaign verification/activation policy and multi-proof evidence types.
- `src/config/productionCampaignBlueprint.ts`, `src/config/goudhanCampaignBlueprint.ts`: defaults; GSAA Email on, SMS off, screen off, activation off; remove location from signing minimum.
- `src/pages/app/CampaignsTab.tsx`: Campaign Admin SMS toggle and read-only mandatory Email/GSAA screen policy; authority checks.
- `src/pages/app/SaasTab.tsx`: provider readiness only; no campaign-policy override.
- `src/backend.ts`: Email OTP request/verify contracts, durable signing-attempt ID, multi-token submit, typed replay outcomes.
- `src/publicSigningJourney.ts`: persist opaque attempt ID and safe draft fields; never persist OTP/code/token.
- `src/App.tsx`: Email-first/fresh proof orchestration, conditional SMS, idempotent replay handling, activation separation.
- `src/pages/PublicCampaignPage.tsx`: minimal guest fields, no GSAA location gate, Email/SMS steps, role-aware header, optional activation UI.
- `src/supporterAuth.ts`, `src/components/CampaignInlineAuthPanel.tsx`: keep account auth separate from signing proof; Google/session cannot satisfy fresh signing OTP.
- `src/components/SupporterAccountClaimPanel.tsx`, `src/supporterRouting.ts`: explicit later activation and claim renewal.
- `src/accountAccess.ts`: public header role projection from the authoritative manifest.
- `supabase/functions/voiceup-otp/index.ts`: remove GSAA screen selection; keep/refactor SMS provider path under campaign policy.
- `supabase/functions/voiceup-public-signing/index.ts` and `logic.ts`: require campaign-bound Email proof, conditional SMS proof, atomic attempt replay, safe already-recorded outcome.
- `supabase/functions/voiceup-supporter-routing/index.ts`: authenticated recovery/activation only; retain anonymous route neutrality.
- `supabase/functions/voiceup-participation-receipts/index.ts`: reusable Resend transport pattern only; receipt semantics remain post-commit.

### Forward-only database migrations

1. Campaign verification-policy table (workspace/campaign/version, mandatory Email, SMS default false, screen flag, activation offer false), exact Campaign Admin write authorization, immutable audit/version history.
2. Public Email OTP challenge table/RPCs with campaign+attempt+email-hash binding, expiry/send/attempt/consume controls, RLS denial to browser tables, service-role execution only.
3. Durable public participation operation ledger with unique idempotency key, payload hash conflict detection, replayable safe result, and bounded retention policy.
4. Normalized campaign participation identity registry with unique canonical phone hash; transactional backfill that reports ambiguities rather than silently choosing.
5. Replacement atomic submit RPC that validates Email and conditional SMS proof, reserves/replays the operation, upserts/returns one canonical participation, records consent/audit, and never exposes identity existence anonymously.
6. Activation/entitlement migration: later claim reissue, pending certificate/GauPoints entitlements, idempotent settlement on claim, and no re-signing.
7. Backfill/reconciliation report for JSONB signers/idempotency, existing claim grants, certificates and GauPoints; no destructive rewrite until ambiguities are approved.

## Dependency-ordered implementation sequence

1. Approve the directly implicated Section 18 decisions and the policy precedence above.
2. Add provider readiness/secrets and the versioned campaign policy, defaulting GSAA to Email on/SMS off/screen off/activation off.
3. Add normalized identity and durable operation ledgers; dry-run/backfill and resolve ambiguous campaign+phone records.
4. Implement campaign-bound Email OTP and optional SMS challenges with security controls.
5. Implement the single atomic, replayable signing RPC and safe `already_recorded` outcome; keep current public RPC behind a DEV feature flag during comparison.
6. Update the public client to use a persistent opaque attempt ID and minimal guest fields; remove GSAA screen/location gates.
7. Separate activation UI/claims and add deferred certificate/GauPoints settlement.
8. Correct public header role display from the manifest without changing authorization.
9. Add instrumentation, run migrations and integration tests in Development only, then perform concurrency, lost-response, refresh, provider-failure and authorization testing before any release decision.

## Required security and regression gates

- Email OTP mandatory for guest, Google, existing account, Platform Admin and Campaign Admin signing; a pre-existing auth session never substitutes.
- SMS absent by default; enabled only by exact Campaign Admin scope plus ready approved provider.
- GSAA never receives/accepts screen proof; other campaigns require an explicit versioned policy.
- Same attempt/same payload replays the same result across refresh; same key/different payload conflicts; same campaign+phone never creates a second participation.
- Lost response after commit returns Done/Already recorded on retry with matching verified email.
- Mismatched verified email cannot claim/read an existing phone participation; anonymous APIs remain route-neutral.
- OTP resend, expiry, attempt exhaustion, concurrent verification and token consumption tests.
- Guest flow requires exactly Name, Email, Phone, proofs, and affirmative campaign consent; no auth, password, location or profile-completion gate.
- Activation OFF produces no Auth user/account mapping and no prompt; later activation links the existing supporter without another signature.
- Certificate/GauPoints entitlements survive delayed activation and settle once; profile/Grow rules do not modify signing evidence.
- Platform/Campaign Admin header label and destinations reflect the manifest; no supporter dashboard without ownership; no authority gained from signing.
- Existing non-GSAA phone OTP, account login/recovery, coordinator mobile OTP, role authorization, certificate ownership and workspace merge tests remain green.

Focused read-only baseline executed: **110 tests passed, 0 failed** across atomic participation, routing, screen OTP, signing recovery, mandatory-email phase-one checks, account claims, certificates, GauPoints, and public account/header contracts.

## Final recommendation

**BLOCKED for implementation readiness.** Approve the policy/identity/provider/retention decisions and the forward-only migration design first. Once approved, implementation should start with durable participation identity/idempotency plus campaign-bound Email OTP—the permanent reliability boundary—not with UI suppression of the duplicate error or relaxation of uniqueness.

