# Role Application, Invitation, Approval Queue, and Command Center Read-Only Audit

**Audit date:** 2026-11-18  
**Mode:** development-only, read-only application audit  
**Audited branch:** `release/campaignos-launch-preparation-20261116`  
**Audited HEAD:** `495da34430cbbc2857d7202f160533fd5f40eab9`  
**Working-tree caveat:** the audit inspected the current working tree, which already contained 287 modified or untracked entries. Those changes were treated as user-owned. This report is the only file created by this audit.  
**Implementation status:** not approved; no application code, migration, deployment, or database mutation was performed.

This is the durable consolidated handoff for the role-application amendment. It incorporates the relevant findings and constraints already documented in `VOICEUP_V1_STOCK_TAKING.md`, `COORDINATOR_NETWORK_V1.md`, `coordinator/COORDINATOR-PRODUCTION-PLAN.md`, `coordinator/COORDINATOR-REGRESSION-FENCE.md`, and `FC1A_ATOMIC_APPROVAL_ADR.md`. It does not repeat unrelated product stock-taking detail.

## 1. Executive conclusion

VoiceUp has solid reusable foundations, but it does **not** yet have the requested complete role-management workflow.

The present system provides:

- OTP-backed public submission of Volunteer and Coordinator participation requests.
- Tenant/campaign-scoped request persistence, consent evidence, candidate routing, idempotency, active-request deduplication, and a privacy-safe applicant status read.
- An authoritative Coordinator Network with normalized coordinators, geography, hierarchy, campaign links, referrals, audit, optimistic versions, mobile verification, status transitions, identity-binding grants, and a substantial management UI.
- Authenticated supporter account ownership, confirmed-email access, approved-Volunteer recognition, Coordinator identity binding, existing campaign/workspace membership contracts, canonical geography services, referral evidence, GauPoints, audit patterns, and reporting surfaces.

The present system does **not** provide:

- The specified Volunteer or Coordinator eligibility checks.
- A requirement that a Coordinator applicant already be a Volunteer.
- Referral thresholds or qualified-Volunteer thresholds for role eligibility.
- Invitation records, invitee acceptance/decline, or invitation-aware eligibility.
- A canonical reviewer queue or any request decision API.
- Approve, reject, more-information, reassignment, expiry, cancellation, or withdrawal operations.
- Atomic role assignment from an approved request.
- Role-policy configuration/versioning.
- Role-workflow notifications or reminders.
- Per-role, per-campaign, and per-jurisdiction approver authorization.
- Stale-eligibility revalidation at decision time.
- A tabbed role-aware Campaign Command Center with truthful funnels and drill-down contracts.

**Overall classification: `EXISTS BUT INCOMPLETE`.** Submission and adjacent authority/identity domains exist and pass focused tests; the approval workflow, invitation workflow, eligibility engine, queue operations, and command-center information architecture are missing or blocked by backend/schema work.

## 2. Status legend

| Status | Meaning |
|---|---|
| `EXISTS AND WORKS` | Implemented in the inspected working tree and supported by code/tests. |
| `EXISTS BUT INCOMPLETE` | Reusable implementation exists, but it does not meet the stated contract. |
| `MISSING` | No implementation or only a descriptive placeholder exists. |
| `BLOCKED BY BACKEND/SCHEMA` | UI work would be misleading or insecure until an authoritative backend contract exists. |

## 3. Requirement-by-requirement inventory

| Requirement area | Status | Evidence and exact gap |
|---|---|---|
| Volunteer self-application submission | `EXISTS BUT INCOMPLETE` | `PublicCampaignPage.tsx` submits a structured request through `voiceup_submit_participation_request`; it requires published campaign, signing OTP, completed support, and consent. It does not require activated account, confirmed email, profile completion, identity policy, three qualified referrals, or campaign eligibility policy. |
| Volunteer eligibility progress | `MISSING` | No reusable role-eligibility evaluator or eligibility projection exists. Supporter dashboard shows role badges and request status, not missing requirements or progress. |
| Coordinator self-application submission | `EXISTS BUT INCOMPLETE` | Structured level/geography/motivation fields and routing exist. The backend does not require an existing Volunteer assignment, three qualified Volunteers, activated account, or complete profile. |
| Coordinator eligibility progress/history | `EXISTS BUT INCOMPLETE` | Applicant can read current request records, but no eligibility evidence/history or decision history exists. |
| Leader/Coordinator invitations | `MISSING` | Coordinator records can have status `invited`, but there is no role invitation aggregate, invitee acceptance/decline, expiry, requested role, or approval chain. |
| Coordinator account-binding grant | `EXISTS AND WORKS` | A hashed, 30-minute, single-use grant can bind a confirmed supporter account to an already active/mobile-verified Coordinator. It grants no permission and is not an invitation or approval. Reuse its token safety pattern. |
| Volunteer invitations | `MISSING` | No volunteer invitation table, API, UI, acceptance state, or assignment contract exists. |
| Approval authority matrix | `BLOCKED BY BACKEND/SCHEMA` | Candidate routing exists, but no decision authority function exists. Coordinator Network managers are authorized only by broad workspace roles, without request type or jurisdiction. |
| Canonical approval queue | `EXISTS BUT INCOMPLETE` | `voiceup_participation_requests` is the right canonical starting point. It stores only self-submitted Volunteer/Coordinator requests and six statuses; no queue API or reviewer UI exists. |
| Request decision operations | `MISSING` | No approve/reject/request-info/reassign functions, no rejection reason, no decision version, and no decision ledger. |
| Atomic/idempotent decisions | `MISSING` | Role decisions are absent. The Field Collection approval ADR/RPC provides a strong reusable transaction/ledger/version pattern. |
| Role activation after approval | `BLOCKED BY BACKEND/SCHEMA` | Account manifest recognizes Volunteer status `approved`/`assigned`, but no authorized function can set that status. Coordinator activation is separate manual Coordinator Network mutation. |
| Applicant dashboard: current/next role | `EXISTS BUT INCOMPLETE` | `SupporterDashboardV2.tsx` derives current Volunteer/Coordinator badges from the access manifest and shows participation requests. It does not compute next role or expose role actions. |
| Applicant dashboard: profile completion | `MISSING` | Owner-scoped optional profile update RPC exists, but there is no mandatory-field policy, percentage, missing-field list, or completion snapshot. Current dashboard intentionally has no profile-edit action. |
| Applicant dashboard: referrals/GauPoints | `EXISTS BUT INCOMPLETE` | Referral link/code, verified referral edges, GauPoints wallet/leaderboard, and referral trees exist. They are not joined to role eligibility. |
| Applicant dashboard: hierarchy/assigned leader | `EXISTS BUT INCOMPLETE` | Coordinator hierarchy exists. Supporter-to-Volunteer-to-Coordinator assignment does not. No privacy-safe assigned-leader projection exists. |
| Pending invitations | `MISSING` | No invitation state exists. |
| Decision history | `MISSING` | Request audit accepts only `request.submitted`. Coordinator audit covers coordinator entity changes, not application decisions. |
| Command Center summary | `EXISTS BUT INCOMPLETE` | `CommandCenterTab.tsx` has real metrics, action cards, module navigation, and readiness summaries, but it is a long page with no internal tabs and no role queue metrics. |
| Signature funnel | `BLOCKED BY BACKEND/SCHEMA` | Signed/verified/activated facts can be sourced; Visitor and Started event facts are not persisted canonically. A complete funnel must not be fabricated. |
| Referral hierarchy visualization | `EXISTS BUT INCOMPLETE` | Growth and GauPoints have referral graphs; Coordinator Network has a coordinator tree. No unified Coordinator -> Volunteer -> Supporter projection exists. |
| Approval flow visualization | `MISSING` | No complete state machine or queue data exists. |
| Profile completion visualization | `BLOCKED BY BACKEND/SCHEMA` | No versioned completeness definition or server aggregate exists. |
| Geography coverage | `EXISTS BUT INCOMPLETE` | Canonical Business OS location services, signer location references, coordinator geographies, and report totals exist. They are not combined into role coverage; missing-location supporters must remain unassigned/unknown. |
| KPI/chart drill-down | `EXISTS BUT INCOMPLETE` | Some cards navigate to modules and Coordinator Network has directory/profile drill-down. Command Center KPIs do not carry typed filters/breadcrumb context to server-paginated destinations. |
| Queue filters/counters/notifications | `MISSING` | No queue UI/API, counters, overdue logic, request notification outbox, or reminders. |
| Admin role-policy configuration | `MISSING` | No threshold, inviter, approver, expiry, reminder, or approval-level configuration. GauPoints config is unrelated and must not be repurposed. |
| EN/HI/OD | `EXISTS BUT INCOMPLETE` | Current public-request and Coordinator lifecycle/profile keys have parity and pass tests. The requested workflow and Command Center keys do not exist. Some newer supporter-dashboard copy is hard-coded English and should be cleaned up when that protected surface is approved for change. |
| Mobile/accessibility | `EXISTS BUT INCOMPLETE` | Current public request and Coordinator surfaces have focused responsive/accessibility tests. `SectionTabs` lacks arrow-key behavior; the Supporter Dashboard tab implementation is the stronger reusable pattern. |
| Privacy | `EXISTS BUT INCOMPLETE` | Applicant self-read is privacy-safe. Raw request table read is available to every Coordinator Network reader, including `field_officer` and `viewer`; a least-privilege reviewer projection is required before queue UI. |

