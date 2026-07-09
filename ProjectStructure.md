# Project Structure

## Root

- `index.html`: Vite HTML shell.
- `vite.config.ts`: Vite configuration with React and Tailwind plugins.
- `vercel.json`: Vercel build command, output directory, and SPA fallback rewrite.
- `package.json`: scripts and dependencies.
- `supabase-schema.sql`: current Supabase workspace schema.
- `docs/`: existing product and operations documentation.

## Source

- `src/main.tsx`: React root mount.
- `src/App.tsx`: route selection, top-level state, persistence, auth handling, and cross-feature handlers.
- `src/types.ts`: shared domain types.
- `src/data.ts`: initial workspace data, subscription plans, packages, and integration defaults.
- `src/styles.css`: global styles, layout, app UI, public pages, and onboarding.

## Pages

- `src/pages/MarketingHomePage.tsx`: public landing page.
- `src/pages/OnboardingWizard.tsx`: campaign onboarding wizard.
- `src/pages/PublicCampaignPage.tsx`: public campaign signing page.
- `src/pages/SaasAppLoginPage.tsx`: platform/customer workspace login gate.
- `src/pages/CampaignAdminLoginPage.tsx`: campaign admin login gate.
- `src/pages/LegalPage.tsx`: legal pages.
- `src/pages/app/*`: authenticated workspace tabs.

## Components and UI

- `src/layouts/AppShell.tsx`: authenticated workspace shell.
- `src/components/*`: reusable app components.
- `src/ui/*`: small UI primitives.

## Utilities

- `src/utils/routing.ts`: manual route helpers.
- `src/utils/auth.ts`: current MVP auth/session helpers.
- `src/utils/campaign.ts`: campaign domain utilities.
- `src/utils/subscription.ts`: plan, usage, pricing, and limit rules.
- `src/utils/referrals.ts`: referral links, QR rendering, and poster export.
- `src/utils/seo.ts`: document title and metadata helpers.
- `src/backend.ts`: Supabase state, auth, and storage adapter.

## Removed During Stabilization

- `src/components/LandingPage.tsx`: removed because it was an unreferenced duplicate old landing page.

