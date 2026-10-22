import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertCircle, MapPin, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { Campaign } from "../../types";
import {
  addCampaignLocation,
  CampaignLocationApiError,
  commitCampaignLocationImport,
  deactivateCampaignLocation,
  getCurrentWorkspaceId,
  readCampaignLocationSummary,
  readCampaignLocations,
  validateCampaignLocationImport,
  type CampaignLocationImport,
  type CampaignLocationPath,
  type CampaignLocationRecord,
  type CampaignLocationScope,
  type CampaignLocationSummary
} from "../../backend";
import { Field } from "../../ui/Field";
import {
  downloadResourceLocationCsv,
  parseResourceLocationCsv,
  resourceLocationErrorsCsv,
  resourceLocationTemplateCsv,
  toResourceLocationErrorCsvRows
} from "./resourceLocationCsv";

type CampaignLocationTextField = Exclude<keyof CampaignLocationPath, "locationReference">;

const fields: CampaignLocationTextField[] = [
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
  onLocationsChanged?: () => void;
}

const locationPageSize = 50;

export function ResourceLocationManager({ campaign, onLocationsChanged }: ResourceLocationManagerProps) {
  const scope = useMemo<CampaignLocationScope>(() => ({
    workspaceId: getCurrentWorkspaceId(),
    campaignId: campaign.id,
    campaignSlug: campaign.slug
  }), [campaign.id, campaign.slug]);
  const [locations, setLocations] = useState<CampaignLocationRecord[]>([]);
  const [locationTotal, setLocationTotal] = useState(0);
  const [pageOffset, setPageOffset] = useState(0);
  const [summary, setSummary] = useState<CampaignLocationSummary | null>(null);
  const [configurationVersion, setConfigurationVersion] = useState(0);
  const [form, setForm] = useState<CampaignLocationPath>(emptyPath);
  const [search, setSearch] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pendingDeactivate, setPendingDeactivate] = useState<CampaignLocationRecord | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<"idle" | "parsing" | "validation errors" | "ready" | "importing" | "completed" | "failed">("idle");
  const [importResult, setImportResult] = useState<CampaignLocationImport | null>(null);
  const [importKey, setImportKey] = useState("");
  const [importHash, setImportHash] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "manual" | "import" | "active" | "inactive">("overview");
  const summaryRequestSequence = useRef(0);
  const locationsRequestSequence = useRef(0);

  const refreshSummary = async () => {
    const sequence = ++summaryRequestSequence.current;
    setSummaryLoading(true);
    setError("");
    try {
      const result = await readCampaignLocationSummary(scope);
      if (sequence !== summaryRequestSequence.current) return;
      setSummary(result);
      setConfigurationVersion(result.configurationVersion);
    } catch (reason) {
      if (sequence !== summaryRequestSequence.current) return;
      setError(messageFor(reason));
    } finally {
      if (sequence === summaryRequestSequence.current) setSummaryLoading(false);
    }
  };

  const refreshLocationsPage = async (offset = pageOffset) => {
    if (activeTab !== "active" && activeTab !== "inactive") return;
    const sequence = ++locationsRequestSequence.current;
    setLocationsLoading(true);
    setError("");
    try {
      const result = await readCampaignLocations(scope, {
        active: activeTab === "active",
        limit: locationPageSize,
        offset
      });
      if (sequence !== locationsRequestSequence.current) return;
      setLocations(result.locations);
      setLocationTotal(result.total);
      setConfigurationVersion(result.configurationVersion);
      setStatus(`Showing ${result.locations.length} of ${result.total} ${activeTab} locations.`);
    } catch (reason) {
      if (sequence !== locationsRequestSequence.current) return;
      setError(messageFor(reason));
      setLocations([]);
      setLocationTotal(0);
    } finally {
      if (sequence === locationsRequestSequence.current) setLocationsLoading(false);
    }
  };

  useEffect(() => {
    setError("");
    void refreshSummary();
    return () => {
      summaryRequestSequence.current += 1;
    };
  }, [scope.workspaceId, scope.campaignId, scope.campaignSlug]);

  useEffect(() => {
    if (activeTab !== "active" && activeTab !== "inactive") return undefined;
    void refreshLocationsPage(pageOffset);
    return () => {
      locationsRequestSequence.current += 1;
    };
  }, [scope.workspaceId, scope.campaignId, scope.campaignSlug, activeTab, pageOffset]);

  const visibleLocations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return locations.filter((location) => !term || pathLabel(location).toLowerCase().includes(term));
  }, [locations, search]);

  const update = (field: CampaignLocationTextField, value: string) => {
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
      await refreshSummary();
      onLocationsChanged?.();
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
      await Promise.all([refreshSummary(), refreshLocationsPage(pageOffset)]);
      onLocationsChanged?.();
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
      await refreshSummary();
      onLocationsChanged?.();
    } catch (reason) {
      setImportState("failed");
      setError(messageFor(reason));
    }
  };

  const selectTab = (tab: typeof activeTab) => {
    if (tab === "active" || tab === "inactive") setPageOffset(0);
    setActiveTab(tab);
  };

  return (
    <section className="wide location-mode-panel">
      <div className="authority-intelligence-header">
        <div>
          <span className="eyebrow">Campaign scope</span>
          <h3>Location Management</h3>
          <p className="helper-text">{campaign.title} · custom locations only</p>
        </div>
      </div>

      <div className="button-row" role="tablist" aria-label="Location management sections">
        {([
          ["overview", "Overview"],
          ["manual", "Manual Add"],
          ["import", "Bulk Import"],
          ["active", "Active Locations"],
          ["inactive", "Inactive Locations"]
        ] as const).map(([tab, label]) => (
          <button
            aria-controls={`location-tab-${tab}`}
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "primary-button" : "secondary-button"}
            id={`location-tab-button-${tab}`}
            key={tab}
            onClick={() => selectTab(tab)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <section aria-labelledby="location-tab-button-overview" id="location-tab-overview" role="tabpanel">
          <div className="button-row">
            <span className="status-pill"><ShieldCheck size={15} /> Version {configurationVersion}</span>
            <button className="secondary-button" type="button" onClick={() => void refreshSummary()} disabled={summaryLoading}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          {summaryLoading && <p className="helper-text" role="status">Loading summary…</p>}
          <div className="metric-grid" aria-label="Location configuration summary">
            <div className="metric-card"><span>Active custom</span><strong>{summary?.active ?? 0}</strong></div>
            <div className="metric-card"><span>Inactive custom</span><strong>{summary?.inactive ?? 0}</strong></div>
            <div className="metric-card"><span>Levels represented</span><strong>{summary?.levelsRepresented ?? 0}</strong></div>
          </div>
          <section className="wide authority-picker-panel" aria-label="Campaign Locations">
            <span className="eyebrow">Campaign Locations</span>
            <div className="metric-grid">
              <div className="metric-card"><span>States</span><strong>{summary?.coverage.states ?? 0}</strong></div>
              <div className="metric-card"><span>Districts</span><strong>{summary?.coverage.districts ?? 0}</strong></div>
              <div className="metric-card"><span>Blocks</span><strong>{summary?.coverage.blocks ?? 0}</strong></div>
              <div className="metric-card"><span>Panchayats</span><strong>{summary?.coverage.panchayats ?? 0}</strong></div>
              <div className="metric-card"><span>Villages</span><strong>{summary?.coverage.villages ?? 0}</strong></div>
              <div className="metric-card"><span>PINs</span><strong>{summary?.coverage.pins ?? 0}</strong></div>
            </div>
          </section>
        </section>
      )}

      <p className="helper-text" aria-live="polite">{status}</p>
      {error && <p className="info-message warning" role="alert"><AlertCircle size={16} /> {error}</p>}

      {activeTab === "import" && (
        <section aria-labelledby="location-tab-button-import" id="location-tab-import" role="tabpanel">
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
        </section>
      )}

      {activeTab === "manual" && (
        <section aria-labelledby="location-tab-button-manual" id="location-tab-manual" role="tabpanel">
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
        </section>
      )}

      {(activeTab === "active" || activeTab === "inactive") && (
        <section aria-labelledby={`location-tab-button-${activeTab}`} id={`location-tab-${activeTab}`} role="tabpanel">
          <div className="wide authority-picker-panel">
            <div className="authority-picker-toolbar">
              <Field label="Search this page">
                <div className="input-with-icon"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search custom locations" /></div>
              </Field>
            </div>
            {locationsLoading ? <p className="helper-text" role="status">Loading locations…</p> : visibleLocations.length === 0 ? (
              <p className="helper-text">No {activeTab} custom locations match this page.</p>
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
            <div className="button-row" aria-label={`${activeTab} location pages`}>
              <button
                className="secondary-button"
                type="button"
                disabled={locationsLoading || pageOffset === 0}
                onClick={() => setPageOffset((offset) => Math.max(0, offset - locationPageSize))}
              >
                Previous
              </button>
              <span className="helper-text">
                {locationTotal === 0 ? "0 locations" : `${pageOffset + 1}–${Math.min(pageOffset + locations.length, locationTotal)} of ${locationTotal}`}
              </span>
              <button
                className="secondary-button"
                type="button"
                disabled={locationsLoading || pageOffset + locations.length >= locationTotal}
                onClick={() => setPageOffset((offset) => offset + locationPageSize)}
              >
                Next
              </button>
              <button className="secondary-button" type="button" disabled={locationsLoading} onClick={() => void refreshLocationsPage(pageOffset)}>
                <RefreshCw size={15} /> Refresh page
              </button>
            </div>
          </div>
        </section>
      )}

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
