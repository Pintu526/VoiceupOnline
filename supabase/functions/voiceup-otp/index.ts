  import {
    corsHeaders,
    createAdminClient,
    createSecureToken,
    getUser,
    isPlatformAdmin,
    jsonResponse,
    normalizePhone,
    parseJson,
    sha256Hex
  } from "../_shared/voiceup.ts";
  import { fetchCanonicalPublishedCampaignBySlug } from "../_shared/publicCampaignIndex.ts";

  const OTP_EXPIRY_MINUTES = 10;
  const OTP_MAX_SENDS = 4;
  const OTP_MAX_ATTEMPTS = 5;
  const DEV_MODE = Deno.env.get("DEV_MODE") === "true";

  function createOtpCode() {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const value = new DataView(bytes.buffer).getUint32(0);
    return String(100000 + (value % 900000));
  }

  function isValidPublicPhone(phone: string) {
    return /^[0-9]{8,15}$/.test(phone);
  }

  async function sendWithProvider(phone: string, code: string, purpose: string) {
    const webhookUrl = Deno.env.get("VOICEUP_OTP_WEBHOOK_URL");
    const webhookToken = Deno.env.get("VOICEUP_OTP_WEBHOOK_TOKEN");
    if (!webhookUrl) throw new Error("OTP provider is not configured.");

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {})
      },
      body: JSON.stringify({
        phone,
        purpose,
        code,
        message: `Your VoiceUp verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`
      })
    });
    if (!response.ok) throw new Error("OTP provider rejected the request.");
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      const body = await parseJson(req);
      const action = String(body?.action ?? "");
      const purpose = String(body?.purpose ?? "");
      const phone = normalizePhone(String(body?.phone ?? ""));
      if (!purpose) {
        return jsonResponse({ error: "Phone and purpose are required.", code: "invalid_request" }, 400);
      }
      if (!isValidPublicPhone(phone)) {
        return jsonResponse({ error: "Enter a valid phone number.", code: "invalid_phone" }, 400);
      }

      const admin = createAdminClient();
      let workspaceId = String(body?.workspaceId ?? "default");
      const metadata = body?.metadata ?? {};
      if (purpose === "coordinator-mobile") {
        const caller = await getUser(req);
        if (!caller) {
          return jsonResponse({ error: "A valid Supabase session is required.", code: "unauthorized" }, 401);
        }
        const [platformAdmin, membershipResult] = await Promise.all([
          isPlatformAdmin(admin, caller.id),
          admin
            .from("voiceup_workspace_members")
            .select("role, active")
            .eq("workspace_id", workspaceId)
            .eq("user_id", caller.id)
            .eq("active", true)
            .maybeSingle()
        ]);
        if (membershipResult.error) throw membershipResult.error;
        const workspaceRole = membershipResult.data?.role ?? "";
        if (!platformAdmin && !["platform_owner", "workspace_admin", "campaign_admin"].includes(workspaceRole)) {
          return jsonResponse({
            error: "Coordinator mobile verification is not authorized.",
            code: "unauthorized"
          }, 403);
        }
      }
      const publicSlug = typeof metadata?.slug === "string" ? metadata.slug : "";
      if (purpose === "public-signing") {
        const resolved = await fetchCanonicalPublishedCampaignBySlug(admin, publicSlug);
        if (!resolved.ok) {
          return jsonResponse({
            error: "Campaign is not available for verification.",
            code: "campaign_unavailable"
          }, 404);
        }
        workspaceId = resolved.row.workspace_id;
      }
      const phoneHash = await sha256Hex(`${workspaceId}:${phone}`);

      if (action === "send") {
        const windowStart = new Date(Date.now() - OTP_EXPIRY_MINUTES * 60_000).toISOString();
        const { data: recentChallenges } = await admin
          .from("voiceup_otp_challenges")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("phone_hash", phoneHash)
          .eq("purpose", purpose)
          .gte("created_at", windowStart);

        if ((recentChallenges?.length ?? 0) >= OTP_MAX_SENDS) {
          return jsonResponse({
            error: "Too many OTP requests. Try again later.",
            code: "otp_rate_limited"
          }, 429);
        }

        const code = createOtpCode();
        const codeHash = await sha256Hex(`${workspaceId}:${phone}:${code}`);
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();

        if (DEV_MODE) {
          console.log("[DEV OTP]", phone, purpose, code);
        } else {
          await sendWithProvider(phone, code, purpose);
        }

        const { data, error } = await admin
          .from("voiceup_otp_challenges")
          .insert({
            workspace_id: workspaceId,
            phone_hash: phoneHash,
            code_hash: codeHash,
            purpose,
            metadata,
            expires_at: expiresAt
          })
          .select("id")
          .single();
        if (error) throw error;

        return jsonResponse({
          challengeId: data.id,
          resendAfterSeconds: 30,
          message: "Verification code sent."
        });
      }

      if (action === "verify") {
        const challengeId = String(body?.challengeId ?? "");
        const code = String(body?.code ?? "").trim();
        if (!challengeId || !code) {
          return jsonResponse({
            error: "Challenge and code are required.",
            code: "invalid_request"
          }, 400);
        }

        const { data: challenge, error } = await admin
          .from("voiceup_otp_challenges")
          .select("*")
          .eq("id", challengeId)
          .eq("workspace_id", workspaceId)
          .eq("phone_hash", phoneHash)
          .eq("purpose", purpose)
          .maybeSingle();
        if (error) throw error;
        if (!challenge) {
          return jsonResponse({ error: "OTP challenge not found.", code: "otp_challenge_not_found" }, 404);
        }
        if (challenge.verified_at) {
          return jsonResponse({
            error: "OTP already used. Request a new code.",
            code: "otp_already_used"
          }, 409);
        }
        if (new Date(challenge.expires_at).getTime() <= Date.now()) {
          return jsonResponse({ error: "OTP expired. Request a new code.", code: "otp_expired" }, 410);
        }
        if (challenge.attempt_count >= OTP_MAX_ATTEMPTS) {
          return jsonResponse({
            error: "Too many incorrect attempts. Request a fresh OTP.",
            code: "otp_attempts_exceeded"
          }, 429);
        }

        const expectedHash = await sha256Hex(`${workspaceId}:${phone}:${code}`);
        if (expectedHash !== challenge.code_hash) {
          await admin
            .from("voiceup_otp_challenges")
            .update({ attempt_count: challenge.attempt_count + 1 })
            .eq("id", challenge.id);
          return jsonResponse({ error: "Invalid OTP.", code: "invalid_otp" }, 401);
        }

        const verificationToken = createSecureToken("otpv");
        const verificationTokenHash = await sha256Hex(verificationToken);
        const metadata = {
          ...(challenge.metadata ?? {}),
          verificationTokenHash
        };

        await admin
          .from("voiceup_otp_challenges")
          .update({
            verified_at: new Date().toISOString(),
            metadata
          })
          .eq("id", challenge.id);

        return jsonResponse({
          verified: true,
          verificationToken,
          message: "Phone number verified."
        });
      }

      return jsonResponse({ error: "Unsupported OTP action.", code: "unsupported_action" }, 400);
    } catch (error) {
      console.error("voiceup-otp unexpected failure", error);
      return jsonResponse({
        error: "Verification service is temporarily unavailable. Please retry.",
        code: "server_error"
      }, 500);
    }
  });
