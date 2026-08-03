import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  GAUMATA_PUBLIC_HOSTNAMES,
  GOUDHAN_CAMPAIGN_SLUG,
  isGaumataPublicHostname,
  isGoudhanProductionCampaign
} from "../src/config/goudhanProduction.ts";
import {
  goudhanCampaignBlueprint,
  goudhanGauSammanCampaign,
  goudhanProductionOrganization
} from "../src/config/goudhanCampaignBlueprint.ts";
import { initialCampaigns, initialOrganization } from "../src/data.ts";
import { campaignTemplates } from "../src/campaignTemplates.ts";
import { blankSigner } from "../src/constants/index.ts";
import {
  emptyLocationDeletions,
  getBlockOptions,
  getDistrictOptions,
  getPanchayatOptions
} from "../src/geography.ts";
import { getPublicCampaignUrlForOrigin } from "../src/utils/links.ts";
import { resolvePublicCampaignSlug } from "../src/utils/routing.ts";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const publicCampaignSource = readSource("../src/pages/PublicCampaignPage.tsx");
const indiaLocationSource = readSource("../src/components/IndiaLocationFields.tsx");
const appShellSource = readSource("../src/layouts/AppShell.tsx");
const commandCenterSource = readSource("../src/pages/app/CommandCenterTab.tsx");
const supporterProfileSource = readSource("../src/growth/supporter/SupporterGrowthPortalPage.tsx");
const otpSource = readSource("../supabase/functions/voiceup-otp/index.ts");
const appSource = readSource("../src/App.tsx");
const backendSource = readSource("../src/backend.ts");
const authoritySource = readSource("../src/utils/authority.ts");
const referralSource = readSource("../src/utils/referrals.ts");
const locales = Object.fromEntries(
  ["en", "hi", "or"].map((language) => [
    language,
    JSON.parse(readSource(`../src/i18n/locales/${language}.json`))
  ])
);

test("Goudhan campaign detection is scoped and does not change unrelated VoiceUp campaigns", () => {
  assert.equal(GOUDHAN_CAMPAIGN_SLUG, "gau-samman-ahvaan-abhiyan");
  assert.equal(
    isGoudhanProductionCampaign({ slug: GOUDHAN_CAMPAIGN_SLUG, title: "Campaign" }),
    true
  );
  assert.equal(
    isGoudhanProductionCampaign({ slug: "another-campaign", title: "Another campaign" }),
    false
  );
  assert.equal(
    isGoudhanProductionCampaign(
      { slug: "enact-prevention-of-cow-slaughter-act-2024", title: "Enact Prevention of Cow Slaughter Act 2024" },
      { customDomain: "goudhan.com" }
    ),
    false
  );
  assert.equal(isGoudhanProductionCampaign(undefined, { customDomain: "goudhan.com" }), false);
});

test("gaumata.cloud root resolves only to the existing Gau Samman public campaign", () => {
  assert.deepEqual(GAUMATA_PUBLIC_HOSTNAMES, ["gaumata.cloud", "www.gaumata.cloud"]);
  assert.equal(isGaumataPublicHostname("GAUMATA.CLOUD"), true);
  assert.equal(isGaumataPublicHostname("www.gaumata.cloud."), true);
  assert.equal(
    resolvePublicCampaignSlug({ pathname: "/", hostname: "gaumata.cloud" }),
    "GSAA"
  );
  assert.equal(
    resolvePublicCampaignSlug({ pathname: "/", hostname: "www.gaumata.cloud" }),
    "GSAA"
  );

  for (const hostname of [
    "voiceup.live",
    "www.voiceup.live",
    "voiceup-preview.vercel.app",
    "localhost"
  ]) {
    assert.equal(resolvePublicCampaignSlug({ pathname: "/", hostname }), "");
  }
});