## 4. Existing role-application workflow inventory

### 4.1 Canonical request path

The normalized request path is the correct foundation:

- Schema: `supabase/migrations/20260728010000_participation_requests.sql`.
- Location correction: `20260917010000_location_consolidated_persistence.sql` and `20261028010000_participation_location_resource_scope_fix.sql`.
- Applicant read: `20260728020000_participation_request_public_read.sql`.
- Edge boundary: `supabase/functions/voiceup-public-signing/index.ts` and `logic.ts`.
- Client adapter: `src/backend.ts`.
- Types/helpers: `src/types.ts` and `src/movementRequests.ts`.
- Public UI: `src/pages/PublicCampaignPage.tsx`.
- Authenticated owner status UI: `src/pages/SupporterDashboardV2.tsx` through the account dashboard RPC.

The submission function correctly provides:

- Service-role-only mutation behind the public signing Edge Function.
- Published campaign validation.
- Purpose-bound, campaign-bound, unexpired OTP evidence.
- Existing completed-support evidence.
- Explicit consent evidence with server timestamps.
- Allowlisted and bounded input.
- Server-selected initial status and candidate routing.
- Idempotency-key conflict protection.
- One active request per supporter/campaign/request type.
- A `request.submitted` audit event.
- Privacy-safe own-request read with no reviewer, consent, routing, or audit leakage.

It currently accepts both Volunteer and Coordinator applications directly after signing. This is materially weaker than the amended requirements because account activation and confirmed-email ownership are not prerequisites at submission time.

### 4.2 Legacy Coordinator application path

`PublicCoordinatorApplication` remains embedded in signer JSON, and `submitPublicCoordinatorApplication()` calls the legacy public participation mutation. It defaults to `field_coordinator` and `Pending Approval`. This overlaps the normalized request path and should be retired through a compatibility migration/projection after the normalized queue becomes complete. It must not become a second approval engine.

### 4.3 Applicant status path

Two surfaces exist:

- The immediate post-sign request tracker shows request ID, type, status, stage, campaign, geography, and timestamps.
- The authenticated supporter dashboard shows owned participation requests and server-confirmed role badges.

Neither surface shows eligibility evidence, missing requirements, pending invitations, approver-safe status, decision reasons/history, assigned leader, qualified-Volunteer count, or role-action authorization.

## 5. Existing approval queue inventory

`voiceup_participation_requests` is a submission ledger, not a complete queue.

### Existing fields

- Unique UUID request ID.
- Workspace and generic resource identity (`application_key`, `resource_type`, `resource_id`).
- Applicant supporter ID.
- Request type/requested role.
- Coordinator level and geography.
- Skills, interests, motivation, experience, availability, working area.
- Status, routing metadata, escalation state.
- Consent, idempotency key, request fingerprint.
- Submitted/updated timestamps and audit metadata.

### Existing statuses

`pending`, `escalated`, `approved`, `rejected`, `assigned`, `withdrawn`.

### Missing canonical queue fields

- Initiation type (`SELF`/`INVITATION`).
- Inviter identity and invitation policy evidence.
- Invitee acceptance/decline timestamps.
- Requested role ID separate from the current two-value type.
- Policy version ID and approval plan/version.
- Immutable eligibility snapshot plus current eligibility version/hash.
- Required approval steps and current step.
- Assigned approver authority/scope evidence.
- Request version for optimistic concurrency.
- Review start, due, expiry, and SLA timestamps.
- More-information request and response metadata.
- Rejection/rework reason.
- Decision history and reassignment history.
- Notification history.
- Final role assignment result.
- Cancellation/expiry actor and reason.

### Missing queue operations

There is no reviewer list/read projection, pagination, search, filtering, counters, claim/start-review, approve, reject, request-information, reassign, withdraw, cancel, expire, retry assignment, or notification dispatch operation.

### Important RLS finding

