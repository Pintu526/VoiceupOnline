import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const locales = Object.fromEntries(["en", "hi", "or"].map(lang => [lang, JSON.parse(fs.readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), "utf8"))]));
const onboarding = fs.readFileSync(new URL("../src/pages/OnboardingWizard.tsx", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../src/components/CampaignInlineAuthPanel.tsx", import.meta.url), "utf8");
test("phase 3 keys complete and nonempty in all three languages", () => {
 const expected = Object.keys(locales.en.phase3).sort();
 assert.ok(expected.length >= 60);
 for (const lang of ["en", "hi", "or"]) {
  assert.deepEqual(Object.keys(locales[lang].phase3).sort(), expected);
  for (const key of expected) assert.ok(locales[lang].phase3[key].trim(), `${lang}:${key}`);
 }
});
test("onboarding and supporter auth use shared translation provider without changing OTP mechanics", () => {
 assert.match(onboarding, /const \{ t \} = useTranslation\(\)/);
 assert.match(onboarding, /t\(`phase3\.step\$\{index\}`\)/);
 assert.match(auth, /t\("phase3\.authVerifyLink"\)/);
 assert.match(auth, /verifySupporterSignupOtp/);
 assert.match(auth, /resolveAuthenticatedSupporterRouting/);
 assert.match(onboarding, /otpInput\.length < 6/);
});
