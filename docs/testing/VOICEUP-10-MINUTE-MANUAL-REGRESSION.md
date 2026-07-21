# VoiceUp 10-Minute Manual Regression Fence

Use this checklist after each implementation sprint.

Target duration: about 10 minutes when safe local/test fixtures exist.

Rules:
- Do not use production credentials.
- Do not create or delete production data.
- If a step cannot be completed safely, mark it `NOT TESTED`.

## 1. STARTUP

1. Open a terminal in the repository folder.
2. Start the app with the existing project command: `npm run dev`.
3. Record the local URL and port shown in terminal output (example: http://127.0.0.1:4173).
4. Open the URL in a browser.
5. Confirm the page is not blank.
6. Open browser Developer Tools Console and confirm there is no fatal error (red error that prevents app use).

## 2. PUBLIC LANDING

1. Open the landing page.
2. Confirm main VoiceUp branding is visible.
3. Confirm the application carousel is visible.
4. Confirm Campaign is shown as `Live`.
5. Confirm other applications keep their current statuses (no unexpected status changes).
6. Switch language to English and confirm text updates.
7. Switch language to Hindi and confirm text updates.
8. Switch language to Odia and confirm text updates.
9. Resize browser to mobile width (about 360 to 390 px) and confirm no obvious overlap or horizontal layout break.

## 3. NAVIGATION

1. Click ACT and confirm it opens the intended application selection/start flow.
2. Confirm a campaign can be selected from the current flow.
3. Confirm Coming Soon applications do not incorrectly start onboarding.
4. Click ORGANIZE and confirm it opens the existing Coordinator Network destination.
5. Click Learn More and confirm it reaches the intended content.
6. Use browser Back and confirm return is safe (no blank screen).

## 4. AUTHENTICATION SAFETY

Use only existing safe local/test credentials if available.

1. Open the login screen and confirm it loads.
2. Enter invalid credentials and confirm login fails safely.
3. If safe valid fixtures exist, sign in and confirm login works.
4. Refresh the page and confirm no blank screen appears.
5. Log out and confirm return to expected unauthenticated state.
6. Confirm an unauthenticated visitor cannot access protected admin content.

If safe credentials are unavailable, mark these steps `NOT TESTED`.
Never use production credentials only to complete this checklist.

## 5. WORKSPACE AND CAMPAIGN

Only with safe existing test data:

1. Confirm the correct workspace opens.
2. Confirm campaign list loads.
3. Open an existing campaign and confirm it loads.
4. Refresh and confirm campaign data is still present.
5. Confirm no other organization data is visible.
6. Do not create or delete production data.

If safe fixtures are unavailable, mark `NOT TESTED`.

## 6. PUBLIC CAMPAIGN

Using a known safe published campaign:

1. Open the public campaign page.
2. Confirm title, image, and signature count render.
3. Confirm the sign/support form renders.
4. Confirm share controls render.
5. Do not submit a real signature during routine regression unless explicitly required.

## 7. CRITICAL MODULE SMOKE

Verify only that each existing area opens without fatal failure:

1. Campaign dashboard
2. Coordinator Network
3. Scans or paper-signature tab
4. Growth dashboard
5. Reports
6. SaaS administration

Do not deeply test these after every sprint unless the sprint changed them.

## 8. AUTOMATED COMMANDS

Run only commands that already exist in `package.json`, plus the listed git checks.

1. Run `npm test`.
2. Run `npm run build`.
3. Run `npm run typecheck`.
4. Run `npx tsc --noEmit`.
5. Run `git diff --check`.
6. Run `git diff --cached --check`.

Keep both typecheck commands in this regression fence even if they overlap.

## 9. PASS/FAIL RECORD

Record results in this table for each sprint run.

| Date | Branch | Commit | Tester | Automated tests | Landing | Navigation | Authentication | Workspace | Public campaign | Console errors | Final result | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| YYYY-MM-DD | branch-name | commit-hash | name | PASS / FAIL | PASS / FAIL | PASS / FAIL | PASS / FAIL / NOT TESTED | PASS / FAIL / NOT TESTED | PASS / FAIL | None / Present | PASS / PASS WITH UNTESTED AUTHENTICATED FLOWS / FAIL - STOP IMPLEMENTATION | short note |

Allowed final result values:
- `PASS`
- `PASS WITH UNTESTED AUTHENTICATED FLOWS`
- `FAIL - STOP IMPLEMENTATION`

## 10. STOP RULE

Stop immediately and do not continue to the next sprint if any of the following occurs:

1. Build or tests fail.
2. Login or session behavior changes unexpectedly.
3. Tenant/workspace isolation is doubtful.
4. Existing campaign data disappears.
5. Blank screen or fatal console error occurs.
6. Failure cause is not yet identified.

Do not continue to the next sprint until the failure is identified.
