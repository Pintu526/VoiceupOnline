import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicCampaignSource = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const localeByLanguage = Object.fromEntries(
  ["en", "hi", "or"].map((language) => [
    language,
    JSON.parse(
      readFileSync(new URL(`../src/i18n/locales/${language}.json`, import.meta.url), "utf8")
    )
  ])
);

function flattenStringKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [path] : flattenStringKeys(child, path);
  });
}

function findTranslation(tree, key) {
  const value = key.split(".").reduce(
    (current, segment) =>
      current && typeof current === "object" ? current[segment] : undefined,
    tree
  );
  return typeof value === "string" ? value : undefined;
}

function translate(language, key) {
  return findTranslation(localeByLanguage[language], key)
    ?? findTranslation(localeByLanguage.en, key)
    ?? key;
}

test("Act translations never render raw keys and keep EN, HI, and OR parity", () => {
  const keysByLanguage = Object.fromEntries(
    Object.entries(localeByLanguage).map(([language, locale]) => [
      language,
      flattenStringKeys(locale.act, "act").sort()
    ])
  );

  assert.deepEqual(keysByLanguage.hi, keysByLanguage.en);
  assert.deepEqual(keysByLanguage.or, keysByLanguage.en);
  assert.equal(keysByLanguage.en.length, keysByLanguage.hi.length);
  assert.equal(keysByLanguage.en.length, keysByLanguage.or.length);

  for (const language of ["en", "hi", "or"]) {
    for (const key of keysByLanguage.en) {
      const renderedText = translate(language, key);
      assert.ok(renderedText.trim().length > 0, `${language} translation is empty for ${key}`);
      assert.doesNotMatch(
        renderedText,
        /^act\./,
        `${language} rendered the raw translation key ${key}`
      );
    }
  }
});

test("public campaign hides activity panels that require unavailable signer records", () => {
  assert.doesNotMatch(publicCampaignSource, /className="public-section act-home"/);
  assert.doesNotMatch(publicCampaignSource, /className="public-national-progress"/);
  assert.doesNotMatch(publicCampaignSource, /const campaignParticipants =/);
  assert.doesNotMatch(publicCampaignSource, /paperParticipants/);
  assert.doesNotMatch(publicCampaignSource, /t\("act\./);
});
