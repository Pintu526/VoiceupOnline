import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bindPasswordVisibilityToggle,
  setPasswordVisibility
} from "../src/passwordVisibility.ts";

function controls() {
  const attributes = new Map();
  const icon = (hidden) => ({
    hidden,
    toggleAttribute(name, force) {
      if (name === "hidden") this.hidden = force;
    }
  });
  const icons = { show: icon(false), hide: icon(true) };
  let clickHandler = () => {};
  const input = { type: "password", value: "unchanged secret value" };
  const toggle = {
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    querySelector(selector) {
      return selector.includes("show") ? icons.show : icons.hide;
    },
    addEventListener(event, handler) {
      if (event === "click") clickHandler = handler;
    }
  };
  return { input, toggle, attributes, icons, click: () => clickHandler() };
}

test("password visibility defaults hidden and toggles without changing the value", () => {
  const state = controls();
  bindPasswordVisibilityToggle(state.input, state.toggle);

  assert.equal(state.input.type, "password");
  assert.equal(state.input.value, "unchanged secret value");
  assert.equal(state.attributes.get("aria-label"), "Show password");
  assert.equal(state.attributes.get("aria-pressed"), "false");
  assert.equal(state.icons.show.hidden, false);
  assert.equal(state.icons.hide.hidden, true);

  state.click();
  assert.equal(state.input.type, "text");
  assert.equal(state.input.value, "unchanged secret value");
  assert.equal(state.attributes.get("aria-label"), "Hide password");
  assert.equal(state.attributes.get("aria-pressed"), "true");
  assert.equal(state.icons.show.hidden, true);
  assert.equal(state.icons.hide.hidden, false);

  state.click();
  assert.equal(state.input.type, "password");
  assert.equal(state.input.value, "unchanged secret value");
});

test("explicit visibility state preserves the entered password", () => {
  const state = controls();
  setPasswordVisibility(state.input, state.toggle, true);
  assert.equal(state.input.value, "unchanged secret value");
  setPasswordVisibility(state.input, state.toggle, false);
  assert.equal(state.input.value, "unchanged secret value");
});

test("all release supporter password fields have accessible eye buttons", () => {
  const resetPage = readFileSync(new URL("../supporter-reset-password.html", import.meta.url), "utf8");
  const resetSource = readFileSync(
    new URL("../src/supporterPasswordResetPage.ts", import.meta.url),
    "utf8"
  );
  const passwordField = readFileSync(new URL("../src/ui/PasswordField.tsx", import.meta.url), "utf8");
  const loginPage = readFileSync(new URL("../src/pages/VoiceupLoginPage.tsx", import.meta.url), "utf8");
  const claimPanel = readFileSync(new URL("../src/components/SupporterAccountClaimPanel.tsx", import.meta.url), "utf8");

  for (const id of [
    "supporter-reset-password-toggle",
    "supporter-reset-confirm-toggle"
  ]) {
    assert.match(resetPage, new RegExp(`id="${id}"[\\s\\S]*?type="button"[\\s\\S]*?aria-label="Show password"[\\s\\S]*?aria-pressed="false"`));
  }
  assert.equal((resetPage.match(/data-password-icon="show"/g) ?? []).length, 2);
  assert.match(resetSource, /bindPasswordVisibilityToggle\(password, passwordToggle\)/);
  assert.match(resetSource, /bindPasswordVisibilityToggle\(confirmation, confirmationToggle\)/);
  assert.match(passwordField, /aria-label=\{isVisible \? hideLabel : showLabel\}/);
  assert.match(passwordField, /aria-pressed=\{isVisible\}/);
  assert.match(loginPage, /<PasswordField/);
  assert.match(claimPanel, /<PasswordField/);
});
