# Voiceup Regression Checklist

Use this checklist before customer demos, production releases, and Vercel deployments.

## Preflight

- [ ] Confirm `.env` and `.env.txt` do not contain secrets intended for screenshots or demos.
- [ ] Confirm the working app opens without console errors.
- [ ] Confirm `npm run build` passes before deployment.
- [ ] Confirm existing campaigns still load.
- [ ] Confirm no test/demo campaign was auto-published.
- [ ] Confirm no public URL changed unexpectedly.

## SaaS Admin

- [ ] `/admin` opens SaaS admin/general admin context.
- [ ] SaaS admin navigation is visible for platform/organization admin.
- [ ] Organization profile fields load existing values.
- [ ] Updating organization profile fields does not break campaign data.
- [ ] Subscription status, plan, usage, credits, and limits display correctly.
- [ ] Geography governance panel loads built-in geography values.
- [ ] SaaS geography lock level defaults safely to `none` for old workspaces.
- [ ] Locked state/district/block/panchayat values are shown clearly.
- [ ] Custom location additions appear immediately.
- [ ] Custom location additions remain after refresh in production.
- [ ] Custom location delete/hide behavior does not remove all built-in geography.
- [ ] Integration settings screen shows provider-ready status clearly.
- [ ] Privacy/backup/export cards are marked provider-ready where applicable.

## Campaign Admin

- [ ] `/admin/{slug}` opens campaign admin login/page for that campaign.
- [ ] `/admin` does not accidentally open a campaign admin page.
- [ ] Campaign admin header shows campaign administration context.
- [ ] Campaign admin can edit only the intended campaign.
- [ ] Campaign admin cannot overwrite another campaign by saving a draft.
- [ ] Locked SaaS governance fields are disabled and marked as locked.
- [ ] Campaign admin can further restrict signer location where allowed.
- [ ] Campaign admin URL copy uses `/admin/{campaign.slug}`.
- [ ] SaaS admin URL copy uses `/admin`.
- [ ] Public campaign URL copy uses `/c/{campaign.slug}`.

## Campaign Creation Wizard

- [ ] New campaign starts in create mode.
- [ ] Create mode generates or uses a new unique campaign id.
- [ ] Save New Campaign appends to the campaign list.
- [ ] Edit mode updates only the selected campaign id.
- [ ] Save button label clearly distinguishes create vs update.
- [ ] Publish affects only the intended campaign.
- [ ] After save/publish, active campaign becomes the intended campaign.
- [ ] Unsaved-change protection appears when leaving a dirty campaign draft.
- [ ] Archive requires explicit confirmation and does not delete campaign data.
- [ ] Wizard progress indicator works on desktop and mobile.
- [ ] All wizard steps can be navigated without losing draft values.
- [ ] Required signer field configuration is visible and editable.
- [ ] New campaigns default to minimal recommended required fields.
- [ ] Existing campaigns preserve saved `requiredFields`.

## AI Copilot

- [ ] AI Copilot opens from dashboard/topbar/wizard entry points.
- [ ] Entering a campaign idea generates title, summary, description, objectives, authority suggestion, social copy, volunteer plan, and press release.
- [ ] Generated content preserves the original user idea strongly.
- [ ] Review cards show actual generated content, not placeholder text.
- [ ] Accept, reject, edit, and regenerate controls work visually.
- [ ] Thinking timeline progresses through all expected stages.
- [ ] Apply button is disabled when no AI draft exists.
- [ ] Applying accepted basics switches to Campaigns tab.
- [ ] Applied draft fills title, summary, description, category, target, duration, tags, required supporter fields, authority suggestion, and sharing fields where present.
- [ ] Applying AI draft does not auto-save.
- [ ] Existing save button persists the AI-generated campaign after review.
- [ ] AI provider settings remain provider-ready; no real AI API call is made.

## Templates

- [ ] Template library loads lazily without blocking app start.
- [ ] Search filters templates correctly.
- [ ] Category filter works.
- [ ] Favorites can be toggled.
- [ ] Recent templates update after applying a template.
- [ ] Applying a template in create mode fills the current new draft.
- [ ] Applying a template while editing creates a new draft if that is the intended flow.
- [ ] Template-derived slug fills the Slug field safely.
- [ ] Template content remains editable.
- [ ] Suggested authorities appear for relevant templates.

## Slug URLs

- [ ] Slug field is visible in Campaign Wizard.
- [ ] Public URL preview uses `campaign.slug`, not title.
- [ ] Campaign admin URL preview uses `campaign.slug`, not title.
- [ ] Editing title does not overwrite an already-edited slug.
- [ ] Editing slug updates all link previews immediately.
- [ ] Missing slug shows warning instead of falling back to title.
- [ ] Public route lookup matches `/c/{slug}`.
- [ ] Campaign admin route lookup matches `/admin/{slug}`.
- [ ] Production displayed base URL is `https://voiceup.live`.
- [ ] Vercel preview deployments do not display preview domain in canonical links.
- [ ] Localhost remains usable in local dev.

## Public Signing

- [ ] `/c/{slug}` opens the public campaign page.
- [ ] Public page has supporter-facing design, not admin-form appearance.
- [ ] Hero image, title, summary, signature reason, progress, and authority are visible.
- [ ] Only fields in `campaign.requiredFields` show `*`.
- [ ] Optional fields do not show repetitive optional suffixes.
- [ ] Submission blocks only missing required fields.
- [ ] Name and phone are required only when included in `requiredFields`.
- [ ] Locked/restricted location message is shown clearly.
- [ ] Locked location dropdowns are hidden when unnecessary.
- [ ] Signer cannot select outside allowed/restricted geography.
- [ ] OTP flow still behaves as before.
- [ ] Share-after-sign UI is clearly provider-ready where not implemented.
- [ ] Public URLs for existing campaigns continue to work.