Direct `SELECT` on requests/audit is allowed when `voiceup_can_read_coordinator_network(workspace_id)` is true. That includes active `platform_owner`, `workspace_admin`, `campaign_admin`, `field_officer`, and `viewer` workspace roles plus platform admin. The raw row includes applicant ID, motivation, experience, routing, and consent metadata. A production queue should revoke broad raw reads and expose purpose-built, server-authorized list/detail projections.

## 6. Existing invitation and role-assignment contracts

| Contract | What it actually does | Reuse decision |
|---|---|---|
| Coordinator status `invited` | Marks a manager-created Coordinator record as invited. No acceptance token or invitee action exists. | Keep as lifecycle output, not as the invitation source of truth. |
| `voiceup_coordinator_referrals` | Links an inviter Coordinator to a referred Coordinator and immediately records `accepted` during manager upsert. | Do not treat as an invitation. Reuse only as referral attribution after acceptance. |
| Coordinator account-binding grants | Manager issues hashed, expiring, single-use proof; confirmed supporter owner claims it; binding is version-checked and audited. | Reuse token, replay, expiry, and claim patterns for role invitations. Do not conflate binding with approval. |
| `voiceup_coordinator_campaigns` | Links a Coordinator to campaigns, with active/revoked lifecycle. | Reuse as one assignment target after approved Coordinator activation. |
| `reports_to_coordinator_id` | Authoritative Coordinator hierarchy with broader-role validation and cycle prevention. | Reuse for final hierarchy assignment. |
| Approved Volunteer manifest | An owned Volunteer request with status `approved`/`assigned` is exposed as an approved Volunteer role. | Preserve compatibility, but add an authorized atomic decision/assignment function. |
| Workspace membership | Grants Business OS permissions for canonical roles only. Coordinator identity alone grants none. | Preserve strictly. Role approval must never silently create Platform Admin or unrelated workspace membership. |
| Resource assignment | Provides exact campaign-scoped `campaign_admin` authority and history. | Reuse for campaign-admin approver scope; extend with explicit role-approval capabilities rather than title inference. |

No Volunteer invitation or Volunteer team-assignment persistence exists. Coordinator Network production planning already identifies volunteer/team assignment as a future normalized domain; this amendment depends on that missing contract for “qualified Volunteers under hierarchy.”

## 7. Exact current authority matrix

The table below is the actual inspected enforcement, not the desired policy.

| Action | Current permitted actor | Scope/enforcement |
|---|---|---|
| Submit public Volunteer/Coordinator request | Service-role Edge call on behalf of OTP-verified supporter | Exact published workspace/campaign/phone; no activated account requirement. |
| Read own public requests | Service-role Edge call on behalf of same OTP-verified supporter | Exact published workspace/campaign/supporter; privacy-safe projection. |
| Read raw request/audit rows | Platform admin or active workspace `platform_owner`, `workspace_admin`, `campaign_admin`, `field_officer`, `viewer` | Workspace only; not request type, campaign assignment, or jurisdiction. |
| Decide a role request | **Nobody; no decision API exists** | Not implemented. |
| Manage Coordinator Network | Platform admin or active workspace `platform_owner`, `workspace_admin`, `campaign_admin` | Entire workspace; no jurisdiction restriction. |
| Read Coordinator Network | Manager roles plus `field_officer` and `viewer` | Entire workspace snapshot, including coordinator phone/email. |
| Issue Coordinator binding grant | Coordinator Network manager | One active, mobile-verified Coordinator in the workspace. |
| Claim Coordinator binding | Confirmed Auth user who independently owns a supporter account in the same workspace | Expiring single-use token; identity binding only. |
| Receive approved Volunteer access | Auth user owning a supporter whose Volunteer request status is `approved` or `assigned` | Status is consumed, but no authorized status mutation exists. |
| Open Business OS as Coordinator | Active/mobile-verified bound Coordinator **and** an accepted active workspace membership | Coordinator title alone is not permission. |
| Platform administration | Existing platform-owned administrative contract | Must remain unchanged. |

### Current safety results

- A Volunteer cannot approve a Coordinator request because no request decision operation exists and Volunteer is not a workspace management role.
- A Coordinator title alone cannot approve anything. Only a separate qualifying workspace membership can manage Coordinator Network.
- Coordinator hierarchy cycles and self-referral are blocked in Coordinator Network.
- Duplicate active participation requests and idempotency conflicts are blocked.
- Concurrent Coordinator entity edits are protected by row locks and expected versions.

These facts are useful but do not satisfy the requested approval authority matrix.

## 8. Proposed configurable approval authority matrix

The matrix must be enforced by one backend authorization function using the request, actor, policy version, campaign assignment, role identity, and canonical jurisdiction. UI visibility must be derived from the same server projection.

| Request | Default eligible approver authority | Required server checks |
|---|---|---|
| Volunteer self-application | Campaign Admin; optionally an active Coordinator explicitly granted `volunteer_request_approver` by policy | Not applicant; not inviter-only authority; exact campaign; active approval grant; jurisdiction contains request scope; current eligibility valid. |
| Volunteer invitation | Campaign Admin; optionally policy-authorized active Coordinator in scope | Same checks plus inviter authority, accepted invitation, and referral-threshold bypass only. |
| Coordinator self-application | Campaign Admin, workspace admin, or policy-authorized **broader** active Coordinator/senior leader | Existing Volunteer role; approver role rank strictly broader; exact campaign/jurisdiction; never a Volunteer-only actor. |
| Coordinator invitation | Campaign Admin, workspace admin, or policy-authorized broader senior leader | Coordinator invitations enabled; inviter allowed; invite accepted; approver independent where policy requires; broader role and containing jurisdiction. |
| Senior leadership | Campaign Admin/workspace admin or explicitly higher policy authority | Strict role rank and jurisdiction; multi-level approval if configured. |
| Role reassignment/renewal/revocation | Current owning authority plus policy-defined higher authority for sensitive transitions | Current assignment version, reason, no orphaned hierarchy, jurisdiction, and separation-of-duties policy. |
| Platform administration | Existing platform-owned process only | Role workflow configuration can never mint platform roles or bypass platform authorization. |

**Non-negotiable deny rules:** applicant self-approval, inviter self-approval where independent approval is required, Volunteer approval of Coordinator, equal/lower-rank Coordinator approval, cross-campaign or cross-workspace approval, out-of-jurisdiction approval, circular reporting assignment, duplicate active request/invitation, stale request version, stale policy version, stale eligibility, and direct browser-selected authority.

## 9. Referral-based versus invitation-based eligibility

### 9.1 Evidence sources to reuse

