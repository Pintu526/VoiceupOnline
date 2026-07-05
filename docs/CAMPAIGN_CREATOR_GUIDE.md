# Voiceup Campaign Creator Guide

This guide is for campaign admins and operators creating public campaigns.

## Campaign Creation Options

Campaigns can be created through:

- Create new campaign.
- AI Campaign Copilot.
- Campaign Template Library.
- Clone existing campaign.

AI/template creation should create a new draft and should not overwrite existing campaigns.

## Campaign Studio Wizard

Campaign Studio is organized as a guided wizard:

1. Choose Template.
2. Campaign Details.
3. Location.
4. Authorities.
5. Supporter Form.
6. Media.
7. Review.
8. Publish.

Use Previous and Next to move through the wizard. Use Save to persist changes.

## Campaign Details

Complete:

- Title.
- Slug.
- Summary.
- Full description / appeal content.
- Category.
- Target signatures.
- Start and end dates.
- Campaign admin login details.

The slug controls public and campaign admin URLs. Do not rely on title for URLs.

## Location

Location may be controlled by SaaS geography governance.

If a state, district, block, or panchayat/ward is locked, it cannot be changed by the campaign admin.

Campaign admins may further restrict public signer location when appropriate.

## Authority Intelligence

Authority Intelligence helps recommend a responsible authority based on campaign category and location.

Campaign creators can:

- Accept suggested authority.
- Search authority directory.
- Add authority manually.
- Use secondary/CC authority planning UI.
- Upload authority CSV where supported/provider-ready.

Authority routing should prioritize locality where available.

## Supporter Form

Choose which public signer fields are required.

Only fields in required fields should show `*` and block submission.

Recommended minimal fields for new campaigns:

- Name.
- Phone.

Other fields may be optional depending on campaign needs.

## Media

Campaign media includes:

- Hero/banner image.
- Crop/zoom.
- Focus point.
- Mobile and desktop preview.
- Campaign video URL.
- Donation QR/media where enabled.

Use clear, specific campaign images where possible.

## Review And Publish

Review:

- Campaign quality score.
- Missing information.
- Authority readiness.
- Location completeness.
- Public URL preview.
- QR preview.

Save before publishing. Publishing should affect only the intended campaign.

## Campaign Links

Use the Campaign Links card:

- Public campaign URL: `/c/{slug}`
- Campaign admin URL: `/admin/{slug}`
- SaaS admin URL: `/admin`

Copy buttons should show copied feedback.
