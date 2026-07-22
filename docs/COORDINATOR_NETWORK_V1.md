# Coordinator Network V1

Coordinator Network is the workspace-scoped operating directory for verified coordinators. It stores geography ownership, reporting relationships, campaign assignments, referral attribution, status, private profile photos, and an immutable activity trail.

## Access model

| Workspace role | Read | Create/update/status/delete |
| --- | --- | --- |
| `platform_owner` | Yes | Yes |
| `workspace_admin` | Yes | Yes |
| `campaign_admin` | Yes | Yes |
| `field_officer` | Yes | No |
| `viewer` | Yes | No |
| Anonymous or another workspace | No | No |

The five coordinator tables expose authenticated `SELECT` through workspace-scoped RLS. They grant no direct authenticated insert, update, or delete access. Mutations use security-definer RPCs that re-check the authenticated user's active membership and workspace on the server.

## Data model

- `voiceup_coordinator_geographies`: normalized country-to-ward hierarchy.
- `voiceup_coordinators`: profile, role, status, reporting parent, verification, referral code, and optimistic-lock version.
- `voiceup_coordinator_campaigns`: active and historical campaign assignments.
- `voiceup_coordinator_referrals`: accepted and revoked coordinator referrals.
- `voiceup_coordinator_audit`: actor-attributed append-only activity records.

Active phone numbers and referral codes are unique inside a workspace. Reporting parents must belong to the same workspace, have a broader coordinator role, and cannot create a cycle. Campaign IDs are validated against the workspace's authoritative campaign data before assignment.

## Server operations

- `get_voiceup_coordinator_network(workspace_id)` returns one read snapshot for the dashboard, directory, filters, tree, profiles, referrals, and activity.
- `upsert_voiceup_coordinator(...)` atomically validates and writes the coordinator, geography chain, campaign links, referral, and audit records.
- `set_voiceup_coordinator_status(...)` enforces optimistic locking and requires mobile verification before activation.
- `delete_voiceup_coordinator(...)` performs an audited soft deletion and refuses deletion while direct reports remain assigned.
- `archive_voiceup_coordinator_geography(...)` archives only unused geography nodes.

## Mobile verification and photos

The existing `voiceup-otp` Edge Function accepts the purpose `coordinator-mobile` only for an authenticated platform owner or active workspace/campaign administrator. The returned verification proof is hashed, purpose-bound, workspace-bound, phone-bound, expiring, and consumed once by the upsert RPC.

Profile photos use the existing private `campaign-private` bucket under:

```text
{workspace_id}/coordinators/{coordinator_id}/profile-{timestamp}.{extension}
```

The browser accepts JPEG, PNG, or WebP up to 5 MB. Reads use short-lived signed URLs. The migration does not make the bucket public and does not add a storage policy.

## Release order

1. Apply all earlier repository migrations, including `20260720010000_field_collection_atomic_approval.sql`.
2. Apply `20260720020000_coordinator_network_v1.sql` to the intended non-production project.
3. Deploy the updated `voiceup-otp` Edge Function to that same project.
4. Deploy the application build.
5. Validate with a platform owner, a workspace/campaign administrator, a read-only member, and a different-workspace member.

Example commands after selecting the correct project explicitly:

```powershell
supabase link --project-ref <non-production-project-ref>
supabase db push
supabase functions deploy voiceup-otp
```

Never run these commands against Production as an implicit fallback when a Preview project is unavailable.

## Validation checklist

- Create an invited coordinator after verifying a valid Indian mobile number.
- Confirm a wrong, expired, reused, or differently scoped OTP proof is rejected.
- Edit the profile and confirm optimistic-lock conflicts fail safely.
- Assign geography, reporting parent, campaign, and referral; refresh and confirm persistence.
- Reject a same-level reporting parent, hierarchy cycle, cross-workspace campaign, or invalid referral.
- Activate only a mobile-verified coordinator; suspend and reactivate it.
- Search by name, mobile, email, referral, role, status, or geography and combine filters.
- Confirm the reporting tree and dashboard metrics reflect saved rows.
- Upload and open a private photo; confirm another workspace cannot read it.
- Confirm read-only roles cannot invoke mutations and anonymous users cannot read the network.
- Soft-delete only a coordinator without direct reports and confirm its audit remains visible.

## Rollback

Before Production, roll back by reverting the application and Edge Function deployments and applying a reviewed compensating migration. Because the feature tables contain user data and audit history, never drop them automatically. A safe forward remediation disables the navigation entitlement or revokes RPC execution while preserving all rows, then corrects the migration in a new transaction.

