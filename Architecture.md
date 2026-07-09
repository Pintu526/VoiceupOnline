# Voiceup Architecture

## Runtime

Voiceup is a Vite, React, and TypeScript single-page application. The browser entry point is `src/main.tsx`, which mounts `src/App.tsx` inside `ErrorBoundary`.

The application does not currently use React Router. Routing is handled by small route helper functions in `src/utils/routing.ts` and conditional rendering inside `src/App.tsx`.

## Route Map

- `/` renders the public marketing landing page.
- `/start` renders the public marketing page with campaign onboarding opened.
- `/app` renders the customer campaign workspace after workspace authentication.
- `/admin` renders the platform administration area after platform admin authentication.
- `/admin/:slug` renders campaign-level administration after campaign admin authentication.
- `/c/:slug` renders a public campaign signing page.
- `/privacy`, `/terms`, `/refund`, and `/data-deletion` render legal pages.

Vercel rewrites all paths to `index.html`, allowing the SPA route helpers to handle deep links.

## State Management

The app uses local React state and `usePersistentState` for browser-local persistence. Persistent keys are prefixed from `src/constants/index.ts`.

When Supabase environment variables are configured, `src/backend.ts` loads and saves one JSON workspace record in the `voiceup_workspaces` table. The app does not currently use normalized Supabase tables for every entity.

## Authentication

Current authentication is MVP-level:

- Platform admin auth uses Supabase Auth when Supabase is configured.
- Otherwise platform admin auth uses `VITE_VOICEUP_APP_ADMIN_EMAIL` and `VITE_VOICEUP_APP_ADMIN_PASSCODE`.
- Customer workspace auth is created after public OTP onboarding and stored in session storage.
- Campaign admin auth uses campaign-specific admin email/passcode stored on the campaign record.

This is sufficient for first controlled deployment, but production should replace MVP passcode gates with durable Supabase Auth policies.

## Main Domains

- Public marketing and onboarding: `src/pages/MarketingHomePage.tsx`, `src/pages/OnboardingWizard.tsx`.
- Public campaign signing: `src/pages/PublicCampaignPage.tsx`.
- Customer/platform workspace shell: `src/layouts/AppShell.tsx`.
- Campaign workspace tabs: `src/pages/app/*`.
- Shared domain utilities: `src/utils/*`, `src/lib.ts`, `src/data.ts`, `src/types.ts`.

## Payments and Messaging

Payment, SMS, WhatsApp, email, analytics, and storage integrations are provider-ready placeholders unless the related provider configuration exists. The app does not process real payments.

