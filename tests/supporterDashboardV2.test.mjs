import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const accountPage = read("../src/pages/VoiceupAccountPage.tsx");
const portal = read("../src/pages/SupporterDashboardV2.tsx");
const styles = read("../src/styles.css");
const locales = Object.fromEntries(
  ["en", "hi", "or"].map((locale) => [
    locale,
    JSON.parse(read(`../src/i18n/locales/${locale}.json`))
  ])
);

test("the existing owner-scoped account loader mounts the additive V2 dashboard", () => {
  assert.match(accountPage, /loadOwnedSupporterDashboard\(supporterAccountId\)/u);
  assert.match(accountPage, /<SupporterDashboardV2[\s\S]*dashboard=\{dashboard\}[\s\S]*manifest=\{manifest\}/u);
  assert.match(accountPage, /authorizedDestinationCount=\{destinations\.length\}/u);
  assert.doesNotMatch(accountPage, /insert|update|upsert|delete/iu);
});

test("six accessible, keyboard-operable sections use a single tab panel", () => {
  for (const section of ["home", "certificates", "rewards", "network", "media", "help"]) {
    assert.match(portal, new RegExp(`id: "${section}"`, "u"));
  }
  assert.equal((portal.match(/id: "(?:home|certificates|rewards|network|media|help)"/gu) ?? []).length, 6);
  assert.match(portal, /role="tablist"/u);
  assert.match(portal, /role="tab"/u);
  assert.match(portal, /role="tabpanel"/u);
  assert.match(portal, /aria-selected=\{selected\}/u);
  assert.match(portal, /tabIndex=\{selected \? 0 : -1\}/u);
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.match(portal, new RegExp(`event\\.key === "${key}"`, "u"));
  }
});

test("home and impact metrics are derived from the owned dashboard and access manifest", () => {
  for (const expression of [
    "dashboard.supporter.signedAt",
    "dashboard.campaign.title",
    "dashboard.campaign.status",
    "dashboard.participationRequests.length",
    "manifest.volunteerAssignments",
    "manifest.coordinatorBindings"
  ]) {
    assert.match(portal, new RegExp(expression.replaceAll(".", "\\."), "u"));
  }
  assert.doesNotMatch(portal, /Math\.random|sample reward|demo balance|fake points/iu);
});

test("campaign and referral actions use only server-derived paths", () => {
  assert.match(portal, /href=\{dashboard\.campaignPath\}/u);
  assert.match(portal, /href=\{dashboard\.referralPath\}/u);
  assert.match(portal, /new URL\(dashboard\.referralPath, window\.location\.origin\)/u);
  assert.doesNotMatch(portal, /href=["'`]\/c\//u);
  assert.doesNotMatch(portal, /href=["'`]\/r\//u);
});

test("certificate section reuses the existing owner-scoped certificate implementation", () => {
  assert.match(portal, /import \{ MyCertificatesPanel \} from "\.\.\/certificates\/MyCertificatesPanel"/u);
  assert.match(portal, /activeSection === "certificates" && <MyCertificatesPanel manifest=\{manifest\} \/>/u);
  assert.doesNotMatch(portal, /issueOwnedCertificate|listOwnedCertificates|voiceup_issue_owned_participation_certificate/u);
});

test("rewards and media fail closed when owner-scoped services are unavailable", () => {
  assert.match(portal, /portal\.rewardsUnavailable/u);
  assert.match(portal, /portal\.rewardsSecurity/u);
  // Media is now a functional, authenticated, owner-scoped service.
  assert.match(accountPage, /key=\{dashboard\.account\.accountId\}/u);
  assert.match(portal, /listSupporterMedia\(dashboard\.account\.accountId\)/u);
  assert.match(portal, /submitSupporterMedia\(dashboard\.account\.accountId,\s*mediaFile,\s*mediaCaption,\s*mediaConsent\)/u);
  assert.match(portal, /manageSupporterMedia\(dashboard\.account\.accountId,\s*item\.id,\s*action\)/u);
  assert.match(portal, /if \(!mediaFile \|\| !mediaConsent \|\| mediaBusy\) return/u);
  assert.match(portal, /item\.moderationStatus === "approved"/u);
  assert.match(portal, /\{approved && <button[^>]*onClick=\{\(\) => void handleMediaAction\(item,"share_media"\)\}/u);
  assert.match(portal, /setMediaItems\(\[\]\)/u);
  assert.match(portal, /setMediaError\("Media service is temporarily unavailable\."\)/u);
  assert.match(portal, /LockKeyhole/u);
  assert.doesNotMatch(portal, /localStorage|sessionStorage/u);
});

test("English, Hindi and Odia portal translations have exact key parity", () => {
  const englishKeys = Object.keys(locales.en.account.dashboard.portal).sort();
  assert.equal(englishKeys.length, 55);
  for (const locale of ["hi", "or"]) {
    assert.deepEqual(Object.keys(locales[locale].account.dashboard.portal).sort(), englishKeys);
    for (const value of Object.values(locales[locale].account.dashboard.portal)) {
      assert.equal(typeof value, "string");
      assert.ok(value.trim().length > 0);
    }
  }
});

test("V2 styles are isolated, responsive, focus-visible and reduced-motion safe", () => {
  assert.match(styles, /Owner-scoped Supporter Dashboard V2/u);
  assert.match(styles, /\.account-supporter-v2-nav button:focus-visible/u);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.account-supporter-v2-hero/u);
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.supporter-impact-grid/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.account-supporter-v2/u);
  assert.doesNotMatch(accountPage, /className="account-shell supporter-portal-shell"/u);
});
