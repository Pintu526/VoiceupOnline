import { createAdminClient, jsonResponse } from "../_shared/voiceup.ts";

const MAX_BODY_BYTES = 4096;
const DEVELOPMENT_PROJECT_REF = "ravweavcfrpiykfgtmbf";
const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_FROM_DOMAIN = "dev-mail.voiceup.live";
const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ReceiptJob {
  receiptId: string;
  recipientEmail: string;
  participantName: string;
  campaignTitle: string;
  supporterReference: string;
  participatedAt: string;
  campaignPath: string;
  referralPath: string;
  attemptCount: number;
}

function html(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}

function safeOrigin(): string {
  const raw = (Deno.env.get("VOICEUP_PUBLIC_ORIGIN") ?? "").trim().replace(/\/+$/, "");
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("receipt_public_origin_unavailable");
  }
  return parsed.origin;
}

function absoluteUrl(origin: string, path: string): string {
  const url = new URL(path, `${origin}/`);
  if (url.origin !== origin || !path.startsWith("/")) throw new Error("receipt_path_invalid");
  return url.toString();
}

function assertDevelopmentProject(): void {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
  if (supabaseUrl !== `https://${DEVELOPMENT_PROJECT_REF}.supabase.co`) {
    throw new Error("receipt_development_project_required");
  }
}

function configuredSender() {
  const apiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  const email = (Deno.env.get("VOICEUP_RECEIPT_FROM_EMAIL") ?? "").trim().toLowerCase();
  const name = (Deno.env.get("VOICEUP_RECEIPT_FROM_NAME") ?? "VoiceUp").trim().slice(0, 80);
  const emailDomain = email.split("@")[1] ?? "";
  if (
    apiKey.length < 20
    || /\s/.test(apiKey)
    || !EMAIL.test(email)
    || emailDomain !== RESEND_FROM_DOMAIN
    || !name
    || /[\r\n]/.test(name)
  ) {
    throw new Error("receipt_provider_unavailable");
  }
  return { apiKey, email, name };
}

function isReceiptJob(value: unknown): value is ReceiptJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.receiptId === "string" && RECEIPT_ID.test(row.receiptId)
    && typeof row.recipientEmail === "string" && EMAIL.test(row.recipientEmail)
    && typeof row.participantName === "string" && row.participantName.length > 0 && row.participantName.length <= 160
    && typeof row.campaignTitle === "string" && row.campaignTitle.length > 0 && row.campaignTitle.length <= 240
    && typeof row.supporterReference === "string" && /^VU-[A-Z0-9]{6,64}$/.test(row.supporterReference)
    && typeof row.participatedAt === "string" && Number.isFinite(Date.parse(row.participatedAt))
    && [row.campaignPath, row.referralPath]
      .every((path) => typeof path === "string" && path.startsWith("/") && path.length <= 512)
    && Number.isInteger(row.attemptCount) && Number(row.attemptCount) >= 1 && Number(row.attemptCount) <= 5;
}

function renderReceipt(job: ReceiptJob, origin: string) {
  const campaignUrl = absoluteUrl(origin, job.campaignPath);
  const referralUrl = absoluteUrl(origin, job.referralPath);
  const participatedAt = new Date(job.participatedAt).toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  });
  const title = `Your VoiceUp participation receipt - ${job.campaignTitle}`
    .replace(/[\r\n]+/g, " ")
    .slice(0, 180);
  const text = [
    `Hello ${job.participantName},`,
    "",
    `Thank you for supporting ${job.campaignTitle}. Your participation was recorded successfully.`,
    `Supporter reference: ${job.supporterReference}`,
    `Recorded: ${participatedAt}`,
    `Campaign: ${campaignUrl}`,
    `Referral link: ${referralUrl}`,
    "",
    "This receipt confirms recorded participation only. It does not verify account ownership or grant campaign permissions.",
    "",
    "VoiceUp"
  ].join("\n");
  const content = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #dfe6ef;border-radius:16px;overflow:hidden"><tr><td style="background:#123a8c;color:#fff;padding:24px"><strong style="font-size:22px">VoiceUp</strong><div style="margin-top:5px;opacity:.85">Participation receipt</div></td></tr><tr><td style="padding:26px"><p style="margin-top:0">Hello ${html(job.participantName)},</p><h1 style="font-size:22px;line-height:1.3;color:#123a8c">Thank you for supporting ${html(job.campaignTitle)}</h1><p>Your participation was recorded successfully.</p><table role="presentation" width="100%" style="margin:20px 0;background:#f7f9fc;border-radius:12px"><tr><td style="padding:14px"><strong>Supporter reference</strong><br>${html(job.supporterReference)}</td></tr><tr><td style="padding:0 14px 14px"><strong>Recorded</strong><br>${html(participatedAt)}</td></tr></table><p><a href="${html(campaignUrl)}" style="display:inline-block;background:#123a8c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:bold">Open campaign</a></p><p><a href="${html(referralUrl)}">Your public referral link</a></p><p style="font-size:13px;color:#667085">This receipt confirms recorded participation only. It does not verify account ownership or grant campaign permissions. VoiceUp will never send passwords, OTPs, claim links or access tokens by email.</p></td></tr></table></td></tr></table></body></html>`;
  return { title, text, content };
}