## Field Collection

- [ ] Field Collection tab loads with existing scan/OCR logic intact.
- [ ] Upload paper sheet section is visible.
- [ ] OCR/review queue displays existing scan items.
- [ ] Manual entry section allows missing fields.
- [ ] Imported supporters section is visible.
- [ ] Duplicates/rejected section is visible.
- [ ] Image upload uses existing handler.
- [ ] PDF/CSV/Excel upload areas are marked provider-ready if not implemented.
- [ ] Manual correction table fields are editable.
- [ ] Duplicate detection flags likely duplicates by phone/name/location.
- [ ] Batch approve/reject UI works where supported.
- [ ] Import summary counts total, approved, duplicates, rejected, missing phone.
- [ ] Existing scan approvals still create/support signer records as before.

## Movement CRM

- [ ] Movement CRM tab lazy-loads successfully.
- [ ] Existing supporters are listed from real signer data.
- [ ] Supporter profile shows available real data only.
- [ ] Volunteer levels are displayed clearly.
- [ ] Provider-ready placeholders are labeled as such.
- [ ] Smart segments use existing signer/campaign data where available.
- [ ] Referral network placeholder does not imply live tracking.
- [ ] Movement health score renders without errors for empty and populated workspaces.
- [ ] Mobile layout is usable.

## Command Center

- [ ] Command Center lazy-loads successfully.
- [ ] Selected campaign appears correctly.
- [ ] Total supporters and verified supporters use real data.
- [ ] Field collection pending uses scan review data.
- [ ] Authority readiness uses existing authority match data.
- [ ] Communication readiness uses existing supporter contact data/provider status.
- [ ] Action board shows relevant tasks without fake operational data.
- [ ] AI Movement Brain is clearly provider-ready/deterministic.
- [ ] Daily Mission Plan generates UI-only recommendations.
- [ ] Volunteer War Room distinguishes real data from setup-needed placeholders.
- [ ] Authority Delivery Tracker does not claim delivery occurred unless implemented.

## Reports

- [ ] Reports tab lazy-loads successfully.
- [ ] National Command Center 2.0 metrics render.
- [ ] Supporter growth trend handles empty and populated data.
- [ ] Weak district detection handles empty and populated district totals.
- [ ] Campaign comparison displays existing campaigns.
- [ ] Online/paper/manual split uses signer source data.
- [ ] Authority response tracking is marked provider-ready.
- [ ] PDF export still works.
- [ ] CSV export still works.
- [ ] Signer register status update still works.
- [ ] Existing report calculations are unchanged.

## Integrations

- [ ] SaaS Admin -> Integrations opens Provider Configuration screen.
- [ ] AI provider settings show OpenAI, Gemini, Claude, Azure OpenAI, OpenRouter, Local LLM.
- [ ] Messaging settings show SMS, WhatsApp Business, Email, IVR.
- [ ] Payment/donation readiness is visible and provider-ready.
- [ ] File storage readiness is visible and provider-ready.
- [ ] Provider statuses include Not configured, Test mode, Ready, Error.
- [ ] Default status is Not configured/disabled unless existing config indicates otherwise.
- [ ] Test connection button shows placeholder message only.
- [ ] No SMS/WhatsApp/email/IVR message is sent from the readiness screen.
- [ ] Secret guidance says keys belong server-side, not in public UI fields.
- [ ] Consent and compliance reminder is visible.
- [ ] Existing integration fields still load and update.

## Mobile And Accessibility

- [ ] Sidebar/navigation is usable on tablet and phone widths.
- [ ] Topbar actions wrap without overlap.
- [ ] Campaign Wizard steps are usable on phone width.
- [ ] Public signing page has sticky sign action on mobile.
- [ ] Tables are horizontally scrollable where needed.
- [ ] Buttons have visible labels or accessible aria labels.
- [ ] Form fields have visible labels.
- [ ] Keyboard tab order is usable on forms and provider cards.
- [ ] Focus states are visible.
- [ ] Text contrast is readable on light and dark surfaces.
- [ ] No card/button text overlaps or clips.

## Vercel Deployment

- [ ] `npm run build` passes locally.
- [ ] Vercel build command is `npm run build`.
- [ ] Vercel install step succeeds.
- [ ] No TypeScript errors in deployment logs.
- [ ] No missing lazy module errors after deployment.
- [ ] Production app opens at `https://voiceup.live`.
- [ ] `/admin` opens SaaS admin/general admin route.
- [ ] `/admin/{slug}` opens campaign admin route.
- [ ] `/c/{slug}` opens public campaign route.
- [ ] Canonical displayed links use `https://voiceup.live`.
- [ ] Vercel preview URLs are not shown in production UI links.
- [ ] Existing campaigns load after refresh.
- [ ] Custom location overrides persist after refresh.
- [ ] Browser console has no critical runtime errors.
- [ ] Public signing works after hard refresh on a campaign URL.

## Release Sign-Off

- [ ] All critical flows above pass.
- [ ] Known provider-ready items are documented for the customer.
- [ ] No app code was changed during documentation-only updates.
- [ ] No commit or push was performed unless explicitly requested.
