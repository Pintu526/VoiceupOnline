import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import {
  CERTIFICATE_WORDING_FIELDS,
  DEFAULT_CERTIFICATE_PLACEMENT,
  DEFAULT_CERTIFICATE_WORDING,
  GSAA_CERTIFICATE_ARTWORK,
  LEGACY_GSAA_CERTIFICATE_ARTWORK,
  normalizeCertificateWording,
  resolveCertificateArtwork
} from "../src/certificates/types.ts";
import {
  GSAA_CERTIFICATE_ARTWORK_EXCLUSIONS,
  certificateRectsOverlap,
  certificateTextRect,
  listCertificatePlacementCollisions,
  resolveCollisionSafeCertificatePlacement
} from "../src/certificates/layout.ts";

const read = (path, encoding = "utf8") => readFileSync(new URL(path, import.meta.url), encoding);
const migration = read("../supabase/migrations/20261105010000_campaign_participation_certificates.sql");
const edge = read("../supabase/functions/voiceup-certificates/index.ts");
const admin = read("../src/certificates/CampaignCertificateSettingsPanel.tsx");
const account = read("../src/certificates/MyCertificatesPanel.tsx");
const preview = read("../src/certificates/CertificatePreview.tsx");
const renderer = read("../src/certificates/render.ts");
const verification = read("../src/certificates/CertificateVerificationPage.tsx");
const campaigns = read("../src/pages/app/CampaignsTab.tsx");
const app = read("../src/App.tsx");

test("GSAA approved original is preserved and dynamic background is exact", () => {
  const artwork = read("../public/brands/gau-samman/gau-samman-participation-certificate-master.png", null);
  assert.equal(createHash("sha256").update(artwork).digest("hex"), "980adc4313c889b2a920c2ef827e409fd69c507b47035a985dd9242f3ae94725");
  assert.equal(artwork.readUInt32BE(16), 1536);
  assert.equal(artwork.readUInt32BE(20), 1024);
  const dynamicBackground = read("../public/brands/gau-samman/gau-samman-participation-certificate-dynamic-background.png", null);
  assert.equal(createHash("sha256").update(dynamicBackground).digest("hex"), "1f6280d98519a2d2f000d78867c54159e04746e0773c317a6bee4b9fb53e1d83");
  assert.equal(dynamicBackground.readUInt32BE(16), 1536);
  assert.equal(dynamicBackground.readUInt32BE(20), 1024);
  assert.match(migration, /gau-samman-participation-certificate-dynamic-background\.png/);
  assert.match(migration, /certificates_enabled,[\s\S]*select workspace_id, campaign_id, campaign_slug, false,/);
  assert.match(migration, /on conflict \(workspace_id, campaign_id\) do nothing/);
});

test("campaign certificate management is exact-admin-only", () => {
  const helper = migration.slice(migration.indexOf("voiceup_is_exact_campaign_admin"), migration.indexOf("voiceup_certificate_settings_payload"));
  assert.match(helper, /workspace_resource_members/);
  assert.match(helper, /assignment\.role = 'campaign_admin'/);
  assert.match(helper, /assignment\.resource_type = 'campaign'/);
  assert.match(helper, /assignment\.resource_id = target_campaign_id/);
  assert.match(helper, /member\.role = 'campaign_admin'/);
  assert.doesNotMatch(helper, /platform_owner|workspace_admin/);
  assert.match(campaigns, /isCampaignAdminRoute && campaignFormMode === "edit"[\s\S]*CampaignCertificateSettingsPanel/);
});

test("controls are disabled by default and artwork controls stay hidden until enabled", () => {
  assert.match(admin, /Enable Participation Certificates/);
  assert.match(admin, /settings\.certificatesEnabled && <div className="certificate-settings-grid"/);
  assert.match(admin, /settings\.certificatesEnabled && !settings\.artwork/);
  assert.match(admin, /Upload Certificate Image|Replace Certificate Image/);
  assert.match(admin, /Remove Image/);
  assert.match(admin, /Save Certificate Settings/);
});

