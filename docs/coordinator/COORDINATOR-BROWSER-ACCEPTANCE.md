# Coordinator Management Browser Acceptance

Record browser/device, build or commit, workspace, role, result, and evidence for every applicable item.

## Desktop

- [ ] Coordinator dashboard opens without console or network errors.
- [ ] Directory loads persisted coordinators and empty state works.
- [ ] Search and role/status/campaign/geography filters work independently and together.
- [ ] Coordinator profile opens and displays the selected coordinator.
- [ ] Authorized user can create and edit a coordinator with validation.
- [ ] OTP send, verify, expiry/error, and verified-mobile save workflow works.
- [ ] Authorized status change works and stale-version failure is clear.
- [ ] Soft delete is blocked while direct reports remain and succeeds after reassignment.
- [ ] Reporting hierarchy/tree reflects saved parent-child relationships.
- [ ] Activity view reflects server-recorded changes.
- [ ] Read-only role can view but cannot create, edit, change status, or delete.
- [ ] Anonymous, inactive, and wrong-workspace users cannot access coordinator data.

## Mobile

- [ ] Validate at 360 px viewport width.
- [ ] Validate at 390 px viewport width.
- [ ] No page or component has horizontal scrolling.
- [ ] Interactive touch targets are at least 44 by 44 px.
- [ ] Forms remain usable with mobile keyboard open, including numeric OTP and phone keyboards.
- [ ] Sticky or floating actions do not cover fields, messages, or browser controls.
- [ ] Directory, profile, metric, and activity cards remain readable without zooming.
- [ ] Reporting tree has a usable mobile fallback and does not require horizontal dragging.
- [ ] Loading, empty, validation, authorization, conflict, and network-error states are clear.
- [ ] Browser and in-app back navigation preserve a predictable destination and do not lose confirmed data.
- [ ] Primary actions remain reachable with one hand and do not depend on hover.

## Regression

- [ ] Campaign creation and persistence work unchanged.
- [ ] Public campaign signing works unchanged.
- [ ] Field Collection upload, review, and approval work unchanged.
- [ ] Document Camera opens, falls back safely, captures, and returns to Field Collection.
- [ ] Secure private uploads and signed reads remain workspace-scoped.
- [ ] Authentication, session restore, role denial, and logout work unchanged.
- [ ] Campaign Admin navigation and feature gates work unchanged.

## Release decision

- [ ] Automated coordinator check passes.
- [ ] No unresolved critical/high defect remains.
- [ ] Preview evidence is attached to the release record.
- [ ] Rollback or forward-remediation steps are confirmed before Production.
