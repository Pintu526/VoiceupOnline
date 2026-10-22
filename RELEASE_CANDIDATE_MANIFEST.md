# GSAA Release Candidate Manifest

- Candidate: `GSAA-RC-20261017-002158`
- Source worktree: `D:\VoiceupOnline-Clean-Path`
- Preservation backup: `D:\VoiceupOnline-Preservation\VoiceupOnline-Clean-Path_20261014-134833_IST`
- Source branch: `feat/lgd-location-master-2026-08-29`
- Source HEAD: `d55efd9090709a94ae971d87c823b6aa14b20a38`
- Intended target: Vercel Preview only
- Preview Supabase project: `ravweavcfrpiykfgtmbf`

## Included

- Application source under `src/`
- Runtime assets under `public/`
- Locked JavaScript dependency manifests (`package.json` and `package-lock.json`)
- TypeScript and Vite configuration
- Vercel configuration
- Tests under `tests/`
- Supabase migrations and Edge Functions, excluding local link/cache state
- Build and ingestion scripts under `scripts/`
- Documentation and the non-backup database schema baseline
- `deno.lock` and `.env.example`

## Excluded

- Git worktree metadata
- Local environment files and credentials
- `.vercel` and `supabase/.temp` local link state
- Existing `node_modules/` and `dist/`
- Temporary files and development logs
- Preservation/database backups
- Corrupted and pre-recovery source copies
- Raw LGD ingestion archives under `data/`
- Unused root-level generated media/artifacts

Dependencies must be restored with `npm ci`. Vercel Preview must inject the real Development environment values at deployment time; no credential is stored in this candidate.

## Candidate-only test corrections

- OTP contract assertions now validate the intentional normalized response extraction path used by `requestOtp`.
- Mobile layout assertions now validate the page-level language toolbar introduced by the current public campaign layout.
- Frozen migration tests now pin the SHA-256 of the migration bytes present at source HEAD.
- GSAA presentation, branding, canonical-location, and devotional-media assertions now describe the current approved behavior and assets.
- Live PostgreSQL catalog tests are explicit Development-only integration tests. They run only when `RUN_POSTGRES_DEVELOPMENT_INTEGRATION=true` and the linked project is `ravweavcfrpiykfgtmbf`; otherwise they report an intentional skip instead of requiring local Supabase link state.

## Candidate-only compiler corrections

- The browser catalog client now shares the request shape for the existing `resolve`/`search` union instead of narrowing that combined union to `never`.
- The generated 22 MB Odisha LGD snapshot is marked as generated data for TypeScript checking purposes, avoiding an unrepresentable inferred union. Its dataset integrity remains covered by runtime tests.

## Validation record

- Dependency restore: `npm ci --no-audit --no-fund` completed from `package-lock.json` (148 packages).
- Named OTP/mobile and GSAA regressions: 56 passed, 0 failed.
- Corrected release assertions: 67 passed, 0 failed, 4 Development PostgreSQL integration tests intentionally skipped.
- LGD client/dataset and hostname routing regressions: 37 passed, 0 failed.
- Full test command: passed.
- Typecheck: passed.
- Vite build: passed with `ravweavcfrpiykfgtmbf.supabase.co` and a non-secret placeholder anon key.
- Complete `npm run validate`: passed.

The generated validation bundle is not a deployable credential-bearing artifact. Vercel Preview must rebuild it with the real Preview-scoped Development anon key.
