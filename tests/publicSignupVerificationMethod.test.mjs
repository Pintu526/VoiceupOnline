import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PUBLIC_SIGNUP_VERIFICATION_METHOD,
  PUBLIC_SIGNUP_VERIFICATION_METHODS,
  resolvePublicSignupVerificationMethod
} from "../src/config/productionCampaignBlueprint.ts";
import { goudhanCampaignBlueprint } from "../src/config/goudhanCampaignBlueprint.ts";

test("public signup verification methods are phone, email, and screen OTP", () => {
  assert.deepEqual(PUBLIC_SIGNUP_VERIFICATION_METHODS, ["phone_otp", "email_otp", "screen_otp"]);
  assert.equal(DEFAULT_PUBLIC_SIGNUP_VERIFICATION_METHOD, "phone_otp");
});

test("missing or legacy otpMode values stay phone OTP while GSAA explicitly uses screen OTP", () => {
  assert.equal(resolvePublicSignupVerificationMethod(undefined), "phone_otp");
  assert.equal(resolvePublicSignupVerificationMethod(null), "phone_otp");
  assert.equal(resolvePublicSignupVerificationMethod(""), "phone_otp");
  assert.equal(resolvePublicSignupVerificationMethod("production"), "phone_otp");
  assert.equal(resolvePublicSignupVerificationMethod("phone_otp"), "phone_otp");
  assert.equal(resolvePublicSignupVerificationMethod("email_otp"), "email_otp");
  assert.equal(resolvePublicSignupVerificationMethod("screen_otp"), "screen_otp");
  assert.equal(goudhanCampaignBlueprint.joinFlow.otpMode, "production");
  assert.equal(goudhanCampaignBlueprint.joinFlow.verificationMethod, "screen_otp");
  assert.equal(
    resolvePublicSignupVerificationMethod(goudhanCampaignBlueprint.joinFlow.verificationMethod),
    "screen_otp"
  );
});
