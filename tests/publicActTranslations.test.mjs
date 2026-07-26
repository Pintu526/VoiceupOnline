import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicCampaignSource = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const actSectionStart = publicCampaignSource.indexOf(
  '<section className="public-section act-home"'
);
const actSectionEnd = publicCampaignSource.indexOf(
  "<VoiceUpStoryCarousel",
  actSectionStart
);
assert.notEqual(actSectionStart, -1);
assert.notEqual(actSectionEnd, -1);
const actSectionSource = publicCampaignSource.slice(actSectionStart, actSectionEnd);
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

function referencedActKeys() {
  const staticKeys = Array.from(
    publicCampaignSource.matchAll(/t\("(act\.[^"]+)"\)/g),
    (match) => match[1]
  );
  const taskListStart = publicCampaignSource.indexOf("const actTasks = [");
  const taskListEnd = publicCampaignSource.indexOf("] as const;", taskListStart);
  assert.notEqual(taskListStart, -1);
  assert.notEqual(taskListEnd, -1);
  const taskIds = Array.from(
    publicCampaignSource.slice(taskListStart, taskListEnd).matchAll(/\{\s*id:\s*"([^"]+)"/g),
    (match) => match[1]
  );
  assert.deepEqual(taskIds, ["participate", "whatsapp", "social", "qr", "referral"]);

  return Array.from(new Set([
    ...staticKeys,
    "act.actions.review",
    "act.actions.start",
    ...taskIds.flatMap((taskId) => [
      `act.tasks.${taskId}`,
      `act.tasks.${taskId}Help`
    ])
  ])).sort();
}

test("Act dashboard translations never render raw keys and keep EN, HI, and OR parity", () => {
  const expectedKeys = referencedActKeys();
  const keysByLanguage = Object.fromEntries(
    Object.entries(localeByLanguage).map(([language, locale]) => [
      language,
      flattenStringKeys(locale.act, "act").sort()
    ])
  );

  assert.deepEqual(keysByLanguage.en, expectedKeys);
  assert.deepEqual(keysByLanguage.hi, expectedKeys);
  assert.deepEqual(keysByLanguage.or, expectedKeys);
  assert.equal(keysByLanguage.en.length, keysByLanguage.hi.length);
  assert.equal(keysByLanguage.en.length, keysByLanguage.or.length);

  for (const language of ["en", "hi", "or"]) {
    for (const key of expectedKeys) {
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

test("Act metric and task lookups use stable keys", () => {
  assert.doesNotMatch(publicCampaignSource, /act\.metrics\.\$\{/);
  assert.doesNotMatch(publicCampaignSource, /act\.metrics\.(?:field|referrals|growth)\d+/);
  assert.doesNotMatch(actSectionSource, />WhatsApp<\/a>/);
  assert.match(actSectionSource, /t\("act\.actions\.whatsapp"\)/);
});