async function authorizedWorkerRequest(req: Request): Promise<boolean> {
  const expected = Deno.env.get("VOICEUP_RECEIPT_WORKER_SECRET") ?? "";
  const supplied = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  const left = new TextEncoder().encode(supplied);
  const right = new TextEncoder().encode(expected);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function parseBody(req: Request): Promise<{ receiptId: string | null; limit: number }> {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("invalid_request");
  const body = JSON.parse(text || "{}") as Record<string, unknown>;
  const receiptId = typeof body.receiptId === "string" && RECEIPT_ID.test(body.receiptId)
    ? body.receiptId
    : null;
  const limit = Number.isInteger(body.limit) ? Number(body.limit) : 10;
  if ((body.receiptId !== undefined && !receiptId) || limit < 1 || limit > 25) {
    throw new Error("invalid_request");
  }
  return { receiptId, limit };
}

async function deliver(job: ReceiptJob, sender: ReturnType<typeof configuredSender>, origin: string) {
  const rendered = renderReceipt(job, origin);
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sender.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": job.receiptId
      },
      body: JSON.stringify({
        from: `${sender.name} <${sender.email}>`,
        to: [job.recipientEmail],
        subject: rendered.title,
        html: rendered.content,
        text: rendered.text
      })
    });
    const data = await response.json().catch(() => ({})) as {
      id?: unknown;
    };
    if (!response.ok) {
      return { delivered: false, messageId: null, failureCode: `provider_${response.status}` };
    }
    const messageId = typeof data.id === "string" ? data.id.slice(0, 240) : "";
    if (!messageId) return { delivered: false, messageId: null, failureCode: "provider_invalid_response" };
    return { delivered: true, messageId, failureCode: null };
  } catch {
    return { delivered: false, messageId: null, failureCode: "provider_network" };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!(await authorizedWorkerRequest(req))) return jsonResponse({ error: "Not authorized." }, 401);

  try {
    const request = await parseBody(req);
    assertDevelopmentProject();
    const sender = configuredSender();
    const origin = safeOrigin();
    const admin = createAdminClient();
    const { data: claimed, error: claimError } = await admin.rpc(
      "voiceup_claim_participation_email_receipts",
      { p_receipt_id: request.receiptId, p_limit: request.limit }
    );
    if (claimError || !Array.isArray(claimed)) {
      return jsonResponse({ error: "Receipt queue is unavailable." }, 503);
    }

    const results: Array<{ receiptId: string; status: string }> = [];
    for (const candidate of claimed) {
      if (!isReceiptJob(candidate)) continue;
      const result = await deliver(candidate, sender, origin);
      const { data: completed, error: completeError } = await admin.rpc(
        "voiceup_complete_participation_email_receipt",
        {
          p_receipt_id: candidate.receiptId,
          p_delivered: result.delivered,
          p_provider_message_id: result.messageId,
          p_failure_code: result.failureCode
        }
      );
      results.push({
        receiptId: candidate.receiptId,
        status: completeError ? "queued" : String(completed?.status ?? "queued")
      });
    }
    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    const code = error instanceof Error ? error.message : "receipt_unavailable";
    const status = code === "invalid_request" ? 400 : 503;
    return jsonResponse({ error: status === 400 ? "Invalid request." : "Receipt delivery is unavailable." }, status);
  }
});
