# Coordinator Management Production Plan

## Locked delivery rules

- Deliver one phase at a time on `feature/coordinator-world-class-v1`.
- Coordinator Network remains authoritative; do not create a second coordinator engine.
- Preserve current RPC names, coordinator contracts, CRUD, OTP, hierarchy, campaign links, RLS, and audit behavior.
- Never edit `20260720020000_coordinator_network_v1.sql`; database changes require a reviewed forward migration.
- Run `scripts/coordinator-check.ps1`, complete the browser acceptance checklist, commit, and tag before starting the next phase.
- Stop and report before touching a protected file.

## Phase 1 — Mobile-first UX shell and navigation

- **User outcome:** Coordinators and administrators can reach every existing Coordinator Network view comfortably on desktop and 360/390 px mobile screens, with predictable back navigation and reachable actions.
- **Files likely to change:** `src/pages/app/CoordinatorNetworkTab.tsx`, coordinator-only components under `src/coordinators/` or `src/pages/app/coordinator/`, coordinator CSS, coordinator tests.
- **Backend/database impact:** None.
- **Regression risks:** Workspace tab gating, campaign-admin navigation, lost form state, horizontal overflow, inaccessible touch targets.
- **Acceptance criteria:** Existing dashboard, directory, profile, form, tree, and activity workflows remain available; no horizontal scrolling; 44 px controls; mobile tree fallback; clear loading/empty/error states.
- **Required validation:** Coordinator checker plus all Desktop, Mobile, and Regression checks in `COORDINATOR-BROWSER-ACCEPTANCE.md`.
- **Commit/tag:** `feat(coordinator): phase 1 mobile ux shell` / `coordinator-v1-phase-1`.

## Phase 2 — Coordinator Command Center

- **User outcome:** Managers see authoritative priorities, coverage, pending actions, and coordinator status from one operational view.
- **Files likely to change:** Coordinator page/components, `src/coordinators/network.ts`, coordinator tests; additive coordinator service/RPC files only if client aggregation is insufficient.
- **Backend/database impact:** Prefer none; any scalable query must be a versioned RPC or forward migration without changing current contracts.
- **Regression risks:** Metrics diverging from persisted data, duplicate Movement CRM calculations, expensive full-snapshot processing.
- **Acceptance criteria:** Metrics reconcile to Coordinator Network records; filters drill into the same authoritative directory; no mock values or duplicate coordinator state.
- **Required validation:** Checker, metric unit tests, manager/read-only browser checks, reconciliation against known Preview rows.
- **Commit/tag:** `feat(coordinator): phase 2 command center` / `coordinator-v1-phase-2`.

## Phase 3 — Coordinator profile experience

- **User outcome:** Operators can review a coordinator's verified identity, geography, reporting line, campaigns, referral, status, photo, and activity in one mobile-friendly profile.
- **Files likely to change:** Coordinator profile components, coordinator types/view models, coordinator tests; additive photo/profile service only if required.
- **Backend/database impact:** None unless a versioned read projection is required; do not change existing snapshot fields.
- **Regression risks:** PII exposure, signed-photo access, stale optimistic-lock versions, edit/profile state divergence.
- **Acceptance criteria:** Profile opens from directory and tree, respects `canManage`, masks or omits fields by approved policy, and preserves existing edit/status/photo behavior.
- **Required validation:** Checker, profile permission tests, signed-photo Preview test, desktop/mobile browser checks.
- **Commit/tag:** `feat(coordinator): phase 3 profile experience` / `coordinator-v1-phase-3`.

## Phase 4 — Invitation and onboarding workflow

- **User outcome:** An authorized manager can invite a coordinator, track acceptance, link the authenticated identity, and complete verified onboarding without weakening current OTP rules.
- **Files likely to change:** New coordinator onboarding components/services/tests, a new Edge Function or versioned endpoint, and forward migrations.
- **Backend/database impact:** Forward-only identity/invitation records and versioned APIs; preserve `coordinator-mobile` and unrelated OTP purposes.
- **Regression risks:** Account takeover, cross-workspace invitation use, replay, PII leakage, auth/session regression.
- **Acceptance criteria:** Invitations are expiring, single-use, workspace-bound, auditable, revocable, and link the intended coordinator/auth user only.
- **Required validation:** Checker, database/RLS/API tests, replay and wrong-workspace tests, browser acceptance for invite/send/accept/expire/revoke.
- **Commit/tag:** `feat(coordinator): phase 4 invitation onboarding` / `coordinator-v1-phase-4`.

## Phase 5 — Volunteer/team assignment

