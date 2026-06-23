# Voiceup Bharat

Voiceup Bharat is an India-focused campaign management SaaS MVP for NGOs, RWAs, associations, unions, and campaign agencies that need to create public campaigns, publish a signing page, collect supporter details, scan existing hard-copy signatures, route a campaign to the right authority, and download daily or weekly reports.

The app now starts as a clean workspace with no fake campaigns, no fake signers, and no preloaded authority records.

## What is included

- Campaign admin panel with title, goal, location, dates, required fields, consent text, and publish action
- Public campaign page for online signers
- Admin-published appeal/cause text that public signers accept instead of entering optional public comments
- Authority targeting for district, state, or country level appeals: District Collector, Chief Minister, or Prime Minister of India
- CSV upload for location masters using `state,district,block,panchayat,pin`
- CSV upload for authority masters using `level,state,district,position,name,address,email,phone`
- Campaign admin can enforce one selected authority or allow signers to choose from uploaded authority options
- Optional donation/support contribution section with caption, UPI ID, UPI QR image, payment instructions, and one-time/recurring labels
- Optional WhatsApp and Telegram contact fields for signers
- OTP verification workflow for signer phone numbers, ready for SMS/WhatsApp provider integration
- Individual signed appeal PDF download with signer details and selected authority details
- India location hierarchy with state, district, block/tehsil/taluk, and gram panchayat/ward fields
- True dependent dropdowns for district, block/tehsil/taluk, and gram panchayat/ward after state selection
- District dropdown coverage for every Indian state/UT, with fallback block and panchayat/ward choices when full official local-body data is not yet connected
- Campaign admin can add missing district, block/tehsil/taluk, and gram panchayat/ward values inline beside each dropdown with a `+` action; duplicates are blocked, any selected dropdown value can be hidden/deleted by the admin, and changes appear in the public signing page
- PIN-code lookup that can auto-fill PIN from selected geography, or auto-select geography from a known PIN
- Campaign banner upload with simple crop/zoom/focus controls and public campaign background display
- Campaign video URL, social share text, and same-domain `/c/campaign-slug` publishing path
- Public `/c/campaign-slug` links render only the public campaign signing page, without admin dashboard navigation
- Protected per-campaign admin `/admin/campaign-slug` links require campaign admin email/passcode before showing management, scanning, engagement, and reports for that campaign
- Public homepage at `/` with product description, feature overview, and call-to-action
- Protected SaaS workspace at `/app` with admin email/passcode gate
- Supabase Auth-compatible SaaS login foundation, with MVP passcode fallback
- Audit log and admin activity dashboard for important admin actions
- Production integration settings for Razorpay, WhatsApp, SMS, email, storage, and analytics providers
- Legal pages for privacy, terms, refund/cancellation, and data deletion
- Client-side SEO/social metadata updates for public campaign pages
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

## Make public links work across devices

The app supports Supabase-backed shared storage. Without Supabase environment variables, it falls back to browser local storage for preview only.

### 1. Create Supabase database

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run the SQL in `supabase-schema.sql`.

### 2. Add Vercel environment variables

In Vercel Project Settings -> Environment Variables, add:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_VOICEUP_WORKSPACE_ID=default
VITE_VOICEUP_APP_ADMIN_EMAIL=admin@voiceup.live
VITE_VOICEUP_APP_ADMIN_PASSCODE=change-this-passcode
VITE_RAZORPAY_KEY_ID=rzp_live_xxxxx
VITE_PUBLIC_ANALYTICS_KEY=optional-public-analytics-key
```

Then redeploy.

After this:

- Campaigns created on laptop are saved online
- `/c/campaign-slug` works from WhatsApp/mobile/other browsers
- `/admin/campaign-slug` can load the same campaign from another device
- Public signatures are collected in the shared Supabase workspace

## Live route structure

- `/` public product homepage
- `/app` protected SaaS admin workspace
- `/c/campaign-slug` public campaign signing page
- `/admin/campaign-slug` protected individual campaign admin page
- `/privacy`, `/terms`, `/refund`, `/data-deletion` legal pages

## Important production notes

This MVP can use Supabase shared storage for live public links. Before selling it as a real SaaS product, add:

- Secure authentication
- Replace MVP passcode gates with Supabase Auth/Clerk/Auth0 before real customer scale
- Tenant-isolated normalized backend database tables
- Role-based access control
- Payment/subscription integration
- Server-side OCR for large PDF or handwritten scan batches
- Privacy policy, consent records, audit logs, and legal review for signature validity
- A complete India Post PIN code master table or API for production-grade location auto-fill coverage
- A complete official district/block/panchayat master dataset for production-grade local-body dropdown accuracy
- WhatsApp Business API, SMS provider, and social publishing APIs for true automated bulk delivery
