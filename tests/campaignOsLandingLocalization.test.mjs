import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/CampaignOsLandingPage.tsx', import.meta.url), 'utf8');
test('CampaignOS UI has Hindi and Odia presentation translations', () => {
  const entries = [...source.matchAll(/^  "((?:[^"\\]|\\.)+)": \{ hi: "((?:[^"\\]|\\.)+)", or: "((?:[^"\\]|\\.)+)" \},?$/gm)];
  assert.ok(entries.length >= 50, `Expected >=50 translations; found ${entries.length}`);
  for (const [, key, hi, or] of entries) {
    assert.ok(hi.trim() && or.trim(), `Missing localization for ${key}`);
    assert.ok(/[\u0900-\u097f]/u.test(hi), `Hindi text missing for ${key}`);
    assert.ok(/[\u0b00-\u0b7f]/u.test(or), `Odia text missing for ${key}`);
  }
});
test('CampaignOS keeps routes and admin separation', () => {
  for (const path of ['/admin', '/account', '/start', '/applications/campaign/act']) {
    assert.ok(source.includes(`"${path}"`), `Missing route ${path}`);
  }
  assert.match(source, /campaignReadinessLabels\[actualStatus\]\[language\]/);
  assert.match(source, /campaignOsText\(language, status\.label/);
});