test("hostname entry does not intercept direct campaign, supporter, app, admin or login routes", () => {
  for (const hostname of ["gaumata.cloud", "www.gaumata.cloud", "voiceup.live"]) {
    assert.equal(
      resolvePublicCampaignSlug({
        pathname: `/c/${GOUDHAN_CAMPAIGN_SLUG}`,
        hostname
      }),
      GOUDHAN_CAMPAIGN_SLUG
    );
    for (const pathname of ["/r/VU-TEST", "/app", "/admin", "/login"]) {
      assert.equal(resolvePublicCampaignSlug({ pathname, hostname }), "");
    }
  }
});

test("campaign, referral, QR and share links preserve the gaumata.cloud origin", () => {
  assert.equal(
    getPublicCampaignUrlForOrigin(GOUDHAN_CAMPAIGN_SLUG, {
      runtimeOrigin: "https://gaumata.cloud",
      runtimeHostname: "gaumata.cloud",
      production: true
    }),
    `https://gaumata.cloud/c/${GOUDHAN_CAMPAIGN_SLUG}`
  );
  assert.equal(
    getPublicCampaignUrlForOrigin(GOUDHAN_CAMPAIGN_SLUG, {
      runtimeOrigin: "https://www.gaumata.cloud",
      runtimeHostname: "www.gaumata.cloud",
      production: true
    }),
    `https://www.gaumata.cloud/c/${GOUDHAN_CAMPAIGN_SLUG}`
  );

  assert.match(referralSource, /const publicUrl = getCampaignPublicUrl\(organization, campaign\)/);
  assert.match(referralSource, /\?ref=\$\{encodeURIComponent\(normalizedReferral\)\}/);
  assert.match(publicCampaignSource, /ReferralQrPreview value=\{personalReferralUrl\}/);
  assert.match(publicCampaignSource, /url:\s*personalReferralUrl/);
  assert.match(publicCampaignSource, /shareLinks\.whatsapp/);
  assert.match(publicCampaignSource, /personalReferralUrl,\s*"copy"\)/);
});

test("Goudhan public content has exact English, Hindi and Odia key parity", () => {
  const englishKeys = Object.keys(locales.en.goudhanCampaign).sort();
  assert.deepEqual(Object.keys(locales.hi.goudhanCampaign).sort(), englishKeys);
  assert.deepEqual(Object.keys(locales.or.goudhanCampaign).sort(), englishKeys);

  for (const language of ["en", "hi", "or"]) {
    for (const key of englishKeys) {
      const value = locales[language].goudhanCampaign[key];
      assert.equal(typeof value, "string");
      assert.ok(value.trim(), `${language}.goudhanCampaign.${key} must not be empty`);
      assert.doesNotMatch(value, /^goudhanCampaign\./);
    }
  }
});

test("production blueprint contains the reusable campaign capabilities and approved assets", () => {
  assert.equal(goudhanCampaignBlueprint.branding.brandName, "Goudhan.com");
  assert.equal(goudhanProductionOrganization.customDomain, "gaumata.cloud");
  assert.equal(goudhanCampaignBlueprint.campaign.slug, GOUDHAN_CAMPAIGN_SLUG);
  assert.equal(goudhanCampaignBlueprint.joinFlow.otpMode, "production");
  assert.equal(goudhanCampaignBlueprint.joinFlow.duplicatePolicy, "one_supporter_per_campaign_phone");
  assert.deepEqual(
    goudhanCampaignBlueprint.capabilities.reports,
    ["team", "supporters", "growth", "pdf", "csv"]
  );
  for (const moduleKey of [
    "document_intelligence",
    "ocr",
    "field_collection",
    "growth_experiments",
    "ai_experiments",
    "developer_pages",
    "demo_pages"
  ]) {
    assert.ok(goudhanCampaignBlueprint.hiddenModules.includes(moduleKey));
  }
  assert.deepEqual(
    goudhanCampaignBlueprint.hierarchy.map((item) => item.role),
    [
      "national_coordinator",
      "state_coordinator",
      "district_coordinator",
      "block_coordinator",
      "panchayat_coordinator",
      "ward_coordinator",
      "field_coordinator"
    ]
  );
  assert.equal(existsSync("public/brands/goudhan/logo.svg"), true);
  assert.equal(existsSync("public/brands/goudhan/gau-samman-hero.svg"), true);
  assert.doesNotMatch(
    readFileSync("public/brands/goudhan/gau-samman-hero.svg", "utf8"),
    /<text\b/,
    "the shared hero must not embed one language into every localized page"
  );
});

