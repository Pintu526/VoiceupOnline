# Voiceup Bharat Production Go-Live Runbook

This runbook is written for a non-technical founder/operator. Follow it in order. Do not skip the verification steps.

## Current safe launch position

Voiceup Bharat can be operated as a controlled live product if:

- `https://voiceup.live` opens the public homepage.
- `https://voiceup.live/app` requires SaaS admin login.
- Public campaign URLs such as `/c/campaign-slug` work on mobile and WhatsApp.
- Campaign admin URLs such as `/admin/campaign-slug` require campaign admin login.
- Supabase has a `voiceup_workspaces` row with campaign data.

## Phase 1: Immediate live hardening

### Step 1: Confirm Vercel environment variables

In Vercel -> Project -> Settings -> Environment Variables, confirm:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_VOICEUP_WORKSPACE_ID=default
VITE_VOICEUP_APP_ADMIN_EMAIL
VITE_VOICEUP_APP_ADMIN_PASSCODE
```

After any change, redeploy Vercel.

### Step 2: Use strong admin passcodes

Use a long passcode, for example:

```text
Voiceup@Live-2026-Strong!
```

Do not share the SaaS admin passcode with campaign customers. Campaign customers should use only their individual campaign admin URL and passcode.

### Step 3: Verify all public routes

Test these in normal browser, incognito, and mobile:

```text
https://voiceup.live/
https://voiceup.live/app
https://voiceup.live/c/<campaign-slug>
https://voiceup.live/admin/<campaign-slug>
```

Expected:

- `/` = public homepage
- `/app` = SaaS admin login
- `/c/...` = public signing only
- `/admin/...` = individual campaign admin login

### Step 4: Confirm Supabase data

In Supabase -> Table Editor -> `voiceup_workspaces`, confirm:

- Row exists with `id = default`
- `data.campaigns` is not empty after creating and publishing a campaign
- `data.signers` grows after public signups

### Step 5: Daily backup habit

Until normalized production tables are fully migrated, export the `voiceup_workspaces` row daily:

1. Supabase -> Table Editor -> `voiceup_workspaces`
2. Open row `default`
3. Copy/download `data`
4. Store backup in a dated file

Example:

```text
voiceup-backup-2026-06-26.json
```

## Phase 2: Real authentication and roles

Goal: replace MVP passcodes with proper Supabase Auth.

### Required roles

- Platform owner
- Organization owner
- Campaign admin
- Reviewer
- Viewer

### Implementation checklist

- Create Supabase Auth users for every admin.
- Store membership in `organization_members`.
- Enforce role permissions with Supabase RLS policies.
- Remove shared passcode login after Supabase Auth is tested.

Do not remove passcode login until Supabase Auth works for your own admin account.

## Phase 3: Database migration

Current live app uses `voiceup_workspaces` JSON for compatibility.

Production target tables:

- `organizations`
- `organization_members`
- `campaigns`
- `signers`
- `audit_logs`
- `subscriptions`
- `integration_settings`
- `media_assets`

Migration plan:

1. Keep current JSON workspace live.
2. Write migration from JSON to normalized tables.
3. Verify campaign pages load from normalized `campaigns`.
4. Verify signups insert into normalized `signers`.
5. Keep JSON backup for rollback.
6. After stable, stop writing to JSON.

## Phase 4: File storage

Move images and scans from app state to Supabase Storage.

Buckets:

```text
campaign-public
campaign-private
scan-documents
appeal-pdfs
```

Rules:

- Campaign banners and public QR images can be public.
- Scanned hard-copy forms must be private.
- Appeal PDFs should be private unless explicitly shared.

## Phase 5: Payments

Start simple:

- Manual UPI activation
- Admin marks subscription active manually

Then add:

- Razorpay Checkout
- Razorpay Subscriptions
- Webhooks for successful/failed payment
- Invoice/receipt storage

Do not rely only on frontend payment status. Payment verification must happen server-side.

## Phase 6: OTP and messaging

Current OTP is MVP/in-app.

Production OTP options:

- MSG91
- Gupshup
- Twilio
- AiSensy

Production requirements:

- OTP expiry
- Retry limit
- Abuse/rate limiting
- Delivery logs
- Fallback from WhatsApp to SMS

## Phase 7: WhatsApp/SMS/email engagement

Current app supports manual links.

Production automation requires:

- WhatsApp Business API provider
- SMS provider
- Email provider such as Resend/SendGrid/Amazon SES
- Approved message templates
- Opt-out handling
- Delivery status logs

## Phase 8: Legal and compliance

Before broad customer launch:

- Lawyer-reviewed privacy policy
- Terms of service
- Refund/cancellation policy
- Data deletion process
- Consent wording per campaign type
- Data retention policy

## Phase 9: Monitoring

Minimum monitoring:

- Vercel deployment alerts
- Supabase usage alerts
- Daily database backup
- Admin audit log review
- Error reporting later with Sentry/PostHog

## Final go-live checklist

Before announcing widely:

```text
[ ] / homepage works
[ ] /app login works
[ ] /c campaign link works on WhatsApp/mobile
[ ] /admin campaign login works
[ ] Supabase has campaign data
[ ] Public signup creates signer record
[ ] CSV upload works
[ ] PDF/CSV export works
[ ] Daily backup process is followed
[ ] Strong admin passcodes are set
[ ] Legal pages are published
```

## Recommended launch wording

Use confident but safe wording:

```text
Voiceup Bharat is live for early campaign organizations. We help you launch public appeals, collect verified support, manage campaign admins, and generate authority-ready reports.
```

Avoid claiming government/legal submission validity until legal review is complete.