- Account activation: `voiceup_supporter_accounts` owned by confirmed Auth user.
- Phone identity: verified public-signing evidence and existing owner claim; policy must define accepted methods.
- Email activation: `auth.users.email_confirmed_at` as already enforced by access-manifest/dashboard RPCs.
- Profile data: canonical owned signer record plus owner-scoped profile patch RPC.
- Verified unique referrals: immutable `voiceup_gp_referral_edges`, which enforce one child, one parent, verified campaign evidence, claimed supporter accounts, no self-referral, and unique evidence.
- Volunteer role: approved/assigned Volunteer request projection.
- Qualified Volunteers under hierarchy: **missing** until Volunteer team/manager assignment is normalized.
- Campaign prerequisites: versioned role-policy record, not arbitrary browser configuration.
- Geography: canonical `PersistedLocationReference` and Business OS geography services.

### 9.2 Required rule comparison

| Rule | Volunteer self | Coordinator self | Invitation path |
|---|---:|---:|---:|
| Confirmed activated account | Required | Required | Required before approval/activation |
| Required identity verification | Required | Required | Required |
| Mandatory profile completion | 100% | 100% | 100% |
| Existing Volunteer role | No | Required | Required for Coordinator invitation unless policy explicitly defines a separate conversion path |
| Qualified unique referrals | Default 3 | Not the controlling rule | **Bypassed** |
| Qualified Volunteers under hierarchy | No | Default 3 | **Bypassed only for referral-count eligibility**, not role/jurisdiction/identity checks |
| Consent/eligibility | Required | Required | Required after invite acceptance |
| Campaign/jurisdiction prerequisites | Required | Required | Required |
| Approval | Required | Required | Required |

Referral qualification must never directly activate a role. It only makes a self-application eligible to enter approval.

### 9.3 Missing definitions that block implementation

The product owner must define:

- Mandatory profile fields by campaign/role and how “100%” is calculated.
- Accepted identity-verification methods and expiry.
- Whether verified referral evidence requires claimed accounts, verified signatures, non-duplicates, and same-campaign scope. The GauPoints edge contract already satisfies the strongest available interpretation.
- The exact meaning of a “qualified Volunteer,” including active status, training, geography, campaign, and whether direct reports only count.
- Whether Coordinator invitation may bypass only the count or also the existing-Volunteer prerequisite. Recommended: bypass counts only.
- Whether inviter and final approver may be the same person for low-risk Volunteer invitations.

## 10. Complete application and approval state machine

Use the requested public statuses as the canonical request state. Record every transition as an append-only event. A `version` column and deterministic operation key must guard all mutations.

```text
SELF:
  Draft -> Pending eligibility
        -> Pending approval -> Under review -> Approved
                            \-> More information required -> Pending eligibility
                            \-> Rejected

INVITATION:
  Draft -> Pending invitee acceptance -> Pending eligibility
                                      \-> Cancelled / Expired / Declined(Rejected)
        -> Pending approval -> Under review -> Approved / Rejected

ANY NON-TERMINAL:
  -> Withdrawn (applicant)
  -> Cancelled (authorized initiator/admin)
  -> Expired (server policy)
```

### Transition rules

1. `Draft -> Pending eligibility`: validate initiation authority and freeze the role-policy version.
2. `Pending invitee acceptance -> Pending eligibility`: consume a hashed single-use invitation token; bind the accepted invitation to the authenticated owner identity; never accept a caller-supplied supporter ID.
3. `Pending eligibility -> Pending approval`: compute and store an eligibility snapshot. Ineligible self-applications remain non-approvable and expose missing requirements; do not assign an approver.
4. `Pending approval -> Under review`: authorized actor claims/opens the request using the expected request version.
5. `Under review -> More information required`: require a bounded reason/question; notify applicant; clear decision ownership according to policy.
6. `Under review -> Rejected`: require reason; append immutable decision evidence.
7. `Under review -> Approved`: in one transaction, lock the request, re-authorize actor, re-evaluate current eligibility, compare policy/request versions, enforce separation/jurisdiction, write decision, perform the role assignment, and append audit/outbox records. If any condition fails, do not mark approved.
8. `Approved`: terminal only when final role assignment succeeded. The assignment result records Volunteer assignment/request link or Coordinator ID/campaign/hierarchy link.
9. Reapplication is allowed only after the prior request is terminal and policy permits it; history remains intact.

### Idempotency/concurrency design

Reuse the Field Collection pattern:

- Deterministic operation key per request/action/actor/version.
- `SELECT ... FOR UPDATE` on request and relevant assignment rows.
- Expected request version.
- Immutable decision/operation ledger returning the original result on safe retry.
- Atomic eligibility recheck, assignment, audit, and notification-outbox insert.
- Explicit `stale_request_version`, `stale_eligibility`, `not_authorized`, and `already_decided` results.

## 11. Missing backend, RLS, and security controls

| Priority | Missing control | Required resolution |
|---|---|---|
| P0 | Request decision API | Add versioned RPCs/Edge boundary; never permit direct client updates. |
| P0 | Decision-time authorization | One server function evaluates actor capability, role rank, campaign, workspace, jurisdiction, invitation separation, and self-approval. |
| P0 | Decision-time eligibility recheck | Recompute against current account/profile/referral/role/policy facts inside the transaction. |
| P0 | Atomic role assignment | Approval and assignment must commit or fail together. Preserve Coordinator identity-binding separation and platform roles. |
| P0 | Invitation security | Hashed, expiring, single-use token; owner-bound claim; revocation; wrong-user/workspace denial; immutable acceptance/decline history. |
| P0 | Least-privilege queue reads | Replace broad raw table reads with authorized list/detail RPC projections; restrict direct table grants. |
| P0 | Immutable decision evidence | Extend audit into append-only request events/decisions with actor, authority snapshot, reason, before/after status, policy version, eligibility hashes, request version, and timestamps. |
| P0 | PII field policy | Separate list/detail/profile projections; mask phone/email unless necessary; log sensitive exports; never expose other supporters to applicants. |
| P1 | Versioned role policy | Validated, effective-dated policy records and audit. Never allow Platform Admin grants. |
| P1 | Notification outbox | Idempotent applicant/approver notifications, delivery state, retries, templates, consent/channel rules, and immutable history. Reuse participation-email receipt queue patterns. |
| P1 | Expiry/reminders | Server timestamps and scheduled worker/claim RPC; no browser-only timers. |
| P1 | Volunteer hierarchy | Normalized Volunteer assignment/reporting contract needed for qualified-Volunteer counts and Coordinator scope. |
| P1 | Profile completeness | Versioned required-field definition and owner-safe aggregate/evidence, not a client percentage. |
| P1 | Pagination/search | Cursor-based server queries with bounded page size and stable ordering/indexes. |
| P1 | Aggregate metrics | Authorized server aggregates for command-center KPIs/funnel/queue; definitions and reconciliation tests. |
| P1 | Policy/config separation | Campaign Admin can configure only campaign role policy. Platform administration remains separate. |
| P2 | Data retention | Define retention/redaction for rejected/expired requests, invitation tokens, PII, and notification history while retaining decision evidence. |

