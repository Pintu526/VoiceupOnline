# Voiceup Bharat

Voiceup Bharat is an India-focused campaign management SaaS MVP for NGOs, RWAs, associations, unions, and campaign agencies that need to create public campaigns, publish a signing page, collect supporter details, scan existing hard-copy signatures, route a campaign to the right authority, and download daily or weekly reports.

The app now starts as a clean workspace with no fake campaigns, no fake signers, and no preloaded authority records.

## What is included

- Campaign admin panel with title, goal, location, dates, required fields, consent text, and publish action
- Public campaign page for online signers
- India location hierarchy with state, district, block/tehsil/taluk, and gram panchayat/ward fields
- PIN-code lookup that can auto-fill PIN from selected geography, or auto-select geography from a known PIN
- Local duplicate detection by phone, email, and name
- Hard-copy scan upload with OCR through `tesseract.js`
- Manual review queue for scanned signer details
- Authority routing rules by category, location keyword, and postal prefix
- Daily and weekly campaign status reports
- State-wise, district-wise, block-wise, and panchayat/ward-wise campaign performance counts
- PDF and CSV report downloads
- SaaS organization settings for INR subscription plan, billing details, limits, branding, owner email, and custom domain
- Suggested next features and production-readiness checklist

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Compile for production

```bash
npm run build
```

The production-ready static files are generated in `dist/`.

## Preview the production build

```bash
npm run preview
```

## Publish/deploy

This MVP builds as a static web app and can be deployed to:

- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront
- Any static hosting server

Recommended settings:

- Build command: `npm run build`
- Output directory: `dist`

## Important production notes

This first version stores data in browser local storage so the workflow can be tested without a server. Before selling it as a real SaaS product, add:

- Secure authentication
- Tenant-isolated backend database
- Role-based access control
- Payment/subscription integration
- Server-side OCR for large PDF or handwritten scan batches
- Privacy policy, consent records, audit logs, and legal review for signature validity
- A complete India Post PIN code master table or API for production-grade location auto-fill coverage
