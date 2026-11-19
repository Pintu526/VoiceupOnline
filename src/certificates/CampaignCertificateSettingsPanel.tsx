import { useEffect, useMemo, useRef, useState } from "react";
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
  type CertificateTextPlacement,
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
  issuerTitle: "Issuer title for this language",
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
  const [selectedPlacement, setSelectedPlacement] = useState<typeof PLACEMENT_KEYS[number]>("name");
  const dragRef = useRef<{ key: typeof PLACEMENT_KEYS[number]; pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  function movePlacement(key: typeof PLACEMENT_KEYS[number], x: number, y: number) {
    setSettings(current => {
      const item = current.placement[key];
      const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
      return { ...current, placement: { ...current.placement, [key]: { ...item,
        x: Math.round(clamp(x, item.width / 2, 100 - item.width / 2) * 10) / 10,
        y: Math.round(clamp(y, item.height / 2, 100 - item.height / 2) * 10) / 10
      } } };
    });
  }
  function beginDrag(event: import("react").PointerEvent<HTMLButtonElement>, key: typeof PLACEMENT_KEYS[number]) {
    if (event.button !== 0) return;
    const item = settings.placement[key];
    dragRef.current = { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: item.x, startY: item.y };
    setSelectedPlacement(key);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function drag(event: import("react").PointerEvent<HTMLButtonElement>) {
    const active = dragRef.current;
    const bounds = editorRef.current?.getBoundingClientRect();
    if (!active || !bounds || active.pointerId !== event.pointerId) return;
    movePlacement(active.key, active.startX + (event.clientX - active.x) * 100 / bounds.width, active.startY + (event.clientY - active.y) * 100 / bounds.height);
  }
  function stopDrag() { dragRef.current = null; }

  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { let active = true; setLoading(true); setLoadFailed(false); void readCampaignCertificateSettings(scope).then((value) => { if (active) setSettings(value); }).catch((error) => { if (active) { setLoadFailed(true); setMessage(error instanceof CertificateApiError ? error.message : "Certificate settings are unavailable."); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [scope]);
  const preview = useMemo<ParticipationCertificate | null>(() => settings.artwork ? ({ id: "preview", certificateId: "SAMPLE-PREVIEW", campaignId: campaign.id, campaignSlug: campaign.slug, campaignName: campaign.title, supporterDisplayName: "Sample Supporter Name", participationDate: "2026-01-15T00:00:00.000Z", issuedAt: "2026-01-15T00:00:00.000Z", status: "valid", language, configurationVersion: settings.configurationVersion, verificationReference: "preview", verificationPath: "/certificates/verify/preview?ref=preview", artwork: settings.artwork, wording: normalizeCertificateWording(settings.wording), issuer: settings.issuer, placement: settings.placement, revokedAt: null, revocationReason: null }) : null, [campaign.id, campaign.slug, campaign.title, language, settings]);
  function updateWording(field: keyof CertificateLocalizedWording, value: string) {
    setSettings((current) => ({
      ...current,
      wording: {
        ...current.wording,
        [language]: { ...current.wording[language], [field]: value }
      }
    }));
  }
  function updatePlacement(key: typeof PLACEMENT_KEYS[number], patch: Partial<CertificateTextPlacement>) {
    setSettings((current) => ({
      ...current,
      placement: {
        ...current.placement,
        [key]: { ...current.placement[key], ...patch }
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
        <details><summary>Safe content placement and typography</summary><p className="helper-text">Position and size values stay within the certificate artwork. Preview, PDF and print all use this same saved layout.</p>{PLACEMENT_KEYS.map((key) => {
          const item = settings.placement[key];
          return <fieldset className="certificate-placement-row" key={key}><legend>{key}</legend>
            <label>X %<input type="number" min="0" max="100" step="0.1" value={item.x} onChange={(event) => updatePlacement(key, { x: Number(event.target.value) })} /></label>
            <label>Y %<input type="number" min="0" max="100" step="0.1" value={item.y} onChange={(event) => updatePlacement(key, { y: Number(event.target.value) })} /></label>
            <label>Width %<input type="number" min="5" max="90" step="0.1" value={item.width} onChange={(event) => updatePlacement(key, { width: Number(event.target.value) })} /></label>
            <label>Height %<input type="number" min="1" max="30" step="0.1" value={item.height} onChange={(event) => updatePlacement(key, { height: Number(event.target.value) })} /></label>
            <label>Font size<input type="number" min="6" max="72" step="1" value={item.fontSize} onChange={(event) => updatePlacement(key, { fontSize: Number(event.target.value) })} /></label>
            <label>Font family<select value={item.fontFamily} onChange={(event) => updatePlacement(key, { fontFamily: event.target.value as CertificateTextPlacement["fontFamily"] })}><option value="language-default">Language optimized</option><option value="sans-serif">Sans serif</option><option value="serif">Serif</option></select></label>
            <label>Style<select value={item.fontWeight} onChange={(event) => updatePlacement(key, { fontWeight: event.target.value as CertificateTextPlacement["fontWeight"] })}><option value="regular">Regular</option><option value="bold">Bold</option></select></label>
            <label>Text color<input type="color" value={item.color} onChange={(event) => updatePlacement(key, { color: event.target.value })} /></label>
            <label>Alignment<select value={item.align} onChange={(event) => updatePlacement(key, { align: event.target.value as CertificateTextPlacement["align"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          </fieldset>;
        })}</details>
      </div><div className="certificate-admin-preview"><span className="eyebrow"><ImageIcon size={14} /> Live sample preview</span><strong className="certificate-sample-notice">Sample data — not an issued certificate</strong><p className="helper-text">Drag a labelled box to move certificate content. Use arrow keys for fine adjustment, then save settings.</p>
        {preview ? <div className="certificate-drag-editor" ref={editorRef} style={{ aspectRatio: `${preview.artwork.width} / ${preview.artwork.height}` }}>
          <CertificatePreview certificate={preview} language={language} verificationUrl={certificateVerificationUrl(preview)} />
          <div className="certificate-drag-layer" aria-label="Certificate content placement editor">
            {PLACEMENT_KEYS.map(key => {
              const item = settings.placement[key];
              return <button type="button" key={key} className={`certificate-drag-handle${selectedPlacement === key ? " is-selected" : ""}`}
                style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%` }}
                title={`Move ${key}`} aria-label={`Move ${key}; use arrow keys to adjust position`}
                onPointerDown={event => beginDrag(event, key)}
                onPointerMove={drag} onPointerUp={stopDrag} onPointerCancel={stopDrag}
                onKeyDown={event => {
                  const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                  const offset = offsets[event.key];
                  if (!offset) return;
                  event.preventDefault();
                  setSelectedPlacement(key);
                  const step = event.shiftKey ? 1 : 0.1;
                  movePlacement(key, item.x + offset[0] * step, item.y + offset[1] * step);
                }}><span>{key}</span></button>;
            })}
          </div>
        </div> : <div className="certificate-artwork-empty">Upload certificate artwork to preview.</div>}</div></div>}
      <div className="certificate-admin-actions"><button className="primary-button" type="button" disabled={loadFailed || saving || (settings.certificatesEnabled && !settings.artwork)} onClick={() => void save()}><Save size={16} /> {saving ? "Saving…" : "Save Certificate Settings"}</button>{message && <p role="status">{message}</p>}</div>
    </>}
  </section>;
}