## 12. Proposed tabbed Campaign Command Center information architecture

Do not duplicate Growth, Movement CRM, Coordinator Network, Reports, Communications, or Activity. The Command Center should show concise authoritative summaries and deep-link with typed filters to those owning modules.

| Tab | Concise contents | Owning drill-down |
|---|---|---|
| 1. Overview | KPI cards, truthful funnel, current risk/action strip, recent approval flow | Filtered destination modules |
| 2. Signatures | Total/verified/pending/source trend and signature-stage funnel | Reports/supporter register |
| 3. Activation & Verification | Activated accounts, email/phone verification, claim failures, pending activation | Owner-safe activation operations |
| 4. Referrals & GauPoints | Verified referral edges, referral conversion, GauPoints activity/rank summaries | Existing Growth/GauPoints |
| 5. Volunteers | Active/pending/inactive, eligibility distribution, campaign/geography/team coverage | Movement CRM/Volunteer directory |
| 6. Coordinators | Active/invited/suspended, lifecycle, coverage, campaign links | Existing Coordinator Network directory/profile |
| 7. Approval Queue | Counters, pipeline, My Pending, overdue, needs-info, awaiting acceptance | New canonical queue |
| 8. Organization Hierarchy | Coordinator -> Volunteer -> Supporter tree/network with status legend | Coordinator/Volunteer/profile detail |
| 9. Profile Completion | Completion distribution, missing-field breakdown, role/campaign filters | Owner-safe profile operations |
| 10. Communications | Role-workflow notifications, delivery/retry/reminder summary | Existing Communication Hub plus request notification detail |
| 11. Geography | Canonical known coverage, unknown-location count, jurisdiction gaps | Existing Reports/location services |
| 12. Reports & Audit | Queue decisions, role assignments, policy versions, exports, audit filters | Existing Reports/Activity plus role audit |

Use URL/query-backed internal tab and filter state so refresh/back navigation is stable. On mobile, use a horizontally scrollable tablist with keyboard behavior, a compact selected-tab label, and no 12-panel DOM preload.

## 13. Visual dashboard wireframe description

```text
[Campaign Command Center] [Campaign selector] [Last refreshed] [Export]
[Overview][Signatures][Activation][Referrals][Volunteers][Coordinators]
[Approvals][Hierarchy][Profiles][Comms][Geography][Reports & Audit]

OVERVIEW
+----------------+ +----------------+ +----------------+ +----------------+
| Total signed   | | Verified       | | Active Vols    | | Pending approvals|
| count + delta  | | count + rate   | | count + link   | | count + SLA      |
+----------------+ +----------------+ +----------------+ +----------------+

[Visitor* -> Started* -> OTP -> Signed -> Activated -> Profile -> Volunteer -> Coordinator]
 * show "not instrumented" until authoritative events exist

[Approval pipeline chart]              [Role/geography coverage chart]
 Submitted / Eligible / Assigned /     Known coverage / gaps / unknown location
 Review / Approved / Rejected

[Next actions / risks]                 [Recent immutable activity]
```

Every number or segment is either clickable or explicitly marked informational. Empty, loading, error, not-instrumented, and unauthorized states are first-class. Charts must use server aggregates and display definition/tooltips; never infer missing geography or visitor counts.

## 14. Drill-down navigation and data contracts

### 14.1 Navigation contract

- Preserve `campaignId`, Command Center tab, source KPI, filters, sort, cursor, and selected entity in URL/query state.
- Use breadcrumbs such as `Command Center / Approval Queue / Request / Eligibility evidence`.
- Back returns to the exact queue/filter/page context.
- Destination modules accept a typed navigation payload rather than parsing display labels.
- Server independently authorizes every aggregate, list, detail, and mutation; hidden UI is not authorization.

### 14.2 Required backend projections

`get_role_progression(account_id)`

- Owned current roles, next eligible role, policy version, profile completion, verified unique referrals, qualified Volunteers, missing requirements, allowed actions, owned invitations, owned requests, assigned leader (public-safe), GauPoints summary.

`list_role_requests(scope, filters, cursor, limit)`

- Bounded list items only: request ID, applicant display identity, role, initiation type, status, jurisdiction summary, assigned approver summary, timestamps/SLA, eligibility flag, version.
- Server derives actor scope; client cannot request a broader workspace/jurisdiction.

`get_role_request_detail(request_id)`

- Authorized request detail, profile projection, referral/Volunteer evidence, invitation history, decision events, notification events, policy version, allowed operations, current version.

`mutate_role_request(request_id, operation, expected_version, operation_key, payload)`

- Operations: accept/decline invite, start review, request info, respond info, approve, reject, reassign, withdraw, cancel.
- Returns authoritative new state and idempotent result.

`get_campaign_command_center(campaign_id, tab, filters)`

- Defined aggregates only; includes `dataAvailability` per metric and no raw supporter dataset.

`list_hierarchy_nodes(campaign_id, parent_id, filters, cursor, limit)`

- Lazy children, status/category counts, masked display fields, and authorization-safe node actions.

### 14.3 Example drill-downs

- Pending Coordinator Approvals -> queue with `role=coordinator&status=pending_approval` -> request detail -> eligibility -> approve/reject.
- Active Coordinators -> existing Coordinator directory filtered by campaign/status -> existing Coordinator 360 -> Volunteer hierarchy -> qualified referrals.
- Incomplete profiles -> completion distribution segment -> authorized list of owned/actionable profiles -> missing-field summary; never expose unrelated supporter details.
- Geography gap -> canonical location node -> role coverage -> authorized assignment/request list; supporters without location remain in `Unknown`, not fabricated into an area.

## 15. Reusable component and service mapping

