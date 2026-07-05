# Voiceup Admin Guide

This guide is for SaaS admins, organization admins, and operators responsible for workspace configuration.

## SaaS Admin Entry

Open SaaS Admin at:

```text
/admin
```

Use this area for organization setup, location governance, workspace management, usage, recharge packages, integrations, and subscription controls.

## Organization Workspace

Use the Organization tab to manage:

- Workspace profile.
- Owner email.
- Billing email.
- Subscription plan and status.
- Trial end date.
- Team seat count.
- Monthly signature, scan, and message limits.
- Custom domain.
- Payment reference.
- Custom branding toggle.

The Workspace Management panel provides:

- Logo/banner preview.
- Team members placeholder.
- Roles/permissions placeholder.
- Audit log placeholder.
- Billing/subscription summary.
- White-label readiness.

## Geography Governance

SaaS admins can restrict where campaign admins may configure campaigns.

Available lock levels:

- None.
- State.
- District.
- Block.
- Panchayat/Ward.

When a lock is active, Campaign Studio should show locked badges and prevent campaign admins from changing locked geography.

## Integration Readiness

The Integrations tab prepares providers without enabling sending by default.

Provider areas:

- AI: OpenAI, Gemini, Claude, Azure OpenAI, OpenRouter, Local LLM.
- Messaging: SMS, WhatsApp Business, Email, IVR.
- Payment/donation readiness.
- File storage readiness.
- Analytics provider references.

Provider statuses:

- Not configured.
- Test mode.
- Ready.
- Error.

Test connection buttons are placeholders unless a provider has been explicitly implemented elsewhere.

## Usage And Billing

Use Usage & Subscription to review:

- Subscription status.
- Active campaigns.
- Monthly signers.
- Monthly scans.
- Message credits.
- Bonus signature, scan, and message credits.

Recharge Packages can be used for manual operations. Apply credits only after external payment confirmation.

## Audit And Safety

The Activity tab shows audit activity such as campaign changes, scan approval, signer status updates, integration updates, and location changes.

Before production demos:

- Run the regression checklist.
- Confirm `/admin`, `/admin/{slug}`, and `/c/{slug}` behave correctly.
- Confirm custom location values persist after refresh.
- Confirm build passes locally and on Vercel.
