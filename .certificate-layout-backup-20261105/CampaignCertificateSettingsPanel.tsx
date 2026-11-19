import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Save, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { Campaign } from "../types";
import type { Language } from "../i18n";
import { CertificateApiError, certificateVerificationUrl, readCampaignCertificateSettings, saveCampaignCertificateSettings, uploadCertificateArtwork } from "./api";
import { CertificatePreview } from "./CertificatePreview";
import {
  CERTIFICATE_WORDING_FIELDS,
  createDefaultCertificateSettings,
  normalizeCertificateWording,
  type CampaignCertificateSettings,
  type CertificateLocalizedWording,
  type ParticipationCertificate
} from "./types";

const WORDING_FIELD_LABELS: Record<keyof CertificateLocalizedWording, string> = {
  heading: "Certificate heading",
  intro: "Introductory description",
  acknowledgement: "Participation acknowledgement",
  campaignLabel: "Campaign label",
  participationDateLabel: "Participation date label",
  certificateIdLabel: "Certificate ID label",
  issuerLabel: "Issuer label",
  qrHeading: "QR heading",
  qrInstructions: "QR verification instructions",
  slogan: "Campaign slogan",
  footer: "Certificate footer"
};

const MULTILINE_WORDING_FIELDS = new Set<keyof CertificateLocalizedWording>([
  "acknowledgement",
  "qrInstructions",
  "slogan",
  "footer"
]);

const PLACEMENT_KEYS = [
  "heading",
  "intro",
  "name",
  "acknowledgement",
  "campaignLabel",
  "campaign",
  "date",
  "certificateId",
  "issuer",
  "qrHeading",
  "qrInstructions",
  "slogan",
  "footer"
] as const;

