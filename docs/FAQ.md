# Voiceup FAQ

## What is Voiceup?

Voiceup is a campaign and public movement operating system for creating campaigns, collecting supporters, routing petitions, digitizing paper signatures, managing volunteers, and monitoring operations.

## What is Campaign Studio?

Campaign Studio is the campaign creation and editing wizard. It manages campaign basics, location, authority routing, supporter form fields, media, review, and publish readiness.

## What is AI Campaign Copilot?

AI Campaign Copilot is a provider-ready AI-assisted drafting experience. It can generate campaign content from a simple idea using the mock/provider-ready foundation. It does not call a real AI provider unless one is explicitly integrated later.

## What is Authority Intelligence?

Authority Intelligence helps suggest the right authority for a campaign based on category and location. It includes a built-in authority directory and routing UI.

## What is Field Collection?

Field Collection helps digitize paper signatures through image OCR, manual correction, duplicate detection, review queues, and approval into supporter records.

## What is Movement CRM?

Movement CRM organizes supporters, volunteer readiness, segments, movement graph, timelines, referrals, volunteer operations, and movement health.

## What is Command Center?

Command Center is an operations room showing campaign health, geographic progress, risks, action board, authority readiness, communication readiness, and mission planning.

## Are SMS, WhatsApp, Email, IVR, Telegram, and Push active?

Bulk provider sending is provider-ready unless explicitly implemented. The Communication Hub provides planning UI, templates, previews, scheduling placeholders, and provider settings cards.

## Does Voiceup support public campaign pages?

Yes. Public campaign pages use:

```text
/c/{campaign.slug}
```

## What is the Campaign Admin URL?

Campaign admins use:

```text
/admin/{campaign.slug}
```

SaaS admins use:

```text
/admin
```

## Does the campaign title control the URL?

No. The slug field controls campaign URLs. Title is only display text.

## Can old campaigns continue working?

Yes. New fields should be optional where added, and existing campaigns should continue to load.

## What does provider-ready mean?

Provider-ready means the UI and architecture are prepared for future integration, but the app does not yet perform the real external action.

## Should API keys be entered in visible UI fields?

No. Real provider secrets should be stored server-side, such as in Vercel environment variables.