- **User outcome:** Managers create teams and assign volunteers, coordinators, campaigns, geography, targets, and responsibilities using Coordinator Network as authority.
- **Files likely to change:** New coordinator team domain/components/services/tests, Movement CRM consumption adapter, forward migrations.
- **Backend/database impact:** New normalized team/assignment tables, RLS, indexes, audit, and versioned RPCs; no duplicate coordinator table or engine.
- **Regression risks:** Cross-workspace assignment, hierarchy bypass, duplicated Movement CRM state, destructive reassignment.
- **Acceptance criteria:** Assignments are workspace-scoped, permissioned, auditable, conflict-safe, and visible consistently from Coordinator Network and Movement CRM.
- **Required validation:** Checker, RLS/RPC/concurrency tests, authoritative-data reconciliation, desktop/mobile assignment scenarios.
- **Commit/tag:** `feat(coordinator): phase 5 volunteer team assignment` / `coordinator-v1-phase-5`.

## Phase 6 — Performance and recognition

- **User outcome:** Managers can evaluate agreed coordinator/team outcomes and recognition using persisted operational data, not estimates.
- **Files likely to change:** Coordinator analytics components/domain/tests and additive read services or versioned RPCs.
- **Backend/database impact:** Prefer derived queries; forward-only aggregates/events if necessary, with documented definitions and indexes.
- **Regression risks:** Incorrect attribution, gaming, privacy concerns, expensive queries, metrics diverging from campaign/Field Collection facts.
- **Acceptance criteria:** Every metric has a definition, source, time window, permission rule, empty state, and reconciliation test; recognition never changes approval data.
- **Required validation:** Checker, metric fixtures, query plans at realistic volume, role-based browser checks.
- **Commit/tag:** `feat(coordinator): phase 6 performance recognition` / `coordinator-v1-phase-6`.

## Phase 7 — Communication hub

- **User outcome:** Authorized users communicate with consented coordinator/team audiences through configured providers with delivery visibility and opt-out protection.
- **Files likely to change:** New coordinator communication components/services/tests and provider-specific Edge Functions; shared communication modules only after fence review.
- **Backend/database impact:** Forward-only audience, consent, template, delivery, and audit records; no change to unrelated OTP behavior.
- **Regression risks:** Unconsented messaging, wrong audience, provider retries, duplicate sends, exposed phone/email data.
- **Acceptance criteria:** Consent, authorization, template approval, idempotency, opt-out, provider failure, and delivery audit are enforced server-side.
- **Required validation:** Checker, provider-disabled tests, idempotency/consent/RLS tests, Preview sandbox delivery, browser acceptance.
- **Commit/tag:** `feat(coordinator): phase 7 communication hub` / `coordinator-v1-phase-7`.

## Phase 8 — Reports and exports

- **User outcome:** Authorized users export accurate coordinator rosters, hierarchy, coverage, assignments, performance, and audit reports with appropriate PII controls.
- **Files likely to change:** Coordinator report components/export services/tests and versioned report RPCs if required.
- **Backend/database impact:** Read-only versioned queries or export jobs; indexes via forward migration only.
- **Regression risks:** PII leakage, spreadsheet injection, stale totals, unbounded exports, Reports module regression.
- **Acceptance criteria:** Exports match active filters and authoritative totals, enforce role-based fields, escape formulas, handle empty/large data, and record sensitive exports.
- **Required validation:** Checker, golden export tests, permission/size tests, desktop/mobile download checks.
- **Commit/tag:** `feat(coordinator): phase 8 reports exports` / `coordinator-v1-phase-8`.

## Phase 9 — Security, performance, accessibility and production deployment

- **User outcome:** Coordinator Management is secure, responsive, accessible, observable, reversible, and validated in Production without regressions.
- **Files likely to change:** Coordinator-only hardening/tests/docs, new forward migrations, deployment configuration; protected files only after explicit stop-and-review approval.
- **Backend/database impact:** Reviewed least-privilege, pagination/index, retention, observability, and forward-remediation changes only.
- **Regression risks:** RLS or entitlement widening, PII exposure, migration lock/load, accessibility regression, deployment to the wrong project.
- **Acceptance criteria:** Threat review closed; RLS matrix passes; realistic-volume performance meets agreed budgets; WCAG checks pass; Preview acceptance is signed off; migration/Edge/app release and rollback steps are verified; Production smoke tests pass.
- **Required validation:** Checker, full automated suite, database/RLS/integration/load/accessibility tests, complete browser checklist in Preview, controlled Production deployment and smoke test.
- **Commit/tag:** `chore(coordinator): phase 9 production hardening` / `coordinator-v1-production`.
