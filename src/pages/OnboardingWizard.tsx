import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  Loader2,
  Mail,
  QrCode,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X
} from "lucide-react";
import type { Campaign, Organization } from "../types";
import {
  isBackendConfigured,
  requestOtp,
  verifyOtp as verifyServerOtp
} from "../backend";
import { createQrCells, downloadQrPosterSvg } from "../utils/referrals";

const DRAFT_KEY = "voiceup-onboarding-draft-v1";
const SESSION_KEY = "voiceup-onboarding-session-v1";
const EVENTS_KEY = "voiceup-onboarding-events-v1";
const OTP_RATE_KEY = "voiceup-onboarding-otp-rate-v1";
const OTP_RESEND_SECONDS = 30;
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 4;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const isDevelopmentOtpMode = import.meta.env.VITE_DEV_MODE === "true";

export interface OnboardingDraft {
  campaignName: string;
  campaignGoal: string;
  businessName: string;
  mobileNumber: string;
  email: string;
  language: string;
  country: string;
}

export interface OnboardingAnalyticsEvent {
  id: string;
  name: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
}

export interface OnboardingTracking {
  deviceId: string;
  landingPath: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  referralCode: string;
  adClickId: string;
  browserLanguage: string;
  timezone: string;
  detectedCountry: string;
  screen: string;
  userAgent: string;
  touchDevice: boolean;
}

export interface OnboardingSession {
  userId: string;
  tenantId: string;
  workspaceId: string;
  campaignId: string;
  slug: string;
  mobileNumber: string;
  createdAt: string;
}

export interface OnboardingCompletionPayload extends OnboardingDraft {
  otpVerifiedAt: string;
  otpVerificationToken: string;
  tracking: OnboardingTracking;
  analyticsEvents: OnboardingAnalyticsEvent[];
  returningSession?: OnboardingSession;
}

export interface OnboardingCompletionResult {
  campaign: Campaign;
  organization: Organization;
  userId: string;
  tenantId: string;
  workspaceId: string;
  shareUrl: string;
  shortUrl: string;
  qrValue: string;
  trialEndsAt: string;
  restored: boolean;
}

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (payload: OnboardingCompletionPayload) => OnboardingCompletionResult | Promise<OnboardingCompletionResult>;
}

const languageOptions = [
  "English",
  "Hindi",
  "Odia",
  "Bengali",
  "Tamil",
  "Telugu",
  "Marathi",
  "Gujarati",
  "Spanish",
  "French",
  "Arabic",
  "Portuguese",
  "Indonesian"
];

const countryOptions = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "South Africa",
  "Brazil",
  "Indonesia",
  "Nigeria",
  "Germany",
  "France",
  "Other"
];

const progressSteps = [
  "Brief",
  "Verify",
  "Trial",
  "AI",
  "Share",
  "Welcome"
];

function createEvent(
  name: string,
  metadata: Record<string, string | number | boolean> = {}
): OnboardingAnalyticsEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    metadata
  };
}

function getDefaultDraft(): OnboardingDraft {
  const browserLanguage = typeof navigator === "undefined" ? "en" : navigator.language || "en";
  return {
    campaignName: "",
    campaignGoal: "",
    businessName: "",
    mobileNumber: "",
    email: "",
    language: inferLanguage(browserLanguage),
    country: inferCountry(browserLanguage)
  };
}

function loadDraft(): OnboardingDraft {
  if (typeof window === "undefined") return getDefaultDraft();
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY);
    return stored ? { ...getDefaultDraft(), ...(JSON.parse(stored) as Partial<OnboardingDraft>) } : getDefaultDraft();
  } catch {
    return getDefaultDraft();
  }
}

