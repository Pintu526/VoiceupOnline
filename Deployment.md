# Deployment

## Target

The project is configured for Vercel as a Vite single-page application.

## Build

```bash
npm install
npm run build
```

The build command runs:

```bash
tsc --noEmit && vite build
```

Build output is written to `dist`.

## Vercel Configuration

`vercel.json` contains:

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- rewrite from `/(.*)` to `/index.html`

The rewrite is required so deep links such as `/start`, `/app`, `/admin`, and `/c/:slug` load the SPA.

## Local Verification

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Verify:

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/start`
- `http://127.0.0.1:5173/app`
- `http://127.0.0.1:5173/admin`

## Deployment Notes

- Configure production environment variables in Vercel before deploying.
- Do not commit local `.env` values.
- Supabase is optional for local preview but required for cross-device shared campaign data.
- Real payment processing is not implemented.
- Provider-ready SMS, WhatsApp, and email messages do not send unless integrated later.