| Need | Reuse | Required extension |
|---|---|---|
| Canonical request aggregate | `voiceup_participation_requests` | Add invitation, eligibility, policy, version, decision, SLA, assignment fields through forward migration. |
| Request audit | `voiceup_participation_request_audit` | Expand to append-only event/decision types; do not overwrite prior events. |
| Public self-application UI | `PublicCampaignPage.tsx` normalized forms | Gate actions with server progression; remove/compatibility-wrap legacy Coordinator application. |
| Applicant dashboard | `SupporterDashboardV2.tsx` tabs/role badges/request cards | Add My Role & Progression panel using owner-only projection. |
| Account activation | Account access/supporter-account contracts | Enforce at eligibility and invite acceptance. |
| Coordinator entity/hierarchy | Coordinator Network schema, types, network services, tab | Consume approved Coordinator assignment; preserve versioning, hierarchy, and campaign links. |
| Coordinator identity acceptance | Account-binding grant pattern | Separate role invitation acceptance from post-activation identity binding, or combine only through an explicitly reviewed transaction. |
| Volunteer identity | Approved Volunteer request in access manifest | Add normalized assignment/team record if responsibilities/hierarchy extend beyond role badge. |
| Referral qualification | GauPoints immutable verified referral edges | Add bounded count projection; do not use browser-derived leaderboard counts. |
| GauPoints/ranking | GauPoints read clients/panels | Surface owner/campaign aggregates without changing reward issuance. |
| Geography | Business OS canonical location services and persisted references | Add jurisdiction containment checks and role-coverage aggregates. |
| Atomic approval | Field Collection approval ADR, version/ledger/RPC patterns | Implement role-specific transaction and decision ledger. |
| Tabs | Supporter Dashboard keyboard tab pattern; `SectionTabs` styling | Create reusable accessible tabs with arrow/Home/End behavior and URL state. |
| Coordinator drill-down | Coordinator Network directory/tree/360 profile | Link from Command Center with filters/context. |
| Existing analytics | Growth Dashboard, Reports, Movement CRM | Link/compose summaries; do not copy their full panels into Command Center. |
| Notifications | Participation email receipt queue and Engagement provider settings | Add role-notification outbox/templates/delivery history. |
| Audit UI | Activity tab and Coordinator activity timeline | Add typed role events and authorized detail. |
| Localization | Existing `useTranslation` and locale parity tests | Add complete role/queue/command-center namespaces in EN/HI/OD. |

## 16. File-by-file implementation plan (requires explicit approval)

The sequence below is intentionally backend-first. Existing protected files identified by the Coordinator Regression Fence require a stop-and-review before editing.

### Phase 0 — Decisions and contracts

- `docs/ROLE_APPLICATION_APPROVAL_COMMAND_CENTER_READ_ONLY_AUDIT.md`: approve decisions in section 18.
- New ADR: canonical role request, eligibility, decision, assignment, and notification transaction.
- Update Coordinator Production Plan/Regression Fence only after agreement on how Volunteer assignment integrates with Coordinator Network.

### Phase 1 — Forward-only canonical backend

- New migration, e.g. `supabase/migrations/<timestamp>_role_workflow_v1.sql`:
  - Extend `voiceup_participation_requests`; do not create a parallel request table.
  - Add versioned role-policy tables.
  - Add invitation grants/acceptance evidence.
  - Add immutable request events/decision ledger and notification outbox.
  - Add Volunteer assignment/team hierarchy if approved.
  - Add indexes, least-privilege RLS, cursor projections, and aggregate functions.
- New versioned Edge Function or protected extension of an existing authenticated boundary for applicant/approver operations.
- Preserve existing platform-admin, workspace membership, resource assignment, and Coordinator binding contracts.

### Phase 2 — Domain adapters and tests

- `src/types.ts` (protected by impact): canonical status, initiation, eligibility, policy, queue list/detail, and operation result types.
- New `src/roles/` domain:
  - `types.ts`, `eligibility.ts`, `stateMachine.ts`, `api.ts`, `navigation.ts`, `metrics.ts`.
- `src/backend.ts` (protected): narrow typed adapters only.
- `src/accountAccess.ts`: parse owner progression projection; never infer authority client-side.
- New database/RLS/contract tests for every deny and concurrency rule.

### Phase 3 — Applicant workflow

- `src/pages/SupporterDashboardV2.tsx` (current owner dashboard): My Role & Progression, owned invitations, missing requirements, actions, history, leader/hierarchy summary, GauPoints/rank.
- `src/pages/PublicCampaignPage.tsx` (**protected**): compatibility-safe move from post-sign direct request forms to server progression/action rules.
- `src/i18n/locales/en.json`, `hi.json`, `or.json`: exact parity.
- Styles in existing scoped files only after responsive/accessibility review.

### Phase 4 — Approval queue and invitation operations

- New `src/pages/app/RoleApprovalQueueTab.tsx` and role-domain components:
  - queue tabs/counters, filters, cursor pagination, details, evidence, decisions, reassignment, notification history.
- `src/pages/app/CoordinatorNetworkTab.tsx`: invite actions and approved Coordinator handoff, without duplicating the queue.
- `src/pages/app/MovementCrmTab.tsx`: Volunteer directory/team assignment consumption, replacing provider-ready estimates.
- `src/layouts/AppShell.tsx` (**protected**): navigation wiring and entitlement checks only after backend availability.

### Phase 5 — Tabbed Command Center

- Refactor `src/pages/app/CommandCenterTab.tsx` into a lightweight tab shell.
- New `src/pages/app/command-center/` panels for the 12 tabs, each fed by server aggregates or existing module adapters.
- Reuse/enhance `src/ui/SectionTabs.tsx` with keyboard behavior, URL state, mobile overflow, and lazy panel rendering.
- `src/pages/app/GrowthDashboardTab.tsx`, `ReportsTab.tsx`, `MovementCrmTab.tsx`, `CoordinatorNetworkTab.tsx`, `EngagementTab.tsx`, and `ActivityTab.tsx`: accept typed inbound filters; do not duplicate content.

### Phase 6 — Operational hardening

- Provider-backed role notifications and reminders.
- Query plans and indexes at realistic volume.
- Sensitive export audit/formula escaping.
- Observability, rate limits, retention, and recovery runbook.
- Preview validation before any production migration or deployment.

## 17. Regression test matrix

