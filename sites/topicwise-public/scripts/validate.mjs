import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const htmlPath = path.join(dist, 'index.html');
const cssPath = path.join(dist, 'styles.css');
const jsPath = path.join(dist, 'app.js');
const manifestPath = path.join(root, '.openai', 'hosting.json');
const errors = [];

for (const required of [htmlPath, cssPath, jsPath, manifestPath]) {
  if (!fs.existsSync(required)) errors.push(`Missing required file: ${required}`);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const app = fs.readFileSync(jsPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (!/<meta charset="utf-8">/i.test(html)) errors.push('UTF-8 charset declaration is missing.');
if (manifest.project_id !== 'appgprj_6ae76ab047908191a0a168d8ab155cf4') errors.push('Hosting project_id is missing or incorrect.');
if (manifest.static?.directory !== 'dist') errors.push('Hosting static directory must be dist.');

const mojibake = ['â€', 'â‚', 'ðŸ', 'Â·', 'Ã'];
for (const marker of mojibake) {
  if ([html, css, app].some((content) => content.includes(marker))) errors.push(`Encoding corruption marker found: ${marker}`);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) errors.push(`Duplicate IDs: ${duplicateIds.join(', ')}`);

const screens = new Set([...html.matchAll(/data-demo-screen="([^"]+)"/g)].map((match) => match[1]));
const tabs = new Set([...html.matchAll(/data-demo-tab="([^"]+)"/g)].map((match) => match[1]));
for (const tab of tabs) {
  if (!screens.has(tab)) errors.push(`Demo tab has no matching screen: ${tab}`);
}
for (const expected of ['search', 'profile', 'booking', 'teacher', 'evaluator', 'admin']) {
  if (!screens.has(expected)) errors.push(`Missing demo screen: ${expected}`);
}

const localReferences = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)]
  .map((match) => match[1].split(/[?#]/)[0])
  .filter((reference) => reference !== '/');
for (const reference of new Set(localReferences)) {
  const filePath = path.join(dist, reference.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) errors.push(`Broken local reference: ${reference}`);
}

const cssOpen = (css.match(/{/g) || []).length;
const cssClose = (css.match(/}/g) || []).length;
if (cssOpen !== cssClose) errors.push(`CSS brace mismatch: ${cssOpen} opening, ${cssClose} closing.`);

if (!html.includes('No live transactions or accounts.')) errors.push('Public preview transaction disclosure is missing.');
if (!app.includes('No booking was created and no payment was taken.')) errors.push('Demo payment safeguard is missing.');

if (errors.length) {
  console.error(errors.map((error) => `FAIL: ${error}`).join('\n'));
  process.exit(1);
}

console.log(`PASS: ${ids.length} unique IDs, ${screens.size} demo screens, ${new Set(localReferences).size} local assets, UTF-8 clean.`);