test("existing admin designer supports localized content, typography, alignment and bounded positioning", () => {
  const api = read("../src/certificates/api.ts");
  for (const label of ["Font family", "Font size", "Style", "Text color", "Alignment", "Width %", "Height %"]) {
    assert.match(admin, new RegExp(label.replace("%", "\\%")));
  }
  assert.match(admin, /Sample data — not an issued certificate/);
  assert.match(admin, /Preview language/);
  assert.match(admin, /CERTIFICATE_WORDING_FIELDS\.map/);
  assert.match(admin, /updatePlacement/);
  assert.match(api, /placement: parsePlacement\(settings\.placement\)/);
  assert.match(api, /boundedNumber\(item\.fontSize, fallback\.fontSize, 6, 72\)/);
  assert.match(api, /width \/ 2, 100 - width \/ 2/);
  assert.match(renderer, /item\.fontFamily/);
  assert.match(renderer, /item\.fontWeight/);
  assert.match(renderer, /context\.fillStyle = item\.color/);
  assert.match(edge, /p_placement: stringRecord\(settings\.placement\)/);
  assert.match(migration, /template\.placement/);
});

test("storage writes are signed, scoped, and never browser-public", () => {
  assert.match(edge, /createSignedUploadUrl\(storagePath\)/);
  assert.match(edge, /const storagePath = `\$\{scope\.workspaceId\}\/\$\{scope\.campaignId\}\//);
  assert.doesNotMatch(migration, /create policy[\s\S]*storage\.objects/i);
  assert.match(migration, /revoke all on table public\.voiceup_campaign_certificate_settings from public, anon, authenticated/);
  assert.match(edge, /actualHash[\s\S]*sha256 !== actualHash/);
});

test("issuance is authenticated, owner-bound, eligible, tenant-scoped and idempotent", () => {
  const issue = migration.slice(migration.indexOf("voiceup_issue_owned_participation_certificate"), migration.indexOf("voiceup_list_owned_participation_certificates"));
  assert.match(issue, /auth\.uid\(\)/);
  assert.match(issue, /account\.id = p_account_id and account\.auth_user_id = v_actor/);
  assert.match(issue, /certificate\.workspace_id = v_account\.workspace_id/);
  assert.match(issue, /certificate\.campaign_id = v_account\.campaign_id/);
  assert.match(issue, /coalesce\(v_signer ->> 'status', ''\) <> 'verified'/);
  assert.match(issue, /supportSubmittedAt/);
  assert.match(issue, /signedAt/);
  assert.match(migration, /unique \(workspace_id, campaign_id, supporter_id\)/);
  assert.match(issue, /certificate_issue_replayed/);
});

test("paper participation remains eligible only after approval and canonical account linkage", () => {
  assert.match(migration, /voiceup_supporter_accounts/);
  assert.match(migration, /supporter_account_id uuid not null references public\.voiceup_supporter_accounts/);
  assert.match(migration, /coalesce\(v_signer ->> 'status', ''\) <> 'verified'/);
  assert.doesNotMatch(migration, /insert into public\.voiceup_supporter_accounts/);
  assert.doesNotMatch(migration, /jsonb_set\([^)]*signers/);
});

test("template versions are immutable historical snapshots and revocation is explicit", () => {
  assert.match(migration, /voiceup_campaign_certificate_templates/);
  assert.match(migration, /primary key \(workspace_id, campaign_id, configuration_version\)/);
  assert.match(migration, /on delete restrict/);
  assert.match(migration, /status text not null default 'valid' check \(status in \('valid', 'revoked'\)\)/);
  assert.match(migration, /voiceup_revoke_participation_certificate/);
  assert.match(migration, /certificate_revoked/);
});

test("public verification requires opaque reference and returns no private identity data", () => {
  const verifySql = migration.slice(migration.indexOf("voiceup_verify_public_certificate"), migration.indexOf("revoke all on function public.voiceup_read"));
  assert.match(verifySql, /verification_reference = p_verification_reference/);
  assert.match(verifySql, /'status'/);
  assert.match(verifySql, /'campaignName'/);
  assert.doesNotMatch(verifySql, /supporter_display_name|phone|email|supporter_account_id|supporterId/);
  assert.match(edge, /if \(action === "verify"\)/);
  assert.match(verification, /No private|certificateCopy/);
  assert.match(app, /CertificateVerificationPage/);
});

test("supporter account exposes all owned certificates without client-trusted supporter IDs", () => {
  assert.match(account, /manifest\.supporterOwnerships/);
  assert.match(account, /issueOwnedCertificate\(ownership\.accountId/);
  assert.match(account, /listOwnedCertificates\(\)/);
  assert.doesNotMatch(account, /supporterId/);
  assert.match(account, /View Certificate|copy\.view/);
  assert.match(account, /<CertificatePreview certificate=\{certificate\} language=\{certificate\.language\}/);
  assert.doesNotMatch(account, /<img src=\{certificate\.artwork\.url\}/);
  assert.match(account, /downloadCertificatePdf/);
  assert.match(account, /printCertificate/);
});

test("incomplete or unverifiable certificate payloads are rejected before display", () => {
  const api = read("../src/certificates/api.ts");
  assert.match(api, /!campaignName \|\| !supporterDisplayName/);
  assert.match(api, /\^VUC-\[A-F0-9\]\{20\}\$/);
  assert.match(api, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(api, /verificationPath !== `\/certificates\/verify\/\$\{certificateId\}\?ref=\$\{verificationReference\}`/);
});

test("English, Hindi and Odia use real QR, bundled fonts, PDF, print and sharing", () => {
  assert.match(preview, /renderCertificateCanvas\(certificate, language, verificationUrl\)/);
  assert.doesNotMatch(preview, /QrCodeGraphic|certificate-overlay/);
  assert.match(renderer, /QRCode\.toCanvas/);
  assert.match(renderer, /new jsPDF/);
  assert.match(renderer, /orientation: "landscape"/);
  assert.match(renderer, /window\.print\(\)/);
  assert.match(account, /navigator\.share/);
  assert.match(account, /https:\/\/wa\.me/);
  for (const font of ["NotoSans.ttf", "NotoSansDevanagari.ttf", "NotoSansOriya.ttf"]) {
    assert.ok(statSync(new URL(`../public/fonts/${font}`, import.meta.url)).size > 100_000);
  }
  assert.match(read("../src/certificates/types.ts"), /सहभागिता प्रमाणपत्र/);
  assert.match(read("../src/certificates/types.ts"), /ଅଂଶଗ୍ରହଣ ପ୍ରମାଣପତ୍ର/);
});

test("every visible certificate label has complete English, Hindi and Odia defaults", () => {
  for (const language of ["en", "hi", "or"]) {
    for (const field of CERTIFICATE_WORDING_FIELDS) {
      assert.ok(DEFAULT_CERTIFICATE_WORDING[language][field].trim(), `${language}.${field} must not be blank`);
    }
  }
  for (const field of ["intro", "campaignLabel", "qrHeading", "qrInstructions", "slogan", "footer"]) {
    assert.match(renderer, new RegExp(`wording\\.${field}`));
    assert.match(admin, new RegExp(field));
  }
  assert.match(renderer, /language === "hi"[\s\S]*language === "or"[\s\S]*"REVOKED"/);
});

test("language edits remain isolated, blank fields fall back, and save-reload normalization is stable", () => {
  const edited = normalizeCertificateWording({
    en: { ...DEFAULT_CERTIFICATE_WORDING.en, heading: "Custom English heading" },
    hi: { ...DEFAULT_CERTIFICATE_WORDING.hi, qrInstructions: "कस्टम QR निर्देश" },
    or: { ...DEFAULT_CERTIFICATE_WORDING.or, footer: "   " }
  });
  assert.equal(edited.en.heading, "Custom English heading");
  assert.equal(edited.hi.qrInstructions, "कस्टम QR निर्देश");
  assert.equal(edited.en.qrInstructions, DEFAULT_CERTIFICATE_WORDING.en.qrInstructions);
  assert.equal(edited.or.footer, DEFAULT_CERTIFICATE_WORDING.or.footer);

  const afterReload = normalizeCertificateWording(JSON.parse(JSON.stringify(edited)));
  assert.deepEqual(afterReload, edited);
  assert.match(admin, /setSettings\(\(current\) =>/);
  assert.match(admin, /normalizeCertificateWording\(settings\.wording\)/);
  assert.match(read("../src/certificates/api.ts"), /wording: normalizeCertificateWording\(settings\.wording(?:, settings\.issuer\.title)?\)/);
});

test("GSAA clean artwork replaces only the exact legacy bundled master", () => {
  const customArtwork = {
    ...LEGACY_GSAA_CERTIFICATE_ARTWORK,
    url: "https://example.invalid/custom-certificate.png",
    storagePath: "workspace/campaign/custom-certificate.png"
  };
  assert.deepEqual(
    resolveCertificateArtwork("gau-samman-ahvaan-abhiyan", LEGACY_GSAA_CERTIFICATE_ARTWORK),
    GSAA_CERTIFICATE_ARTWORK
  );
  assert.equal(resolveCertificateArtwork("gau-samman-ahvaan-abhiyan", customArtwork), customArtwork);
  assert.equal(resolveCertificateArtwork("another-campaign", LEGACY_GSAA_CERTIFICATE_ARTWORK), LEGACY_GSAA_CERTIFICATE_ARTWORK);
  assert.equal(resolveCertificateArtwork("gau-samman-ahvaan-abhiyan", null), null);
  assert.deepEqual(resolveCertificateArtwork("gau-samman-ahvaan-abhiyan", null, true), GSAA_CERTIFICATE_ARTWORK);
});

test("dynamic overlay zones remain ordered and non-overlapping in preview, PDF and print", () => {
  const placement = DEFAULT_CERTIFICATE_PLACEMENT;
  const regionHeights = {
    heading: 4, intro: 2.8, name: 5.5, acknowledgement: 4,
    campaignLabel: 2.2, campaign: 5, slogan: 3.5,
    date: 4, certificateId: 4, issuer: 5
  };
  const assertOrdered = (keys) => keys.slice(1).forEach((key, index) => {
    const previous = keys[index];
    const previousBottom = placement[previous].y + regionHeights[previous] / 2;
    const nextTop = placement[key].y - regionHeights[key] / 2;
    assert.ok(previousBottom < nextTop, `${previous} must not overlap ${key}`);
  });
  assertOrdered(["heading", "intro", "name", "acknowledgement", "campaignLabel", "campaign", "slogan"]);
  assertOrdered(["date", "certificateId", "issuer"]);
  const qrRight = placement.qr.x + placement.qr.width;
  const qrTextLeft = Math.min(
    placement.qrHeading.x - placement.qrHeading.width / 2,
    placement.qrInstructions.x - placement.qrInstructions.width / 2
  );
  assert.ok(qrRight < qrTextLeft);
  assert.match(preview, /preview\.getContext\("2d"\)\?\.drawImage\(rendered, 0, 0\)/);
  assert.match(renderer, /resolveCollisionSafeCertificatePlacement/);
  assert.match(renderer, /renderCertificateCanvas\(certificate, language, verificationUrl\)/);
  assert.match(renderer, /CERTIFICATE_TEXT_LINE_LIMITS/);
  assert.match(renderer, /CERTIFICATE_TEXT_REGION_HEIGHTS/);
  assert.match(renderer, /const scale = canvas\.width \/ artworkWidth/);
  assert.match(renderer, /const lineHeight = fontSize \* 1\.24/);
  assert.match(renderer, /item\.x - item\.width \/ 2/);
  assert.doesNotMatch(renderer, /item\.fontSize \* 2\.2/);
  assert.doesNotMatch(renderer, /certificate\.campaignSlug === "gau-samman-ahvaan-abhiyan"/);
});

test("saved issued placement remains authoritative unless a legacy collision needs packing", () => {
  const custom = structuredClone(DEFAULT_CERTIFICATE_PLACEMENT);
  custom.heading.x = 49;
  const unchanged = resolveCollisionSafeCertificatePlacement(custom);
  assert.equal(unchanged.placement.heading.x, 49);
  assert.equal(unchanged.placement.heading.y, DEFAULT_CERTIFICATE_PLACEMENT.heading.y);
  assert.equal(unchanged.adjustedRoles.length, 0);

  const colliding = structuredClone(DEFAULT_CERTIFICATE_PLACEMENT);
  colliding.name.y = colliding.intro.y;
  assert.ok(listCertificatePlacementCollisions(colliding).length > 0);
  const repaired = resolveCollisionSafeCertificatePlacement(colliding);
  assert.ok(repaired.adjustedRoles.includes("name"));
  assert.equal(listCertificatePlacementCollisions(repaired.placement).length, 0);
});

test("GSAA text avoids exact artwork decorations without rewriting issued snapshots", () => {
  const issuedSnapshot = structuredClone(DEFAULT_CERTIFICATE_PLACEMENT);
  issuedSnapshot.acknowledgement.y = 47.1;
  const originalSnapshot = structuredClone(issuedSnapshot);
  const resolved = resolveCollisionSafeCertificatePlacement(
    issuedSnapshot,
    GSAA_CERTIFICATE_ARTWORK.width / GSAA_CERTIFICATE_ARTWORK.height,
    GSAA_CERTIFICATE_ARTWORK_EXCLUSIONS
  );

  assert.deepEqual(issuedSnapshot, originalSnapshot, "render-time correction must not mutate the issued snapshot");
  assert.ok(resolved.adjustedRoles.includes("acknowledgement"));
  for (const exclusion of GSAA_CERTIFICATE_ARTWORK_EXCLUSIONS) {
    for (const role of exclusion.roles) {
      assert.equal(
        certificateRectsOverlap(certificateTextRect(resolved.placement[role]), exclusion.rect, 0.15),
        false,
        `${role} must avoid ${exclusion.id}`
      );
    }
  }
  assert.equal(listCertificatePlacementCollisions(resolved.placement).length, 0);
});

test("GSAA defaults keep readable type sizes and the renderer measures the saved box", () => {
  const textRoles = Object.keys(DEFAULT_CERTIFICATE_PLACEMENT).filter((key) => key !== "layoutVersion" && key !== "qr");
  for (const role of textRoles) {
    assert.ok(DEFAULT_CERTIFICATE_PLACEMENT[role].fontSize >= 7, `${role} must have a readable configured size`);
  }
  assert.ok(DEFAULT_CERTIFICATE_PLACEMENT.heading.fontSize >= 30);
  assert.ok(DEFAULT_CERTIFICATE_PLACEMENT.name.fontSize >= 38);
  assert.ok(DEFAULT_CERTIFICATE_PLACEMENT.acknowledgement.fontSize >= 16);
  assert.ok(DEFAULT_CERTIFICATE_PLACEMENT.campaign.fontSize >= 24);
  assert.match(renderer, /CERTIFICATE_MIN_READABLE_FONT_SIZES/);
  assert.match(renderer, /const maxHeight = canvas\.height \* item\.height \/ 100/);
  assert.match(renderer, /usesExactGsaaArtwork \? GSAA_CERTIFICATE_ARTWORK_EXCLUSIONS : \[\]/);
  assert.match(renderer, /VoiceUp Noto Devanagari/);
  assert.match(renderer, /VoiceUp Noto Oriya/);
});

test("certificate UI remains generic Campaign Management rather than Business OS", () => {
  const certificateUi = [
    read("../src/certificates/MyCertificatesPanel.tsx"),
    read("../src/certificates/CertificateVerificationPage.tsx"),
    read("../src/certificates/CampaignCertificateSettingsPanel.tsx")
  ].join("\n");
  assert.match(certificateUi, /Campaign Management/);
  assert.doesNotMatch(certificateUi, /Business OS/);
});

test("migration is additive and does not weaken existing RLS", () => {
  assert.doesNotMatch(migration, /drop table|truncate|disable row level security|alter table[^;]*drop column/i);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on table public\.voiceup_participation_certificates from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.voiceup_verify_public_certificate[\s\S]*to anon, authenticated, service_role/);
});

