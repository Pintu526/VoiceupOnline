# Atomic public participation rollback

Deployment order:

1. Apply `20260724010000_atomic_public_participation.sql`.
2. Verify the service-role RPC independently.
3. Deploy `voiceup-public-signing`.
4. Verify legacy public signing and Coordinator Network approval.
5. Deploy the client.

Rollback is forward-safe:

1. Roll the client back first. The unused RPC is harmless and remains service-role-only.
2. Roll the Edge Function back only if legacy unlocked public writes are explicitly accepted for the incident window.
3. Do not reverse or edit the applied migration. Keep the function for compatibility and deploy a new additive migration for any database correction.

The RPC locks one `voiceup_workspaces` row for each participation mutation. This is an accepted temporary scaling constraint. A two-second lock timeout returns a retryable response, and clients must retry with the same idempotency key.
