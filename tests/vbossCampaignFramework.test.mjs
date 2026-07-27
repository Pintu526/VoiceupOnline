import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync("src/layouts/AppShell.tsx", "utf8");
const command = fs.readFileSync("src/pages/app/CommandCenterTab.tsx", "utf8");
const placeholder = fs.readFileSync("src/pages/app/VbossModulePlaceholder.tsx", "utf8");
const styles = fs.readFileSync("src/styles.css", "utf8");
const english = JSON.parse(fs.readFileSync("src/i18n/locales/en.json", "utf8"));

test("VBOSS framework navigation maps stages to existing workspace tabs", () => {
  for (const stage of ["command", "coordinators", "campaigns", "public", "fund", "prove", "growth", "saas"]) {
    assert.match(shell, new RegExp(`tab=\\"${stage}\\"`));
  }
  assert.match(shell, /framework\.nav\.organize/);
  assert.match(shell, /framework\.nav\.plan/);
  assert.match(shell, /framework\.nav\.act/);
});

test("command center landing includes the approved subscriber cards and quick actions", () => {
  for (const card of ["campaign", "organization", "readiness", "supporters", "fund", "team", "activity", "nextAction"]) {
    assert.match(command, new RegExp(`framework\\.command\\.cards\\.${card}`));
  }
  assert.match(command, /framework\.command\.quickActions/);
  assert.equal(english.framework.command.view, "View →");
  assert.doesNotMatch(command, />Open module</);
});

test("command center snapshot includes the compact overview and movement dashboard", () => {
  for (const metric of ["campaignName", "campaignStatus", "campaignProgress", "lastActivity", "teamMembers", "supporters", "fundsRaised"]) {
    assert.match(command, new RegExp(`framework\\.command\\.overview\\.${metric}`));
  }
  for (const card of ["risk", "readiness", "growth", "pending", "activity"]) {
    assert.match(command, new RegExp(`framework\\.command\\.movement\\.${card}`));
  }
  assert.match(command, /<FrameworkLinkCard icon=/);
  assert.match(command, /status=/);
});

test("command center layout keeps actions equal, active navigation clear, and responsive", () => {
  const desktopSidebarRule = styles.match(/\.sidebar\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(styles, /\.vboss-command-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styles, /\.nav button\.active\s*\{[^}]*box-shadow:/s);
  assert.match(desktopSidebarRule, /height:\s*100dvh/);
  assert.match(desktopSidebarRule, /overflow-y:\s*auto/);
  assert.match(desktopSidebarRule, /overscroll-behavior-y:\s*contain/);
  assert.match(
    styles,
    /@media \(max-width: 1100px\)[\s\S]*?\.sidebar\s*\{[^}]*height:\s*auto;[^}]*overflow-y:\s*visible;[^}]*position:\s*static;/s
  );
  assert.match(styles, /@media \(max-width: 560px\)[^{]*\{[^}]*\.vboss-command-actions/s);
});

test("framework placeholders expose status, connected components, and future capabilities", () => {
  assert.match(placeholder, /comingSoon/);
  assert.match(placeholder, /connected/);
  assert.match(placeholder, /future/);
});
