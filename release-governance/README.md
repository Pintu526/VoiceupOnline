# Development release guard

Run from the repository root with explicit Development environment variables:

    node scripts/release-guard/validate-development.mjs --mode release --expected-branch <branch> --expected-commit <sha> --manifest <output.json>

The guard never deploys or writes to Git, Supabase, Vercel, or GitHub. It writes only the requested local manifest.
It exits nonzero on a failed, blocked, or unknown mandatory check.

Evidence rules:

- Migration evidence is blocked unless authoritative remote history is available.
- Edge evidence must match ACTIVE status, JWT enforcement, exact bundle hashes, and downloaded source-file hashes.
- Vercel Preview evidence must be tied to an exact source revision; a READY deployment alone is insufficient.
- Release and Production modes require explicit deployment authorization.
- Pull-request mode reports deployment authorization as not yet enforced instead of granting deployment authority.
