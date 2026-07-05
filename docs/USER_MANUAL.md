# Voiceup User Manual

Voiceup is a public movement operating system for creating campaigns, collecting supporters, routing petitions to authorities, managing field collection, and coordinating movement operations.

## Main Modules

- Dashboard: quick workspace overview, campaign status, and onboarding prompts.
- Campaign Studio: create, edit, review, and publish campaigns.
- AI Campaign Copilot: turn a campaign idea into a draft campaign.
- Authority Intelligence: suggest and manage authorities for campaign routing.
- Public Signing Page: supporter-facing campaign page and signature form.
- Field Collection: digitize paper sheets through OCR review and manual entry.
- Movement CRM: supporter profiles, volunteer readiness, segments, and movement graph.
- Command Center: operational overview and prioritized action board.
- Reports: exports, supporter register, growth trends, and analytics.
- Engagement: provider-ready Communication Hub for messages and sharing.
- SaaS Admin: organization, geography governance, integrations, usage, and workspace management.

## Basic Workflow

1. Configure the organization workspace in SaaS Admin.
2. Set geography governance if campaigns must be limited to a state, district, block, or panchayat/ward.
3. Create a campaign in Campaign Studio using AI Copilot, a template, or manual entry.
4. Select location, authority routing, supporter form fields, and media.
5. Review the campaign quality score and publish readiness.
6. Save and publish the campaign using the existing save/publish buttons.
7. Share the public campaign URL or QR with supporters.
8. Monitor supporters, field collection, reports, and Command Center tasks.

## Important URL Types

- SaaS Admin: `/admin`
- Campaign Admin: `/admin/{campaign.slug}`
- Public Campaign: `/c/{campaign.slug}`

The campaign slug is the source of truth for campaign URLs. Campaign title is display text only.

## Provider-Ready Areas

Some features are designed as UI foundations and do not perform real provider actions yet:

- Bulk SMS, WhatsApp Business, Email, IVR, Telegram, Push.
- AI provider API integrations.
- Payment/donation provider automation.
- File storage provider setup beyond existing app behavior.
- Volunteer attendance persistence.
- Referral tracking and invite tree.
- Automated backup/export jobs.

Provider-ready means the product has the planning surface, but no real external provider call is made from that UI.

## Safety Notes

- Save is required before draft campaign changes persist.
- Publishing is a separate action from saving.
- Archive is not delete; it closes a campaign and keeps it in the workspace.
- Existing public campaign URLs should continue to work after updates.
- Do not place private API secrets in visible UI fields. Use server-side environment variables for real provider secrets.