export function CampaignCertificateSettingsPanel({ campaign, workspaceId }: { campaign: Campaign; workspaceId: string }) {
  const scope = useMemo(() => ({ workspaceId, campaignId: campaign.id, campaignSlug: campaign.slug }), [workspaceId, campaign.id, campaign.slug]);
  const [settings, setSettings] = useState<CampaignCertificateSettings>(() => createDefaultCertificateSettings(scope));
  const [language, setLanguage] = useState<Language>("en");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { let active = true; setLoading(true); void readCampaignCertificateSettings(scope).then((value) => { if (active) setSettings(value); }).catch((error) => { if (active) setMessage(error instanceof CertificateApiError ? error.message : "Certificate settings are unavailable."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [scope]);
  const preview = useMemo<ParticipationCertificate | null>(() => settings.artwork ? ({ id: "preview", certificateId: "PREVIEW-0001", campaignId: campaign.id, campaignSlug: campaign.slug, campaignName: campaign.title, supporterDisplayName: "Sample Supporter Name", participationDate: new Date().toISOString(), issuedAt: new Date().toISOString(), status: "valid", language, configurationVersion: settings.configurationVersion, verificationReference: "preview", verificationPath: "/certificates/verify/preview?ref=preview", artwork: settings.artwork, wording: normalizeCertificateWording(settings.wording), issuer: settings.issuer, placement: settings.placement, revokedAt: null, revocationReason: null }) : null, [campaign.id, campaign.slug, campaign.title, language, settings]);
  function updateWording(field: keyof CertificateLocalizedWording, value: string) {
    setSettings((current) => ({
      ...current,
      wording: {
        ...current.wording,
        [language]: { ...current.wording[language], [field]: value }
      }
    }));
  }
  async function upload(file: File) { setMessage(""); setSaving(true); try { const artwork = await uploadCertificateArtwork(scope, file); setSettings((current) => ({ ...current, artwork })); } catch (error) { setMessage(error instanceof Error ? error.message : "Artwork upload failed."); } finally { setSaving(false); } }
  async function save() { if (settings.certificatesEnabled && !settings.artwork) { setMessage("Upload valid certificate artwork before enabling issuance."); return; } setSaving(true); setMessage(""); try { setSettings(await saveCampaignCertificateSettings(settings)); setMessage("Certificate settings saved securely."); } catch (error) { setMessage(error instanceof Error ? error.message : "Certificate settings could not be saved."); } finally { setSaving(false); } }
  return <section className="certificate-admin-panel" aria-labelledby="certificate-admin-title">
    <div className="certificate-admin-heading"><div><span className="eyebrow">Campaign-owned feature</span><h4 id="certificate-admin-title">Participation certificates</h4><p className="helper-text">Only the exact assigned Campaign Admin can change these campaign-scoped settings.</p></div><ShieldCheck size={28} aria-hidden="true" /></div>
    {loading ? <p>Loading certificate settings…</p> : <>
      <label className="toggle-row certificate-enable-toggle"><input type="checkbox" checked={settings.certificatesEnabled} onChange={(event) => setSettings({ ...settings, certificatesEnabled: event.target.checked })} /><span><strong>Enable Participation Certificates</strong><small>Off by default. Issuance also requires valid artwork.</small></span></label>
      {settings.certificatesEnabled && <div className="certificate-settings-grid"><div className="certificate-settings-controls">
        <label className="drop-zone compact-drop"><Upload size={24} /><strong>{settings.artwork ? "Replace Certificate Image" : "Upload Certificate Image"}</strong><span>PNG, JPEG or WebP; up to 12 MB.</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
        {settings.artwork && <button className="secondary-button" type="button" onClick={() => setSettings({ ...settings, certificatesEnabled: false, artwork: null })}><Trash2 size={16} /> Remove Image</button>}
        <label>Preview language<select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="or">ଓଡ଼ିଆ</option></select></label>
        <fieldset className="certificate-wording-fields" data-certificate-language={language}><legend>Dynamic wording for this language</legend>{CERTIFICATE_WORDING_FIELDS.map((field) => <label key={field}>{WORDING_FIELD_LABELS[field]}{MULTILINE_WORDING_FIELDS.has(field)
          ? <textarea rows={field === "acknowledgement" || field === "qrInstructions" ? 3 : 2} value={settings.wording[language][field]} onChange={(event) => updateWording(field, event.target.value)} />
          : <input value={settings.wording[language][field]} onChange={(event) => updateWording(field, event.target.value)} />}</label>)}</fieldset>
        <label>Issuer name<input value={settings.issuer.name} onChange={(event) => setSettings({ ...settings, issuer: { ...settings.issuer, name: event.target.value } })} /></label>
        <label>Issuer title<input value={settings.issuer.title} onChange={(event) => setSettings({ ...settings, issuer: { ...settings.issuer, title: event.target.value } })} /></label>
        <details><summary>Safe content placement</summary><p className="helper-text">Values are percentages of the artwork. Preview, PDF and print all use this same layout.</p>{PLACEMENT_KEYS.map((key) => <div className="certificate-placement-row" key={key}><strong>{key}</strong><label>X <input type="number" min="0" max="100" value={settings.placement[key].x} onChange={(event) => setSettings((current) => ({ ...current, placement: { ...current.placement, [key]: { ...current.placement[key], x: Number(event.target.value) } } }))} /></label><label>Y <input type="number" min="0" max="100" value={settings.placement[key].y} onChange={(event) => setSettings((current) => ({ ...current, placement: { ...current.placement, [key]: { ...current.placement[key], y: Number(event.target.value) } } }))} /></label></div>)}</details>
      </div><div className="certificate-admin-preview"><span className="eyebrow"><ImageIcon size={14} /> Preview Certificate</span>{preview ? <CertificatePreview certificate={preview} language={language} verificationUrl={certificateVerificationUrl(preview)} /> : <div className="certificate-artwork-empty">Upload certificate artwork to preview.</div>}</div></div>}
      <div className="certificate-admin-actions"><button className="primary-button" type="button" disabled={saving || (settings.certificatesEnabled && !settings.artwork)} onClick={() => void save()}><Save size={16} /> {saving ? "Saving…" : "Save Certificate Settings"}</button>{message && <p role="status">{message}</p>}</div>
    </>}
  </section>;
}