function captureTracking(): OnboardingTracking {
  if (typeof window === "undefined") {
    return {
      deviceId: "server",
      landingPath: "/",
      referrer: "",
      utmSource: "",
      utmMedium: "",
      utmCampaign: "",
      utmContent: "",
      utmTerm: "",
      referralCode: "",
      adClickId: "",
      browserLanguage: "en",
      timezone: "UTC",
      detectedCountry: "",
      screen: "",
      userAgent: "",
      touchDevice: false
    };
  }

  const params = new URLSearchParams(window.location.search);
  const browserLanguage = navigator.language || "en";
  return {
    deviceId: getOrCreateDeviceId(),
    landingPath: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer,
    utmSource: params.get("utm_source") ?? "",
    utmMedium: params.get("utm_medium") ?? "",
    utmCampaign: params.get("utm_campaign") ?? "",
    utmContent: params.get("utm_content") ?? "",
    utmTerm: params.get("utm_term") ?? "",
    referralCode: params.get("ref") ?? params.get("referral") ?? "",
    adClickId: params.get("gclid") ?? params.get("fbclid") ?? params.get("msclkid") ?? "",
    browserLanguage,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    detectedCountry: inferCountry(browserLanguage),
    screen: `${window.screen.width}x${window.screen.height}`,
    userAgent: navigator.userAgent,
    touchDevice: navigator.maxTouchPoints > 0
  };
}

function getOrCreateDeviceId(): string {
  const key = "voiceup-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function inferLanguage(language: string): string {
  const normalized = language.toLowerCase();
  if (normalized.startsWith("hi")) return "Hindi";
  if (normalized.startsWith("or")) return "Odia";
  if (normalized.startsWith("bn")) return "Bengali";
  if (normalized.startsWith("ta")) return "Tamil";
  if (normalized.startsWith("te")) return "Telugu";
  if (normalized.startsWith("mr")) return "Marathi";
  if (normalized.startsWith("gu")) return "Gujarati";
  if (normalized.startsWith("es")) return "Spanish";
  if (normalized.startsWith("fr")) return "French";
  if (normalized.startsWith("ar")) return "Arabic";
  if (normalized.startsWith("pt")) return "Portuguese";
  if (normalized.startsWith("id")) return "Indonesian";
  return "English";
}

function inferCountry(language: string): string {
  const region = language.split("-")[1]?.toUpperCase() ?? "";
  const map: Record<string, string> = {
    IN: "India",
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    ZA: "South Africa",
    BR: "Brazil",
    ID: "Indonesia",
    NG: "Nigeria",
    DE: "Germany",
    FR: "France"
  };
  return map[region] ?? "India";
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return value;
  return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}

function validateDraft(draft: OnboardingDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.campaignName.trim()) errors.campaignName = "Campaign name is required.";
  if (!draft.campaignGoal.trim()) errors.campaignGoal = "Campaign goal is required.";
  if (!draft.businessName.trim()) errors.businessName = "Business or organization name is required.";
  if (normalizePhone(draft.mobileNumber).replace(/\D/g, "").length < 7) {
    errors.mobileNumber = "Enter a valid mobile number.";
  }
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = "Enter a valid email or leave it blank.";
  }
  if (!draft.language) errors.language = "Choose a language.";
  if (!draft.country) errors.country = "Choose a country.";
  return errors;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loadSessions(): OnboardingSession[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as OnboardingSession[]) : [];
  } catch {
    return [];
  }
}

function saveSession(session: OnboardingSession) {
  if (typeof window === "undefined") return;
  const sessions = loadSessions().filter(
    (item) => normalizePhone(item.mobileNumber) !== normalizePhone(session.mobileNumber)
  );
  window.localStorage.setItem(SESSION_KEY, JSON.stringify([session, ...sessions].slice(0, 10)));
}

function findSessionForMobile(mobileNumber: string): OnboardingSession | undefined {
  const normalized = normalizePhone(mobileNumber);
  return loadSessions().find((session) => normalizePhone(session.mobileNumber) === normalized);
}

function appendStoredEvents(events: OnboardingAnalyticsEvent[]) {
  if (typeof window === "undefined" || events.length === 0) return;
  try {
    const stored = window.localStorage.getItem(EVENTS_KEY);
    const current = stored ? (JSON.parse(stored) as OnboardingAnalyticsEvent[]) : [];
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify([...events, ...current].slice(0, 250)));
  } catch {
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, 250)));
  }
}

