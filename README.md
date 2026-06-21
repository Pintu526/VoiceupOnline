# Voiceup Bharat

Voiceup Bharat is an India-focused campaign management SaaS MVP for NGOs, RWAs, associations, unions, and campaign agencies that need to create public campaigns, publish a signing page, collect supporter details, scan existing hard-copy signatures, route a campaign to the right authority, and download daily or weekly reports.

The app now starts as a clean workspace with no fake campaigns, no fake signers, and no preloaded authority records.

## What is included

- Campaign admin panel with title, goal, location, dates, required fields, consent text, and publish action
- Public campaign page for online signers
- Admin-published appeal/cause text that public signers accept instead of entering optional public comments
- Authority targeting for district, state, or country level appeals: District Collector, Chief Minister, or Prime Minister of India
- India location hierarchy with state, district, block/tehsil/taluk, and gram panchayat/ward fields
- True dependent dropdowns for district, block/tehsil/taluk, and gram panchayat/ward after state selection
- District dropdown coverage for every Indian state/UT, with fallback block and panchayat/ward choices when full official local-body data is not yet connected
- Campaign admin can add missing district, block/tehsil/taluk, and gram panchayat/ward values inline beside each dropdown with a `+` action; duplicates are blocked, any selected dropdown value can be hidden/deleted by the admin, and changes appear in the public signing page
- PIN-code lookup that can auto-fill PIN from selected geography, or auto-select geography from a known PIN
- Campaign banner upload with simple crop/zoom/focus controls and public campaign background display
- Campaign video URL, social share text, and same-domain `/c/campaign-slug` publishing path
- Public `/c/campaign-slug` links render only the public campaign signing page, without admin dashboard navigation
- Protected per-campaign admin `/admin/campaign-slug` links require campaign admin email/passcode before showing management, scanning, engagement, and reports for that campaign
- Local duplicate detection by phone, email, and name
- Hard-copy scan upload with OCR through `tesseract.js`
- Manual review queue for scanned signer details
- Authority routing rules by category, location keyword, and postal prefix
- Daily and weekly campaign status reports
- State-wise, district-wise, block-wise, and panchayat/ward-wise campaign performance counts
- PDF and CSV report downloads
- WhatsApp/SMS thank-you actions after signup and admin engagement tools for participant progress updates
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
- A complete official district/block/panchayat master dataset for production-grade local-body dropdown accuracy
- WhatsApp Business API, SMS provider, and social publishing APIs for true automated bulk delivery
