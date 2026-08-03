import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groupSignersByDay } from "../src/lib.ts";
import { getMonthlySignerCount } from "../src/utils/subscription.ts";
const growthAnalyticsSource = readFileSync(new URL("../src/growth/services/analyticsService.ts", import.meta.url), "utf8");

const valid = { id: "one", campaignId: "campaign", signedAt: new Date().toISOString(), status: "verified", otpVerified: true };
const missing = { id: "missing", campaignId: "campaign", status: "verified" };
const empty = { ...valid, id: "empty", signedAt: "" };
const invalid = { ...valid, id: "invalid", signedAt: "not-a-date" };
const asSigner = (value) => value;

test("date analytics preserve valid signers and ignore missing, empty, and invalid signedAt values", () => {
  const signers = [asSigner(valid), asSigner(missing), asSigner(empty), asSigner(invalid)];
  assert.deepEqual(groupSignersByDay(signers), { [valid.signedAt.slice(0, 10)]: 1 });
  assert.equal(getMonthlySignerCount(signers), 1);
  assert.match(growthAnalyticsSource, /getValidSignedAt\(signer\)\?\.slice\(0, 10\)/);
  assert.match(growthAnalyticsSource, /return signedAt \? daysAgo\(signedAt\) <= 7 : false/);
});