function getRateRecord(mobileNumber: string) {
  try {
    const stored = window.localStorage.getItem(OTP_RATE_KEY);
    const records = stored ? (JSON.parse(stored) as Record<string, { count: number; resetAt: number }>) : {};
    const key = normalizePhone(mobileNumber);
    const current = records[key];
    if (!current || Date.now() > current.resetAt) {
      return { key, records, current: { count: 0, resetAt: Date.now() + OTP_RATE_WINDOW_MS } };
    }
    return { key, records, current };
  } catch {
    return { key: normalizePhone(mobileNumber), records: {}, current: { count: 0, resetAt: Date.now() + OTP_RATE_WINDOW_MS } };
  }
}

function saveRateRecord(
  key: string,
  records: Record<string, { count: number; resetAt: number }>,
  current: { count: number; resetAt: number }
) {
  window.localStorage.setItem(OTP_RATE_KEY, JSON.stringify({ ...records, [key]: current }));
}

function createOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildShareText(result: OnboardingCompletionResult): string {
  return `I just launched this campaign on Voiceup: ${result.campaign.title}. Add your support here: ${result.shareUrl}`;
}

function downloadQrSvg(value: string, fileName: string) {
  const cells = createQrCells(value, 17);
  const cellSize = 14;
  const rects = cells
    .map((active, index) => {
      if (!active) return "";
      const row = Math.floor(index / 17);
      const column = index % 17;
      return `<rect x="${24 + column * cellSize}" y="${24 + row * cellSize}" width="11" height="11" rx="1.5" fill="#071f4e"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="286" height="286" viewBox="0 0 286 286">
  <rect width="286" height="286" rx="20" fill="#ffffff"/>
  <rect x="12" y="12" width="262" height="262" rx="18" fill="#f3f7ff" stroke="#d7dce6"/>
  ${rects}
  <text x="143" y="268" text-anchor="middle" font-family="Inter, Arial" font-size="10" fill="#475569">${escapeSvg(value).slice(0, 42)}</text>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function QrPreview({ value }: { value: string }) {
  const cells = useMemo(() => createQrCells(value, 17), [value]);
  return (
    <div className="onboarding-qr" aria-label="Campaign QR code preview">
      {cells.map((active, index) => (
        <span key={index} className={active ? "active" : ""} />
      ))}
    </div>
  );
}

function ProvisioningSkeleton() {
  return (
    <div className="onboarding-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <div />
    </div>
  );
}

export function OnboardingWizard({ open, onClose, onComplete }: OnboardingWizardProps) {
  const [draft, setDraft] = useState<OnboardingDraft>(() => loadDraft());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpVerificationToken, setOtpVerificationToken] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [developmentOtpCode, setDevelopmentOtpCode] = useState("");
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [creationLog, setCreationLog] = useState<string[]>([]);
  const [result, setResult] = useState<OnboardingCompletionResult | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const tracking = useMemo(() => captureTracking(), []);
  const analyticsRef = useRef<OnboardingAnalyticsEvent[]>([]);
  const provisionStartedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setDraft(loadDraft());
    trackEvent("onboarding_opened", { path: tracking.landingPath });
  }, [open]);

  useEffect(() => {
    if (!open || step >= 5) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, open, step]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isProvisioning) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isProvisioning, onClose, open]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function trackEvent(name: string, metadata: Record<string, string | number | boolean> = {}) {
    const event = createEvent(name, {
      ...metadata,
      deviceId: tracking.deviceId,
      utmSource: tracking.utmSource,
      referralCode: tracking.referralCode
    });
    analyticsRef.current = [event, ...analyticsRef.current].slice(0, 50);
    appendStoredEvents([event]);
  }

  function updateDraft(values: Partial<OnboardingDraft>) {
    setDraft((current) => ({ ...current, ...values }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(values).forEach((key) => delete next[key]);
      return next;
    });
  }

  function submitBasics(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      trackEvent("onboarding_validation_failed", { step: "brief" });
      return;
    }
    trackEvent("onboarding_step_completed", { step: "brief" });
    setStep(1);
  }

  async function sendOtp() {
    const nextErrors = validateDraft(draft);
    if (nextErrors.mobileNumber) {
      setErrors({ mobileNumber: nextErrors.mobileNumber });
      setStep(0);
      return;
    }
    if (resendSeconds > 0) {
      setOtpMessage(`Please wait ${resendSeconds}s before requesting another OTP.`);
      return;
    }
    if (!isBackendConfigured) {
      setOtpMessage("Secure mobile verification requires Supabase Edge Functions to be configured.");
      return;
    }

    setIsSendingOtp(true);
    setOtpMessage("Preparing secure mobile verification...");
    try {
      const result = await requestOtp(draft.mobileNumber, "onboarding", {
        landingPath: tracking.landingPath,
        deviceId: tracking.deviceId
      });
      setOtpChallengeId(result.challengeId);
      setOtpVerificationToken("");
      setOtpInput("");
      setOtpAttempts(0);
      setDevelopmentOtpCode(isDevelopmentOtpMode && result.otp ? result.otp : "");
      setResendSeconds(result.resendAfterSeconds || OTP_RESEND_SECONDS);
      setOtpMessage(result.message || `Verification code sent to ${maskPhone(draft.mobileNumber)}. Enter the code to continue.`);
      trackEvent("otp_requested", { mobile: maskPhone(draft.mobileNumber), secureOtp: true });
    } catch (error) {
      setDevelopmentOtpCode("");
      setOtpMessage(error instanceof Error ? error.message : "Unable to send OTP. Please retry.");
      trackEvent("otp_request_failed", { mobile: maskPhone(draft.mobileNumber) });
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function verifyOtp() {
    if (!otpChallengeId) {
      setOtpMessage("Send OTP first.");
      return;
    }
    if (otpAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      setOtpMessage("Too many incorrect attempts. Request a fresh OTP.");
      return;
    }
    try {
      const result = await verifyServerOtp(otpChallengeId, draft.mobileNumber, otpInput.trim(), "onboarding");
      setOtpVerificationToken(result.verificationToken);
      setDevelopmentOtpCode("");
      setOtpMessage("Mobile verified. Creating your campaign now...");
      trackEvent("otp_verified", { mobile: maskPhone(draft.mobileNumber) });
      await beginProvisioning(result.verificationToken);
    } catch (error) {
      const nextAttempts = otpAttempts + 1;
      setOtpAttempts(nextAttempts);
      setOtpMessage(error instanceof Error ? error.message : `Incorrect OTP. ${OTP_MAX_VERIFY_ATTEMPTS - nextAttempts} attempt(s) remaining.`);
      trackEvent("otp_verify_failed", { attempts: nextAttempts });
    }
  }

  async function beginProvisioning(verificationToken = otpVerificationToken) {
    if (provisionStartedRef.current) return;
    provisionStartedRef.current = true;
    setIsProvisioning(true);
    setStep(2);
    const returningSession = findSessionForMobile(draft.mobileNumber);

    try {
      setCreationLog(["Creating passwordless guest account"]);
      await wait(420);
      setCreationLog((current) => [
        ...current,
        returningSession ? "Restoring existing trial workspace" : "Creating tenant and workspace"
      ]);
      await wait(520);
      setCreationLog((current) => [...current, "Assigning 1-day Free Trial plan"]);
      await wait(420);
      setStep(3);
      setCreationLog((current) => [...current, "AI is drafting title, description, slug, link, and QR"]);
      await wait(680);
      const completion = await onComplete({
        ...draft,
        otpVerifiedAt: new Date().toISOString(),
        otpVerificationToken: verificationToken,
        tracking,
        analyticsEvents: analyticsRef.current,
        returningSession
      });
      setResult(completion);
      saveSession({
        userId: completion.userId,
        tenantId: completion.tenantId,
        workspaceId: completion.workspaceId,
        campaignId: completion.campaign.id,
        slug: completion.campaign.slug,
        mobileNumber: draft.mobileNumber,
        createdAt: new Date().toISOString()
      });
      trackEvent(completion.restored ? "trial_workspace_restored" : "trial_workspace_created", {
        campaignId: completion.campaign.id,
        slug: completion.campaign.slug
      });
      setStep(4);
      setCreationLog((current) => [...current, "Preparing share cards, QR code, short URL, and preview"]);
      await wait(520);
      setStep(5);
      setCreationLog((current) => [
        ...current,
        "Welcome messages and next steps are prepared"
      ]);
      window.localStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      provisionStartedRef.current = false;
      setStep(1);
      setOtpMessage(error instanceof Error ? error.message : "Campaign creation failed. Please try again.");
      trackEvent("onboarding_create_failed", {
        message: error instanceof Error ? error.message : "unknown"
      });
    } finally {
      setIsProvisioning(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied.`);
      trackEvent("share_asset_copied", { label });
    } catch {
      setCopyMessage("Copy failed. Select the link and copy it manually.");
    }
  }

  async function nativeShare() {
    if (!result) return;
    trackEvent("native_share_clicked", { campaignId: result.campaign.id });
    if (navigator.share) {
      try {
        await navigator.share({
          title: result.campaign.title,
          text: result.campaign.description,
          url: result.shareUrl
        });
        return;
      } catch {
        // User cancelled or share target failed. Copy fallback is below.
      }
    }
    await copyText("Campaign link", result.shareUrl);
  }

  function goBack() {
    if (step <= 0 || isProvisioning) return;
    setStep((current) => Math.max(0, current - 1));
  }

  if (!open) return null;

  const shareText = result ? buildShareText(result) : "";
  const encodedShareUrl = result ? encodeURIComponent(result.shareUrl) : "";
  const encodedShareText = encodeURIComponent(shareText);

  return (
    <AnimatePresence>
      <motion.div
        className="onboarding-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.section
          aria-modal="true"
          className="onboarding-shell"
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 18 }}
          role="dialog"
          aria-labelledby="onboarding-title"
        >
          <header className="onboarding-topbar">
            <button
              className="secondary-button icon-button"
              type="button"
              onClick={goBack}
              disabled={step === 0 || isProvisioning}
              aria-label="Go back"
              title="Go back"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <span className="eyebrow">Free campaign onboarding</span>
              <h2 id="onboarding-title">Create and publish your campaign in 60 seconds</h2>
            </div>
            <button
              className="secondary-button icon-button"
              type="button"
              onClick={onClose}
              disabled={isProvisioning}
              aria-label="Close onboarding"
              title="Close onboarding"
            >
              <X size={18} />
            </button>
          </header>

          <nav className="onboarding-progress" aria-label="Onboarding progress">
            {progressSteps.map((label, index) => (
              <span
                key={label}
                className={index <= step ? "active" : ""}
                aria-current={index === step ? "step" : undefined}
              >
                <strong>{index + 1}</strong>
                {label}
              </span>
            ))}
          </nav>

          <div className="onboarding-content" aria-live="polite">
            {step === 0 && (
              <form className="onboarding-form" onSubmit={submitBasics}>
                <div className="onboarding-intro-card">
                  <Sparkles size={24} />
                  <div>
                    <strong>No credit card. No password. Your public link comes first.</strong>
                    <p>Answer a few short fields. We verify your mobile number, create the trial workspace, and publish a share link.</p>
                  </div>
                </div>

                <label className="field">
                  <span className="label">Campaign Name</span>
                  <input
                    autoFocus
                    value={draft.campaignName}
                    onChange={(event) => updateDraft({ campaignName: event.target.value })}
                    placeholder="Save cows in Odisha"
                    aria-invalid={Boolean(errors.campaignName)}
                  />
                  {errors.campaignName && <small className="field-error">{errors.campaignName}</small>}
                </label>

                <label className="field">
                  <span className="label">Campaign Goal</span>
                  <textarea
                    value={draft.campaignGoal}
                    onChange={(event) => updateDraft({ campaignGoal: event.target.value })}
                    placeholder="Collect 2,000 supporters and submit a petition to the local authority."
                    rows={3}
                    aria-invalid={Boolean(errors.campaignGoal)}
                  />
                  {errors.campaignGoal && <small className="field-error">{errors.campaignGoal}</small>}
                </label>

                <div className="onboarding-two">
                  <label className="field">
                    <span className="label">Organization or Your Name</span>
                    <input
                      value={draft.businessName}
                      onChange={(event) => updateDraft({ businessName: event.target.value })}
                      placeholder="NGO, temple, school, hospital, business, or your name"
                      aria-invalid={Boolean(errors.businessName)}
                    />
                    {errors.businessName && <small className="field-error">{errors.businessName}</small>}
                  </label>
                  <label className="field">
                    <span className="label">Mobile Number</span>
                    <input
                      value={draft.mobileNumber}
                      onChange={(event) => updateDraft({ mobileNumber: event.target.value })}
                      placeholder="+91 98765 43210"
                      inputMode="tel"
                      aria-invalid={Boolean(errors.mobileNumber)}
                    />
                    {errors.mobileNumber && <small className="field-error">{errors.mobileNumber}</small>}
                  </label>
                </div>

                <div className="onboarding-two">
                  <label className="field">
                    <span className="label">Optional Email</span>
                    <input
                      value={draft.email}
                      onChange={(event) => updateDraft({ email: event.target.value })}
                      placeholder="you@example.com"
                      type="email"
                      aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && <small className="field-error">{errors.email}</small>}
                  </label>
                  <label className="field">
                    <span className="label">Language</span>
                    <select
                      value={draft.language}
                      onChange={(event) => updateDraft({ language: event.target.value })}
                    >
                      {languageOptions.map((language) => (
                        <option key={language} value={language}>{language}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span className="label">Country</span>
                  <select
                    value={draft.country}
                    onChange={(event) => updateDraft({ country: event.target.value })}
                  >
                    {countryOptions.map((country) => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                  <small>
                    Suggested from your browser language: {tracking.detectedCountry || "Unknown"} / {tracking.browserLanguage}
                  </small>
                </label>

                <div className="onboarding-actions">
                  <span><ShieldCheck size={16} /> Auto-save enabled</span>
                  <button className="primary-button" type="submit">
                    Continue to OTP <Smartphone size={18} />
                  </button>
                </div>
              </form>
            )}

            {step === 1 && (
              <section className="onboarding-verification">
                <div className="verification-card">
                  <Smartphone size={28} />
                  <div>
                    <span className="eyebrow">Passwordless verification</span>
                    <h3>Verify {maskPhone(draft.mobileNumber)}</h3>
                    <p>We will restore an existing trial workspace for this number or create a new one after verification.</p>
                  </div>
                </div>

                <div className="otp-provider-card">
                  <div>
                    <strong>Mobile verification</strong>
                    <span>OTP helps prevent spam, duplicate signatures, and misuse of campaign support.</span>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={sendOtp}
                    disabled={isSendingOtp || resendSeconds > 0}
                  >
                    {isSendingOtp ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                    {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : otpChallengeId ? "Resend OTP" : "Send OTP"}
                  </button>
                </div>

                {isDevelopmentOtpMode && developmentOtpCode && (
                  <div>
                    <span className="status-pill">Development Mode</span>
                    <p className="info-message">
                      Development OTP
                      <strong>{developmentOtpCode}</strong>
                    </p>
                  </div>
                )}

                <label className="field">
                  <span className="label">Enter OTP</span>
                  <input
                    value={otpInput}
                    onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6 digit code"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </label>

                {otpMessage && (
                  <p className={otpMessage.includes("Incorrect") || otpMessage.includes("Too many") ? "error-message" : "info-message"}>
                    {otpMessage.includes("Incorrect") || otpMessage.includes("Too many") ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    {otpMessage}
                  </p>
                )}

                <div className="onboarding-actions">
                  <button className="secondary-button" type="button" onClick={() => setStep(0)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button className="primary-button" type="button" onClick={verifyOtp} disabled={!otpChallengeId || otpInput.length < 6}>
                    Verify and publish campaign <Sparkles size={18} />
                  </button>
                </div>
              </section>
            )}

            {step >= 2 && step < 5 && (
              <section className="onboarding-provisioning">
                <div className="provisioning-hero">
                  <Loader2 className="spin" size={32} />
                  <div>
                    <span className="eyebrow">Working in the background</span>
                    <h3>{step === 2 ? "Creating your trial workspace" : "Generating your campaign assets"}</h3>
                    <p>We are setting up the campaign record, analytics context, public link, QR code, and welcome messages.</p>
                  </div>
                </div>
                <ProvisioningSkeleton />
                <ul className="creation-log">
                  {creationLog.map((item) => (
                    <li key={item}><CheckCircle2 size={16} /> {item}</li>
                  ))}
                </ul>
              </section>
            )}

            {step === 5 && result && (
              <section className="onboarding-success">
                <div className="success-hero">
                  <CheckCircle2 size={38} />
                  <div>
                    <span className="eyebrow">{result.restored ? "Workspace restored" : "Campaign published successfully"}</span>
                    <h3>{result.campaign.title}</h3>
                    <p>{result.campaign.description}</p>
                  </div>
                </div>

                <div className="created-campaign-grid">
                  <div className="created-link-card">
                    <span className="label">Share link</span>
                    <code>{result.shareUrl}</code>
                    <span className="label">Short URL</span>
                    <code>{result.shortUrl}</code>
                    <div className="button-row">
                      <a
                        className="primary-link-button"
                        href={`https://wa.me/?text=${encodedShareText}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => trackEvent("share_clicked", { channel: "whatsapp" })}
                      >
                        <Send size={16} /> Share on WhatsApp
                      </a>
                      <button className="secondary-button" type="button" onClick={() => copyText("Campaign link", result.shareUrl)}>
                        <ClipboardCopy size={16} /> Copy Link
                      </button>
                      <a className="secondary-link-button" href={result.shareUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={16} /> Open campaign
                      </a>
                    </div>
                  </div>
                  <div className="created-qr-card">
                    <QrPreview value={result.qrValue} />
                    <strong>QR code ready</strong>
                    <span>Use it on posters, counters, events, WhatsApp, and print material.</span>
                  </div>
                </div>

                {copyMessage && <p className="success-message">{copyMessage}</p>}

                <div className="share-option-grid" aria-label="Share campaign">
                  <a
                    className="secondary-link-button"
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodedShareUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackEvent("share_clicked", { channel: "facebook" })}
                  >
                    <Share2 size={16} /> Facebook
                  </a>
                  <button className="secondary-button" type="button" onClick={() => copyText("Instagram caption", shareText)}>
                    <Copy size={16} /> Instagram
                  </button>
                  <a
                    className="secondary-link-button"
                    href={`https://twitter.com/intent/tweet?text=${encodedShareText}&url=${encodedShareUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackEvent("share_clicked", { channel: "twitter_x" })}
                  >
                    <Share2 size={16} /> Twitter/X
                  </a>
                  <a
                    className="secondary-link-button"
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedShareUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackEvent("share_clicked", { channel: "linkedin" })}
                  >
                    <Share2 size={16} /> LinkedIn
                  </a>
                  <a
                    className="secondary-link-button"
                    href={`https://t.me/share/url?url=${encodedShareUrl}&text=${encodedShareText}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackEvent("share_clicked", { channel: "telegram" })}
                  >
                    <Send size={16} /> Telegram
                  </a>
                  <a
                    className="secondary-link-button"
                    href={`mailto:?subject=${encodeURIComponent(result.campaign.title)}&body=${encodedShareText}`}
                    onClick={() => trackEvent("share_clicked", { channel: "email" })}
                  >
                    <Mail size={16} /> Email
                  </a>
                  <a
                    className="secondary-link-button"
                    href={`sms:?body=${encodedShareText}`}
                    onClick={() => trackEvent("share_clicked", { channel: "sms" })}
                  >
                    <Smartphone size={16} /> SMS
                  </a>
                  <button className="secondary-button" type="button" onClick={nativeShare}>
                    <Globe2 size={16} /> Native Share
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => downloadQrPosterSvg({
                      campaign: result.campaign,
                      organizationName: result.organization.name,
                      url: result.shareUrl
                    })}
                  >
                    <Download size={16} /> Download Poster
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => downloadQrSvg(result.qrValue, `${result.campaign.slug}-qr.svg`)}
                  >
                    <QrCode size={16} /> Download QR
                  </button>
                </div>

                <div className="welcome-message-card">
                  <strong>Your next steps are ready</strong>
                  <span>Share the campaign link now. Trial details, upgrade options, and next steps are available from your workspace.</span>
                  <small>Trial ends on {result.trialEndsAt}. Dashboard access can wait; the campaign link works now.</small>
                </div>
              </section>
            )}
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}