| # | Scenario | Current coverage | Required implementation assertion |
|---:|---|---|---|
| 1 | Eligible Volunteer self-application | Partial submission only | Meets every versioned requirement; creates one pending-approval request. |
| 2 | Ineligible Volunteer self-application | Missing | Returns missing/progress; creates no approvable request. |
| 3 | Eligible Coordinator self-application | Partial submission only | Requires active Volunteer plus qualified direct Volunteers and jurisdiction. |
| 4 | Ineligible Coordinator self-application | Missing | No Coordinator permissions/request approval entry. |
| 5 | Leader-initiated Volunteer invitation | Missing | Authority/scope checked; invite pending acceptance; no referral threshold. |
| 6 | Authorized Coordinator invitation | Missing | Explicit policy capability and jurisdiction required. |
| 7 | Invitation without referral threshold | Missing | Counts bypassed; identity/account/profile/approval still required. |
| 8 | Invitation accept/decline | Binding-grant pattern only | Single-use owner-bound accept; decline terminal/audited; replay denied. |
| 9 | Volunteer attempts Coordinator approval | Implicitly impossible today | Explicit server `not_authorized`; immutable denial telemetry without leaking request. |
| 10 | Unauthorized Coordinator approval | Missing | Deny equal/lower rank, missing capability, wrong campaign/geography. |
| 11 | Applicant self-approval | Missing | Server denies even if applicant also holds another role unless an explicit reviewed policy says otherwise; recommended unconditional deny. |
| 12 | Duplicate applications | Existing active unique index | Cover self/invitation collision, retry, terminal reapplication, concurrent insert. |
| 13 | Concurrent approvals | Missing | One decision/assignment commits; safe retry returns original; stale actor receives conflict. |
| 14 | Approval after eligibility change | Missing | Recheck fails with stale eligibility and no role assignment. |
| 15 | Role assignment after approval | Missing | Decision and assignment atomic; manifest/network reflect result. |
| 16 | Rejection and reapplication | Schema permits after rejection | Reason required; history retained; policy cooldown enforced if configured. |
| 17 | Jurisdiction-restricted approval | Missing | Boundary/ancestor cases, unknown geography, canonical reference mismatch. |
| 18 | Approval audit history | Submission-only audit | Append-only ordered events, actor/authority/reason/version hashes, read authorization. |
| 19 | Command Center KPI accuracy | Existing unrelated metrics | Reconcile every role KPI to source queries; unknown/not-instrumented semantics. |
| 20 | Dashboard-to-queue drill-down | Missing | Typed filter/context, breadcrumb/back, authorization, empty/error/loading. |
| 21 | Hierarchy-to-profile drill-down | Coordinator-only exists | Add Volunteer/supporter nodes with privacy-safe profile projection. |
| 22 | Large dataset pagination | Missing for requests; Coordinator snapshot loads all | Cursor stability, bounded page, search/index plan, no full supporter load. |
| 23 | Mobile tab navigation | Partial | Scrollable tabs, arrow/Home/End keys, focus, lazy panels, 320px viewport. |
| 24 | EN/HI/OD translations | Existing request/coordinator parity | Exact new namespace parity and browser checks in all three languages. |
| 25 | Other campaign regression | Focused request tests exist | Non-GSAA campaign, disabled policy, public signing, reports, CRM, account routing. |
| 26 | Platform Admin authorization preservation | Existing tests | Role policy cannot mint/broaden platform role; current platform admin tests unchanged. |

Additional mandatory security tests: invite token wrong user/workspace/expiry/replay/revocation; raw-table access denial; PII projection; notification idempotency; request-info loop; reassign authority; cancellation/withdrawal; policy version rollover; Coordinator hierarchy cycle; assignment rollback; export limits; location unknowns; and audit immutability.

## 18. Required decisions and blockers

Implementation must not start until these decisions are approved:

1. **Canonical role taxonomy:** whether `coordinator` remains a request type with `preferred_level` or becomes explicit requested roles such as ward/block/district Coordinator.
2. **Mandatory profile definition:** fields per role/campaign, percentage formula, grandfathering, and policy version behavior.
3. **Identity standard:** phone OTP, confirmed email, optional document/KYC, verification expiry, and who may inspect evidence.
4. **Qualified referral definition:** same-campaign, claimed account, verified signature, uniqueness, status, and anti-fraud exclusions.
5. **Qualified Volunteer definition:** active role, direct reporting edge, geography, training/activity conditions, and how reassignment affects count.
6. **Coordinator invitation bypass:** recommended to bypass only numeric referral/Volunteer thresholds, not existing Volunteer, identity, profile, geography, consent, or approval.
7. **Inviter/approver separation:** whether a policy-authorized inviter may approve their own Volunteer invitation. Coordinator and senior roles should require independent approval by default.
8. **Role-to-Business-OS permissions:** approved Volunteer/Coordinator role must remain distinct from workspace membership. Define the explicit assignment, if any, required to open operational modules.
9. **Jurisdiction semantics:** canonical containment, campaign-wide authority, unknown geography, and boundary disputes.
10. **Approval levels/SLA:** number/order of approvals, due/expiry times, escalation and reassignment rules.
11. **Withdrawal/reapplication:** cooldowns, rejected-request edits versus new request, and history retention.
12. **Notification providers:** channels, consent, templates, sender configuration, reminder schedule, and failure ownership.
13. **Legacy migration:** handling of signer-embedded `coordinatorApplication` records and any manually created Coordinator `invited` records.
14. **Command Center funnel instrumentation:** whether to add server events for Visitor and Started. Until then, show those stages as unavailable, not zero.
15. **Data retention/privacy:** who can see applicant motivation, identity evidence, contact details, referrals, decisions, and exports; retention after rejection/expiry.

### Blocking dependencies

- Normalized Volunteer assignment/hierarchy is required for “three qualified Volunteers under hierarchy,” assigned leader, and unified organization tree.
- Versioned role-policy schema is required before configurable eligibility/approvers or truthful admin UI.
- Server aggregate/query contracts are required before role KPIs and drill-down charts.
- Explicit edit approval is required for protected surfaces in the Coordinator Regression Fence, especially `App.tsx`, `AppShell.tsx`, `backend.ts`, `PublicCampaignPage.tsx`, authorization code, and coordinator contracts.

## 19. Verification performed during this audit

Focused read-only test command:

```text
node --experimental-strip-types --test
  tests/participationRequests.test.mjs
  tests/participationLocationResourceScopeFix.test.mjs
  tests/coordinatorNetwork.test.mjs
  tests/coordinatorAccountBinding.test.mjs
  tests/accountAccessExperience.test.mjs
  tests/participationRequestRead.test.mjs
  tests/premiumPostParticipation.test.mjs
  tests/gauPointDatabaseContracts.test.mjs
  tests/gauPointRegistrationTree.test.mjs
  tests/voiceupBusinessOsLocaleCompleteness.test.mjs
```

Result: **95 passed, 0 failed**.

This proves the inspected foundations behave as their current tests describe. It does not prove the missing role approval/invitation/eligibility/Command Center requirements, and it is not deployment approval.

## 20. Recommended implementation gate

After the decisions in section 18 are answered, approve a backend-first Phase 0/1 only. Require a reviewed ADR, threat model, final authority matrix, schema/RLS plan, migration rollback/forward-remediation plan, and failing security/contract tests before implementation. Do not begin with dashboard visuals; without authoritative eligibility, queue, and aggregate contracts, those visuals would be decorative or unsafe.

## 21. Master execution checklist — approved signing/authentication routing update

**Requirement authority:** product-owner update approved on 2026-11-18. This section is an amendment to the existing master execution; it does not restart or remove the role-application, approval, audit, notification, or graphical Command Center phases above.

### 21.1 Completed checkpoints

- [x] Existing GSAA, supporter identity, authentication, account claim, participation request, Coordinator Network, and Command Center foundations audited.
- [x] Fifteen role/approval policy decisions and their blocking dependencies documented in Section 18.
- [x] Stage-5 duplicate and refresh/idempotency defect traced through the current public-signing Edge/RPC path.
- [x] Signing security review completed, including anonymous enumeration, tenant/campaign isolation, replay, consent, and Coordinator Regression Fence constraints.
- [x] Product-owner authentication and signing-routing update incorporated without introducing a parallel signing or role engine.

