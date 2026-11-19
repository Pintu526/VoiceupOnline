import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const locales = Object.fromEntries(["en", "hi", "or"].map(lang => [lang, JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), "utf8"))]));
const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([key, value]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return value && typeof value === "object" && !Array.isArray(value) ? flatten(value, path) : [[path, value]];
});
test("all Business OS landing translation keys exist in all three languages", () => {
  const expected = Object.keys(Object.fromEntries(flatten(locales.en.landing.businessOs))).sort();
  for (const lang of ["en", "hi", "or"]) {
    const actual = Object.fromEntries(flatten(locales[lang].landing.businessOs));
    assert.deepEqual(Object.keys(actual).sort(), expected, `${lang} missing or extra keys`);
    for (const key of expected) assert.ok(typeof actual[key] === "string" && actual[key].trim(), `${lang}: ${key}`);
  }
});
test("empty VoiceUp highlight placeholder is absent", () => {
  for (const lang of ["en", "hi", "or"]) assert.equal(Object.hasOwn(locales[lang].landing.saas.apps.voiceup.highlights, "4"), false);
});