test("gaumata.cloud uses configured authority data and presents missing authority neutrally", () => {
  assert.match(authoritySource, /export function getConfiguredAppealAuthority/);
  assert.match(authoritySource, /return getAuthorityOptionsForCampaign\(campaign, authorities\)\[0\]/);
  assert.match(appSource, /getConfiguredAppealAuthority\(activeCampaign, authorities\)/);
  assert.match(
    publicCampaignSource,
    /showNeutralAuthority\s*=\s*\r?\n?\s*isGaumataCampaignExperience && !hasConfiguredAuthority/
  );
  assert.match(publicCampaignSource, /t\("public\.authorityNotConfigured"\)/);
  assert.match(publicCampaignSource, /t\("public\.authorityNotConfiguredHelp"\)/);
  assert.match(publicCampaignSource, /data-gaumata-host=\{isGaumataCampaignExperience/);
  assert.match(publicCampaignSource, /t\("goudhanCampaign\.poweredByVoiceUp"\)/);

  for (const language of ["en", "hi", "or"]) {
    assert.ok(locales[language].public.authorityNotConfigured.trim());
    assert.ok(locales[language].public.authorityNotConfiguredHelp.trim());
    assert.ok(locales[language].goudhanCampaign.poweredByVoiceUp.trim());
  }
});

test("public campaign loading uses the existing public Edge Function", () => {
  const start = backendSource.indexOf("export async function loadPublicCampaign");
  const end = backendSource.indexOf("\nexport async function requestOtp", start);
  const implementation = backendSource.slice(start, end);
  assert.match(implementation, /functions\.invoke<[\s\S]*>\("voiceup-public-campaign"/);
  assert.doesNotMatch(implementation, /findPublishedCampaignBySlug/);
});

test("the first Goudhan campaign instance is published through existing initial campaign data", () => {
  assert.equal(goudhanGauSammanCampaign.title, "गौ सम्मान आह्वान अभियान");
  assert.equal(goudhanGauSammanCampaign.slug, "gau-samman-ahvaan-abhiyan");
  assert.equal(goudhanGauSammanCampaign.status, "Published");
  assert.equal(goudhanGauSammanCampaign.country, "India");
  assert.deepEqual(
    goudhanGauSammanCampaign.requiredFields,
    ["phone", "name", "state", "district", "block", "panchayat"]
  );
  assert.equal(initialCampaigns[0]?.id, goudhanGauSammanCampaign.id);
  assert.equal(initialOrganization.id, goudhanProductionOrganization.id);
  assert.equal(
    campaignTemplates.some(
      (template) =>
        template.productionBlueprint?.id === goudhanCampaignBlueprint.id
    ),
    true
  );
});

test("Goudhan presentation reuses the existing signing, referral, QR, profile and coordinator paths", () => {
  assert.match(publicCampaignSource, /isGoudhanProductionCampaign\(campaign, organization\)/);
  assert.match(publicCampaignSource, /campaign:\s*displayCampaign/);
  assert.match(publicCampaignSource, /getCampaignReferralUrl\(organization, campaign, personalReferralCode\)/);
  assert.match(publicCampaignSource, /ReferralQrPreview/);
  assert.match(publicCampaignSource, /shareLinks\.whatsapp/);
  assert.match(publicCampaignSource, /href=\{`\/r\/\$\{encodeURIComponent\(personalReferralCode\)\}`\}/);
  assert.match(publicCampaignSource, /onSubmitCoordinatorApplication/);
  assert.match(publicCampaignSource, /<PublicSupporterPhoto/);
  assert.match(publicCampaignSource, /renderCampaignMessage\(t\("goudhanCampaign\.latestUpdate"\)/);
  assert.match(supporterProfileSource, /isGoudhanProductionCampaign\(portal\.campaign, portal\.organization\)/);
  assert.match(supporterProfileSource, /portal\.tree\.network\.directNetwork/);
  assert.match(supporterProfileSource, /portal\.impact\.signaturesInfluenced/);
  const goudhanProfileStart = supporterProfileSource.indexOf("if (isGoudhanExperience)");
  const standardProfileMatch = supporterProfileSource
    .slice(goudhanProfileStart)
    .match(/\r?\n  return \(\r?\n    <main className="supporter-portal-shell">/);
  assert.ok(standardProfileMatch, "standard supporter profile boundary must exist");
  const standardProfileStart =
    goudhanProfileStart + standardProfileMatch.index;
  const goudhanProfile = supporterProfileSource.slice(goudhanProfileStart, standardProfileStart);
  assert.doesNotMatch(goudhanProfile, /\b(wallet|reward|rank|projection|estimated earnings)\b/i);
  assert.match(publicCampaignSource, /displayCampaign\.consentText/);
});

test("unfinished modules are hidden only behind the Goudhan campaign gate", () => {
  assert.match(appShellSource, /const showUnfinishedModules = !isGoudhanExperience/);
  for (const tab of ["fund", "prove", "growth", "scans", "ideas"]) {
    assert.match(appShellSource, new RegExp(`showUnfinishedModules[\\s\\S]{0,400}?tab=\\"${tab}\\"`));
  }
  assert.match(commandCenterSource, /showUnfinishedModules && <FrameworkLinkCard/);
  assert.match(commandCenterSource, /showUnfinishedModules && pendingScans/);
});

test("production OTP fails closed when no SMS webhook is configured", () => {
  const sendResponseStart = otpSource.indexOf("return jsonResponse({", otpSource.indexOf('if (action === "send")'));
  const sendResponseEnd = otpSource.indexOf("\n        });", sendResponseStart);
  const sendResponseSource = otpSource.slice(sendResponseStart, sendResponseEnd);

  assert.match(otpSource, /if \(!webhookUrl\) throw new Error\("OTP provider is not configured\."\)/);
  assert.doesNotMatch(otpSource, /if \(!webhookUrl\) return/);
  assert.match(otpSource, /const SHOW_GSAA_OTP = Deno\.env\.get\("VOICEUP_SHOW_OTP"\) === "true"/);
  assert.match(
    sendResponseSource,
    /purpose === "public-signing" && publicSlug === "GSAA" && SHOW_GSAA_OTP\s*\? \{ otp: code \}\s*: \{\}/
  );
  assert.equal((otpSource.match(/\botp:\s*code\b/g) ?? []).length, 1);
  assert.match(otpSource, /error: "Verification service is temporarily unavailable\. Please retry\."/);
});

test("GSAA alone selects verified India hierarchy fields while global campaigns keep their existing component", () => {
  const locationStart = publicCampaignSource.indexOf("const locationFields =");
  const locationEnd = publicCampaignSource.indexOf("\n\n  useEffect(", locationStart);
  const locationSource = publicCampaignSource.slice(locationStart, locationEnd);

  assert.match(locationSource, /isGoudhanExperience \? \(\s*<IndiaLocationFields/);
  assert.match(locationSource, /fixedCountry="India"/);
  assert.match(locationSource, /verifiedSuggestionsOnly/);
  assert.match(locationSource, /\) : isGlobalMode \? \(\s*<GlobalLocationFields/);
  assert.equal(isGoudhanProductionCampaign({ slug: "GSAA", title: "Campaign" }), true);
  assert.equal(isGoudhanProductionCampaign({ slug: "other", title: "Other campaign" }), false);
});

test("verified geography suggestions follow State, District and Block without synthetic or custom fallbacks", () => {
  const overrides = {
    Odisha: {
      Khordha: {
        "Invented Block": ["Invented Ward"]
      }
    }
  };

  assert.ok(getDistrictOptions("Bihar", {}, emptyLocationDeletions, true).includes("Patna"));
  assert.ok(!getDistrictOptions("Odisha", {}, emptyLocationDeletions, true).includes("Patna"));
  assert.deepEqual(
    getBlockOptions("Bihar", "Patna", {}, emptyLocationDeletions, true),
    ["Bihta", "Patna Sadar"]
  );
  assert.deepEqual(
    getPanchayatOptions("Bihar", "Patna", "Bihta", {}, emptyLocationDeletions, true),
    ["Bishunpura", "Katesar", "Painal"]
  );
  assert.deepEqual(getBlockOptions("Odisha", "Khordha", overrides, emptyLocationDeletions, true), []);
  assert.deepEqual(
    getPanchayatOptions("Odisha", "Khordha", "Invented Block", overrides, emptyLocationDeletions, true),
    []
  );
  assert.ok(getBlockOptions("Odisha", "Khordha").includes("Khordha Sadar"));
  assert.ok(getPanchayatOptions("Odisha", "Khordha", "Khordha Rural Block").includes("Khordha Rural Block Ward 1"));
});

test("GSAA manual fallback preserves editable lower levels, location strings and translated locality labels", () => {
  assert.match(
    indiaLocationSource,
    /!verifiedSuggestionsOnly && districtOptions\.length === 0/
  );
  assert.match(
    indiaLocationSource,
    /!verifiedSuggestionsOnly && blockOptions\.length === 0/
  );
  assert.match(
    indiaLocationSource,
    /!verifiedSuggestionsOnly && panchayatOptions\.length === 0/
  );
  assert.match(indiaLocationSource, /<input value=\{fixedCountry\} readOnly/);
  assert.match(indiaLocationSource, /value=\{values\.postalCode\}/);
  assert.match(publicCampaignSource, /value=\{publicForm\.address\}/);

  for (const field of ["country", "state", "district", "block", "panchayat", "address", "postalCode"]) {
    assert.ok(Object.hasOwn(blankSigner, field), `existing signer field ${field} must remain supported`);
  }
  for (const language of ["en", "hi", "or"]) {
    assert.ok(locales[language].goudhanCampaign.villageLabel.trim());
    assert.ok(locales[language].goudhanCampaign.villagePlaceholder.trim());
  }
});

test("GSAA location parent changes clear stale PIN and GPS remains optional and non-blocking", () => {
  const selectStateSource = indiaLocationSource.slice(
    indiaLocationSource.indexOf("function selectState"),
    indiaLocationSource.indexOf("function selectDistrict")
  );
  const selectDistrictSource = indiaLocationSource.slice(
    indiaLocationSource.indexOf("function selectDistrict"),
    indiaLocationSource.indexOf("function selectBlock")
  );
  const selectBlockSource = indiaLocationSource.slice(
    indiaLocationSource.indexOf("function selectBlock"),
    indiaLocationSource.indexOf("function updatePin")
  );

  assert.match(selectStateSource, /district: "",\s*block: "",\s*panchayat: "",\s*postalCode: ""/);
  assert.match(selectDistrictSource, /block: "",\s*panchayat: "",\s*postalCode: ""/);
  assert.match(selectBlockSource, /panchayat: "",\s*postalCode: ""/);
  assert.match(publicCampaignSource, /onClick=\{requestSmartLocation\}/);
  assert.match(publicCampaignSource, /async function requestSmartLocation\(\)/);
  assert.match(
    publicCampaignSource,
    /catch \{\s*setLocationAccuracy\(null\);\s*setLocationMessage\(experienceCopy\.locationUnavailable\);\s*\}/
  );
});
