import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, MapPin, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { Campaign } from "../../types";
import {
  addCampaignLocation,
  CampaignLocationApiError,
  commitCampaignLocationImport,
  deactivateCampaignLocation,
  getCurrentWorkspaceId,
  readCampaignLocations,
  validateCampaignLocationImport,
  type CampaignLocationImport,
  type CampaignLocationPath,
  type CampaignLocationRecord,
  type CampaignLocationScope,
  type PublicCampaignCustomLocation
} from "../../backend";
import { Field } from "../../ui/Field";
import {
  downloadResourceLocationCsv,
  parseResourceLocationCsv,
  resourceLocationErrorsCsv,
  resourceLocationTemplateCsv,
  toResourceLocationErrorCsvRows
} from "./resourceLocationCsv";

const fields: Array<keyof CampaignLocationPath> = [
  "country", "state", "district", "block", "panchayat", "village", "postalCode"
];

const errorMessages: Record<string, string> = {
  unauthorized: "Your session has expired. Sign in again to continue.",
  forbidden: "You do not have permission to manage locations for this campaign.",
  assignment_mismatch: "Your Campaign Admin assignment could not be verified for this campaign.",
  campaign_not_found: "This assigned campaign could not be found.",
  campaign_archived: "Locations cannot be changed because this campaign is archived.",
  invalid_parent: "Add or reactivate the required parent location before adding this location.",
  validation_failed: "Review the location details and try again.",
  duplicate: "This custom location is already active.",
  master_value_protected: "Verified master geography cannot be added as a campaign custom location.",
  conflict: "This location changed elsewhere. Refresh and try again.",
  idempotency_conflict: "This request was already used with different location details. Refresh and try again.",
  master_catalog_unavailable: "Verified geography is temporarily unavailable. No changes were made.",
  server_error: "Location management is temporarily unavailable. Please try again."
};

function messageFor(error: unknown) {
  const code = error instanceof CampaignLocationApiError ? error.code : "server_error";
  return errorMessages[code] ?? errorMessages.server_error;
}

function pathLabel(path: CampaignLocationPath) {
  return fields.slice(0, -1).map((field) => path[field]).filter(Boolean).join(" → ");
}

function emptyPath(): CampaignLocationPath {
  return { country: "India" };
}

function idempotencyKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `location-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isIndiaPinValid(path: CampaignLocationPath) {
  return path.country.trim().toLowerCase() !== "india" || !path.postalCode || /^\d{6}$/.test(path.postalCode);
}

interface ResourceLocationManagerProps {
  campaign: Campaign;
  onLocationsChange?: (locations: PublicCampaignCustomLocation[]) => void;
}

function toPublicCampaignCustomLocation(location: CampaignLocationRecord): PublicCampaignCustomLocation {
  return {
    country: location.country,
    state: location.state,
    district: location.district,
    block: location.block,
    panchayat: location.panchayat,
    village: location.village,
    postalCode: location.postalCode
  };
}

export function ResourceLocationManager({ campaign, onLocationsChange }: ResourceLocationManagerProps) {
  const scope = useMemo<CampaignLocationScope>(() => ({
    workspaceId: getCurrentWorkspaceId(),
    campaignId: campaign.id,
    campaignSlug: campaign.slug
  }), [campaign.id, campaign.slug]);
  const [locations, setLocations] = useState<CampaignLocationRecord[]>([]);
  const [configurationVersion, setConfigurationVersion] = useState(0);
  const [form, setForm] = useState<CampaignLocationPath>(emptyPath);
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Loading campaign locations…");
  const [error, setError] = useState("");
  const [pendingDeactivate, setPendingDeactivate] = useState<CampaignLocationRecord | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<"idle" | "parsing" | "validation errors" | "ready" | "importing" | "completed" | "failed">("idle");
  const [importResult, setImportResult] = useState<CampaignLocationImport | null>(null);
  const [importKey, setImportKey] = useState("");
  const [importHash, setImportHash] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await readCampaignLocations(scope, { active: filter === "all" ? undefined : filter === "active" });
      setLocations(result.locations);
      onLocationsChange?.(
        result.locations
          .filter((location) => location.active)
          .map(toPublicCampaignCustomLocation)
      );
      setConfigurationVersion(result.configurationVersion);
      setStatus(`Updated configuration version ${result.configurationVersion}.`);
    } catch (reason) {
      setError(messageFor(reason));
      setStatus("Location refresh failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [scope.workspaceId, scope.campaignId, scope.campaignSlug, filter]);

  const visibleLocations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return locations.filter((location) => !term || pathLabel(location).toLowerCase().includes(term)).slice(0, 50);
  }, [locations, search]);
  const activeCount = locations.filter((location) => location.active).length;
  const inactiveCount = locations.filter((location) => !location.active).length;
  const levels = new Set(locations.map((location) => location.leafLevel)).size;

  const update = (field: keyof CampaignLocationPath, value: string) => {
    setForm((current) => ({ ...current, [field]: value.slice(0, 120) }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value?.trim() || undefined])
    ) as CampaignLocationPath;
    const hierarchy = ["country", "state", "district", "block", "panchayat", "village"] as const;
    const firstEmpty = hierarchy.findIndex((key) => !cleaned[key]);
    if (!cleaned.country || (firstEmpty >= 0 && hierarchy.slice(firstEmpty + 1).some((key) => cleaned[key]))) {
      setError("Each location level needs its parent level.");
      return;
    }
    if (!isIndiaPinValid(cleaned)) {
      setError("Enter a six-digit India PIN, or leave it blank.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await addCampaignLocation(scope, cleaned, idempotencyKey());
      setConfigurationVersion(result.configurationVersion);
      setStatus(result.result === "duplicate" ? "The location is already active." : "Custom location saved.");
      setForm(emptyPath());
      await refresh();
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await deactivateCampaignLocation(scope, pendingDeactivate.id, pendingDeactivate.version);
      setConfigurationVersion(result.configurationVersion);
      setPendingDeactivate(null);
      setStatus("Custom location deactivated.");
      await refresh();
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const validateImport = async () => {
    if (!importFile) return;
    setImportState("parsing");
    setError("");
    const parsed = parseResourceLocationCsv(await importFile.text(), importFile.size);
    if (!parsed.ok) {
      setImportState("failed");
      setError(errorMessages[parsed.code] ?? "The CSV file could not be validated.");
      return;
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed.contentHashInput));
    const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const key = idempotencyKey();
    try {
      const result = await validateCampaignLocationImport(scope, parsed.rows, key, hash);
      setImportResult(result);
      setImportKey(key);
      setImportHash(hash);
      setImportState(result.status === "ready" ? "ready" : "validation errors");
    } catch (reason) {
      setImportState("failed");
      setError(messageFor(reason));
    }
  };

  const commitImport = async () => {
    if (!importResult || !importKey || !importHash) return;
    setImportState("importing");
    try {
      const result = await commitCampaignLocationImport(scope, importResult.importId, importKey, importHash);
      setConfigurationVersion(result.configurationVersion);
      setImportState("completed");
      setStatus("CSV import completed.");
      await refresh();
    } catch (reason) {
      setImportState("failed");
      setError(messageFor(reason));
    }
  };

  return (
    <section className="wide location-mode-panel">
      <div className="authority-intelligence-header">
        <div>
          <span className="eyebrow">Campaign scope</span>
          <h3>Location Management</h3>
          <p className="helper-text">{campaign.title} · custom locations only</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><ShieldCheck size={15} /> Version {configurationVersion}</span>
          <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="metric-grid" aria-label="Location configuration summary">
        <div className="metric-card"><span>Active custom</span><strong>{activeCount}</strong></div>
        <div className="metric-card"><span>Inactive custom</span><strong>{inactiveCount}</strong></div>
        <div className="metric-card"><span>Levels represented</span><strong>{levels}</strong></div>
      </div>
      <p className="helper-text" aria-live="polite">{status}</p>
      {error && <p className="info-message warning" role="alert"><AlertCircle size={16} /> {error}</p>}

      <div className="wide authority-picker-panel">
        <div className="authority-intelligence-header">
          <div><span className="eyebrow">Bulk import</span><h4>Campaign location CSV</h4><p className="helper-text">Validate before import. Existing active locations are not changed.</p></div>
          <button className="secondary-button" type="button" onClick={() => downloadResourceLocationCsv("campaign-location-template-v1.csv", resourceLocationTemplateCsv())}>Download Template</button>
        </div>
        <div className="button-row">
          <input aria-label="Campaign location CSV file" type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportResult(null); setImportState("idle"); }} />
          <button className="secondary-button" type="button" disabled={!importFile || importState === "parsing"} onClick={() => void validateImport()}>
            {importState === "parsing" ? "Validating…" : "Validate CSV"}
          </button>
          {importFile && <span className="helper-text">{importFile.name} · {(importFile.size / 1024).toFixed(1)} KB</span>}
        </div>
        {importResult && <>
          <div className="metric-grid">
            <div className="metric-card"><span>Rows</span><strong>{importResult.totalRows}</strong></div>
            <div className="metric-card"><span>Ready</span><strong>{importResult.validRows}</strong></div>
            <div className="metric-card"><span>Errors</span><strong>{importResult.invalidRows}</strong></div>
          </div>
          {importResult.invalidRows > 0 && <button className="secondary-button" type="button" onClick={() => downloadResourceLocationCsv("campaign-location-import-errors.csv", resourceLocationErrorsCsv(toResourceLocationErrorCsvRows(importResult.rows.filter((row) => row.errorCode))))}>Download Errors CSV</button>}
          {importState === "ready" && <button className="primary-button" type="button" onClick={() => void commitImport()} disabled={submitting}>Confirm Import</button>}
          <p className="helper-text" aria-live="polite">Import status: {importState}</p>
        </>}
      </div>

      <div className="form-grid">
        <form className="wide" onSubmit={submit}>
          <div className="authority-intelligence-header">
            <div><span className="eyebrow">Manual custom location</span><h4>Add a campaign location</h4></div>
            <button className="primary-button" type="submit" disabled={submitting}>
              <Plus size={16} /> {submitting ? "Saving…" : "Add custom location"}
            </button>
          </div>
          <div className="form-grid">
            <Field label="Country"><input aria-label="Country" value={form.country} onChange={(event) => update("country", event.target.value)} required /></Field>
            <Field label="State"><input aria-label="State" value={form.state ?? ""} onChange={(event) => update("state", event.target.value)} /></Field>
            <Field label="District"><input aria-label="District" value={form.district ?? ""} onChange={(event) => update("district", event.target.value)} /></Field>
            <Field label="Block / ULB"><input aria-label="Block or ULB" value={form.block ?? ""} onChange={(event) => update("block", event.target.value)} /></Field>
            <Field label="Panchayat / Ward"><input aria-label="Panchayat or Ward" value={form.panchayat ?? ""} onChange={(event) => update("panchayat", event.target.value)} /></Field>
            <Field label="Village / Locality"><input aria-label="Village or Locality" value={form.village ?? ""} onChange={(event) => update("village", event.target.value)} /></Field>
            <Field label="Postal / PIN"><input aria-label="Postal or PIN" inputMode="numeric" value={form.postalCode ?? ""} onChange={(event) => update("postalCode", event.target.value)} /></Field>
          </div>
          <p className="helper-text"><MapPin size={15} /> Path preview: {pathLabel(form) || "Choose a country"}</p>
        </form>

        <div className="wide authority-picker-panel">
          <div className="authority-picker-toolbar">
            <Field label="Search locations">
              <div className="input-with-icon"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search custom locations" /></div>
            </Field>
            <Field label="Status">
              <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
              </select>
            </Field>
          </div>
          {loading ? <p className="helper-text">Loading locations…</p> : visibleLocations.length === 0 ? (
            <p className="helper-text">No {filter === "all" ? "" : `${filter} `}custom locations match this view.</p>
          ) : (
            <div className="campaign-link-list">
              {visibleLocations.map((location) => (
                <article className="campaign-link-row" key={location.id}>
                  <div>
                    <strong>{pathLabel(location)}</strong>
                    <small>{location.postalCode ? `PIN ${location.postalCode} · ` : ""}{location.leafLevel} · {location.source === "campaign_import" ? "Imported custom" : "Campaign custom"}</small>
                  </div>
                  <div className="button-row">
                    <span className="status-pill">{location.active ? "Active" : "Inactive"}</span>
                    {location.active && <button className="secondary-button" type="button" onClick={() => setPendingDeactivate(location)}><Trash2 size={15} /> Deactivate</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
          {locations.length > 50 && <p className="helper-text">Showing the first 50 matching locations. Refine your search to narrow the list.</p>}
        </div>
      </div>

      {pendingDeactivate && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="deactivate-location-title">
            <h3 id="deactivate-location-title">Deactivate custom location?</h3>
            <p>{pathLabel(pendingDeactivate)}</p>
            <p className="helper-text">Existing supporter records are unchanged. Active custom children must be deactivated first.</p>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => setPendingDeactivate(null)} disabled={submitting}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => void confirmDeactivate()} disabled={submitting}>
                {submitting ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