### 21.2 Approved signing and authentication contract

- [x] Account authentication supports Google OAuth and non-Google email/password with optional Supabase Auth Email OTP.
- [x] Google authentication may occur before or after campaign signing and does not require an additional Email OTP.
- [x] Public campaign signing requires neither Email OTP, account creation, nor account activation.
- [x] Guest signing remains available through the existing six steps: Phone, Verify, Profile, Details, Review, Done.
- [x] No new signing-OTP infrastructure will be created. Existing account authentication and current public verification contracts remain separate.
- [x] SMS OTP remains disabled by default; any future campaign-admin option requires a separate policy/provider/authorization approval.
- [x] Existing canonical supporter identity, public-signing mutation, authenticated manifest, supporter routing, and account-claim services remain authoritative.
- [x] One canonical participation per supporter per campaign must cover both paper and online participation; retries and routing must not create a replacement signer.
- [x] Canonical location, campaign consent, referrals, GauPoints evidence, certificates, and existing role/permission boundaries are preserved.
- [x] Anonymous routing remains route-neutral. An unauthenticated duplicate result must not reveal signer identity, account existence, role, or private participation data.
- [x] Signing and account authentication never grant Volunteer, Coordinator, workspace, Campaign Admin, or Platform Admin authority.

### 21.3 Required Path A/B/C state machine

| Path | Entry | Required sequence | Authoritative decision source |
|---|---|---|---|
| A — New supporter | Guest or authenticated identity with no owned campaign participation | Sign once → optional account authentication/claim → complete missing profile fields → Supporter Action Center | Public signing result, claim grant, then account access manifest |
| B — Existing account | Google or non-Google login before signing | Load manifest → check owned participation for the exact campaign → sign only when absent → complete missing profile fields → Supporter Action Center | Auth session plus server account access manifest; never client role inference |
| C — Already signed | Existing paper/online participation or duplicate signing attempt | Do not add a second signature → offer login or account claim/activation → resolve ownership → complete missing profile fields → Supporter Action Center | Route-neutral precheck, authenticated routing resolver, canonical account claim, then manifest |

Path rules:

- Google-before-signing and Google-after-signing use the same manifest and account-claim contracts.
- Email/password and optional Auth Email OTP are equivalent account-authentication entries; neither is campaign-signing proof.
- A Google or email-authenticated user without an owned supporter record may still sign as a supporter, but their administrative or workspace identity must not be displayed as a Supporter or silently linked.
- Existing verified paper participation uses the historical claim path and is never replaced by an online signer.
- After ownership is established, server-returned missing-profile fields determine the next action. Completion routes to the existing Supporter Action Center/dashboard, not a duplicate campaign-specific account surface.

### 21.4 Dependency-ordered P1 signing/account execution

- [ ] **P1-A — Contract and regression delta (in progress):** focused Path A/B/C assertions were added without duplicating existing `campaignContextualLogin`, `existingSupporterRouting`, screen-signing, consent, and claim tests. The approved routing contract has one intentional failing assertion pending protected source remediation.
- [ ] **P1-B — Authentication routing integration:** make Google-before/after and non-Google login converge on the same exact-campaign manifest decision. Preserve guest entry and the six signing steps.
- [ ] **P1-C — Duplicate and paper/online convergence:** safely resolve same-campaign participation without anonymous identity disclosure, new signer creation, or metric/referral/GauPoints duplication.
- [ ] **P1-D — Account claim and profile progression:** reuse fresh-signing and historical claim grants; expose server-owned missing profile fields and route completed supporters to the Supporter Action Center.
- [ ] **P1-E — Focused automated regression:** run signing, routing, authentication, claim, consent, location, referral, GauPoints, certificate, role-permission, and Coordinator fence tests.
- [ ] **P1-F — Real-browser quality gate:** interact with the actual application for Google-before-signing, Google-after-signing, email/password, optional Auth Email OTP, guest signing, duplicate detection, fresh and historical account claim, profile completion, and Action Center routing. Record screenshots, console/network errors, and per-scenario PASS/FAIL. No browser PASS may be reported without an actual browser run.

### 21.5 Remaining master execution — unchanged

- [ ] Approve remaining Section 18 role-policy decisions and the canonical role-workflow ADR.
- [ ] Add the forward-only role-policy, invitation, eligibility, decision-ledger, assignment, notification, least-privilege RLS, and aggregate-query backend.
- [ ] Implement Volunteer and Coordinator eligibility, applications, invitations, approvals, reassignment, withdrawal, expiry, audit, and notification workflows.
- [ ] Implement applicant role/progression, hierarchy, referral, GauPoints, and decision-history surfaces in the Supporter Action Center.
- [ ] Implement the authorized approval queue and Coordinator Network handoff without a second Coordinator engine.
- [ ] Implement the tabbed graphical Campaign Command Center using authoritative aggregates and typed drill-down navigation.
- [ ] Complete EN/HI/OD, mobile, accessibility, concurrency, privacy, export, observability, retention, Preview, and production-approval gates.

### 21.6 Current phase and approval gate

**Current phase:** P1-A is the earliest unfinished phase. A focused baseline of 86 existing authentication, routing, claim, signing, consent, growth, and screen-verification tests passes. The new approved-routing contract has 5 passing assertions and 1 intentional failure: `PublicCampaignPage.tsx` constructs a `supporterSession` for any confirmed Auth identity and falls back to the name `"Supporter"` even when no exact supporter ownership/dashboard exists. This confirms the previously audited admin/unrelated-account display defect without reopening the broader audit.

**Next implementation action:** in the protected public campaign session projection, create a supporter session only from an exact manifest ownership plus verified owner dashboard; keep an authenticated but unowned Google/email identity neutral and leave the six-step guest-equivalent signing path available. Then rerun the 92 focused assertions before expanding to account-claim/profile routing.

**Protected surfaces required by the smallest runtime slice:**

- `src/pages/PublicCampaignPage.tsx`
- `src/components/CampaignInlineAuthPanel.tsx`
- `src/pages/VoiceupLoginPage.tsx`
- `src/accountAccess.ts`
- potentially `src/components/SupporterAccountClaimPanel.tsx` and the existing Supporter Action Center/dashboard adapter after the missing-profile projection is confirmed

`PublicCampaignPage.tsx`, authentication/session behavior, authorization routing, and public signing are protected by the Coordinator Regression Fence. The current branch/worktree also does not satisfy the fence's clean phase-baseline requirement. Stop before editing these files and obtain explicit protected-file scope and baseline authorization. No database migration or deployment belongs to P1-A/B unless the focused contract test proves an authoritative server projection is missing and a forward-only design is separately approved.
