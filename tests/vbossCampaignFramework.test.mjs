import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync("src/layouts/AppShell.tsx", "utf8");
const command = fs.readFileSync("src/pages/app/CommandCenterTab.tsx", "utf8");
const placeholder = fs.readFileSync("src/pages/app/VbossModulePlaceholder.tsx", "utf8");

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
});

test("framework placeholders expose status, connected components, and future capabilities", () => {
  assert.match(placeholder, /comingSoon/);
  assert.match(placeholder, /connected/);
  assert.match(placeholder, /future/);
});
