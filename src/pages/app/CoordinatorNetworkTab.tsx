import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  Camera,
  ChevronRight,
  CircleUserRound,
  GitBranch,
  MapPin,
  Network,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UsersRound
} from "lucide-react";
import type { Campaign } from "../../types";
import type { LocationDeletions, LocationOverrides, LocationWithPin } from "../../geography";
import {
  changeCoordinatorStatus,
  loadCoordinatorNetwork,
  openCoordinatorPhoto,
  removeCoordinator,
  requestCoordinatorMobileOtp,
  saveCoordinator,
  uploadCoordinatorPhoto,
  verifyCoordinatorMobileOtp
} from "../../backend";
import {
  buildCoordinatorTree,
  coordinatorGeographyLabel,
  coordinatorMatchesSearch,
  coordinatorRoles,
  coordinatorStatuses,
  getCoordinatorDashboardMetrics,
  getCoordinatorRoleLevel,
  validateCoordinatorDraft,
  type Coordinator,
  type CoordinatorDraft,
  type CoordinatorGeography,
  type CoordinatorNetworkSnapshot,
  type CoordinatorRole,
  type CoordinatorStatus,
  type CoordinatorTreeNode
} from "../../coordinators";
import { IndiaLocationFields } from "../../components/IndiaLocationFields";
import { normalizeIndianPhone } from "../../shared/deduplication/supporterIdentity";
import { Field } from "../../ui/Field";
import { MetricCard } from "../../ui/MetricCard";
import { Panel } from "../../ui/Panel";

interface CoordinatorNetworkTabProps {
  campaigns: Campaign[];
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
}

type CoordinatorView = "dashboard" | "directory" | "tree" | "activity";

const coordinatorViews: CoordinatorView[] = ["dashboard", "directory", "tree", "activity"];

const roleLabels: Record<CoordinatorRole, string> = {
  national_coordinator: "National Coordinator",
  state_coordinator: "State Coordinator",
  district_coordinator: "District Coordinator",
  block_coordinator: "Block Coordinator",
  panchayat_coordinator: "Panchayat Coordinator",
  ward_coordinator: "Ward Coordinator",
  field_coordinator: "Field Coordinator"
};

const roleRank: Record<CoordinatorRole, number> = {
  national_coordinator: 7,
  state_coordinator: 6,
  district_coordinator: 5,
  block_coordinator: 4,
  panchayat_coordinator: 3,
  ward_coordinator: 2,
  field_coordinator: 1
};

function createCoordinatorDraft(): CoordinatorDraft {
  return {
    id: crypto.randomUUID(),
    fullName: "",
    phone: "",
    email: "",
    photoPath: "",
    role: "field_coordinator",
    status: "invited",
    reportsToCoordinatorId: "",
    referredByCode: "",
    notes: "",
    version: 0,
    geography: {
      country: "India",
      state: "",
      district: "",
      block: "",
      panchayat: "",
      ward: "",
      postalCode: ""
    },
    campaignIds: []
  };
}

function geographyInputFor(
  geographyId: string,
  geographies: CoordinatorGeography[],
  postalCode = ""
): CoordinatorDraft["geography"] {
  const values = createCoordinatorDraft().geography;
  values.postalCode = postalCode;
  const byId = new Map(geographies.map((item) => [item.id, item]));
  let current = byId.get(geographyId);
  while (current) {
    values[current.level] = current.name;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  if (!values.country) values.country = "India";
  return values;
}

function draftForCoordinator(
  coordinator: Coordinator,
  snapshot: CoordinatorNetworkSnapshot
): CoordinatorDraft {
  const inviter = coordinator.referredByCoordinatorId
    ? snapshot.coordinators.find((item) => item.id === coordinator.referredByCoordinatorId)
    : undefined;
  return {
    id: coordinator.id,
    fullName: coordinator.fullName,
    phone: coordinator.phone,
    email: coordinator.email ?? "",
    photoPath: coordinator.photoPath ?? "",
    role: coordinator.role,
    status: coordinator.status,
    reportsToCoordinatorId: coordinator.reportsToCoordinatorId ?? "",
    referredByCode: inviter?.referralCode ?? "",
    notes: coordinator.notes,
    version: coordinator.version,
    geography: geographyInputFor(coordinator.geographyId, snapshot.geographies, coordinator.postalCode),
    campaignIds: snapshot.campaignLinks
      .filter((link) => link.coordinatorId === coordinator.id)
      .map((link) => link.campaignId)
  };
}

function formatRole(role: CoordinatorRole) {
  return roleLabels[role];
}

function formatActivity(action: string) {
  return action.replace("coordinator.", "").replace(/_/g, " ").replace(/^./, (value: string) => value.toUpperCase());
}

function CoordinatorTreeBranch({ node, depth = 0 }: { node: CoordinatorTreeNode; depth?: number }) {
  return (
    <li className="coordinator-tree-node" role="treeitem" aria-expanded={node.children.length > 0 ? true : undefined}>
      <div className="coordinator-tree-card" style={{ "--coordinator-tree-depth": depth } as CSSProperties}>
        <CircleUserRound size={20} />
        <span>
          <strong>{node.coordinator.fullName}</strong>
          <small>{formatRole(node.coordinator.role)} · {node.coordinator.status}</small>
        </span>
      </div>
      {node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <CoordinatorTreeBranch key={child.coordinator.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CoordinatorNetworkTab({
  campaigns,
  locationOverrides,
  locationDeletions
}: CoordinatorNetworkTabProps) {
  const [snapshot, setSnapshot] = useState<CoordinatorNetworkSnapshot | null>(null);
  const [view, setView] = useState<CoordinatorView>("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | CoordinatorRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CoordinatorStatus>("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [geographyFilter, setGeographyFilter] = useState("all");
  const [draft, setDraft] = useState<CoordinatorDraft | null>(null);
  const [originalPhone, setOriginalPhone] = useState("");
  const [formErrors, setFormErrors] = useState<ReturnType<typeof validateCoordinatorDraft>["errors"]>({});
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");

  async function refreshNetwork() {
    setLoading(true);
    setError("");
    try {
      const nextSnapshot = await loadCoordinatorNetwork();
      setSnapshot(nextSnapshot);
      setSelectedCoordinatorId((current) =>
        current && nextSnapshot.coordinators.some((item) => item.id === current)
          ? current
          : nextSnapshot.coordinators[0]?.id ?? ""
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Coordinator network could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshNetwork();
  }, []);

  const selectedCoordinator = snapshot?.coordinators.find((item) => item.id === selectedCoordinatorId);
  const metrics = snapshot
    ? getCoordinatorDashboardMetrics(snapshot.coordinators, snapshot.campaignLinks, snapshot.referrals)
    : null;
  const reportingTree = useMemo(
    () => buildCoordinatorTree(snapshot?.coordinators ?? []),
    [snapshot?.coordinators]
  );
  const filteredCoordinators = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.coordinators.filter((coordinator) => {
      const geography = coordinatorGeographyLabel(coordinator, snapshot.geographies);
      const linkedCampaigns = snapshot.campaignLinks
        .filter((link) => link.coordinatorId === coordinator.id)
        .map((link) => link.campaignId);
      return coordinatorMatchesSearch(coordinator, geography, search)
        && (roleFilter === "all" || coordinator.role === roleFilter)
        && (statusFilter === "all" || coordinator.status === statusFilter)
        && (campaignFilter === "all" || linkedCampaigns.includes(campaignFilter))
        && (geographyFilter === "all" || coordinator.geographyId === geographyFilter);
    });
  }, [campaignFilter, geographyFilter, roleFilter, search, snapshot, statusFilter]);

  function openCreateForm() {
    setDraft(createCoordinatorDraft());
    setOriginalPhone("");
    setFormErrors({});
    setOtpChallengeId("");
    setOtpCode("");
    setVerificationToken("");
    setVerifiedPhone("");
    setOtpMessage("");
    setPhotoFile(null);
    setError("");
    setMessage("");
  }

  function handleViewKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentView: CoordinatorView) {
    const currentIndex = coordinatorViews.indexOf(currentView);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? coordinatorViews.length - 1
        : event.key === "ArrowRight"
          ? (currentIndex + 1) % coordinatorViews.length
          : event.key === "ArrowLeft"
            ? (currentIndex - 1 + coordinatorViews.length) % coordinatorViews.length
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextView = coordinatorViews[nextIndex];
    setView(nextView);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-coordinator-view="${nextView}"]`)
      ?.focus();
  }

  function openEditForm(coordinator: Coordinator) {
    if (!snapshot) return;
    setDraft(draftForCoordinator(coordinator, snapshot));
    setOriginalPhone(normalizeIndianPhone(coordinator.phone).normalized);
    setFormErrors({});
    setOtpChallengeId("");
    setOtpCode("");
    setVerificationToken("");
    setVerifiedPhone(normalizeIndianPhone(coordinator.phone).normalized);
    setOtpMessage("");
    setPhotoFile(null);
    setError("");
    setMessage("");
  }

  async function sendMobileOtp() {
    if (!draft || !snapshot) return;
    setOtpMessage("");
    try {
      const result = await requestCoordinatorMobileOtp(snapshot.workspaceId, draft.phone);
      setOtpChallengeId(result.challengeId);
      setOtpMessage(result.developmentOtp
        ? `${result.message} Development code: ${result.developmentOtp}`
        : result.message);
    } catch (otpError) {
      setOtpMessage(otpError instanceof Error ? otpError.message : "Verification code could not be sent.");
    }
  }

  async function verifyMobileOtp() {
    if (!draft || !snapshot || !otpChallengeId) return;
    setOtpMessage("");
    try {
      const result = await verifyCoordinatorMobileOtp({
        workspaceId: snapshot.workspaceId,
        phone: draft.phone,
        challengeId: otpChallengeId,
        code: otpCode
      });
      setVerificationToken(result.verificationToken);
      setVerifiedPhone(normalizeIndianPhone(draft.phone).normalized);
      setOtpMessage(result.message);
    } catch (otpError) {
      setOtpMessage(otpError instanceof Error ? otpError.message : "Mobile verification failed.");
    }
  }

  async function submitCoordinator() {
    if (!draft || !snapshot) return;
    const validation = validateCoordinatorDraft(draft);
    setFormErrors(validation.errors);
    if (!validation.valid) return;
    const currentPhone = normalizeIndianPhone(draft.phone).normalized;
    const phoneChanged = !originalPhone || currentPhone !== originalPhone;
    if (phoneChanged && verifiedPhone !== currentPhone) {
      setFormErrors((current) => ({ ...current, phone: "Verify this mobile number before saving." }));
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    let coordinatorWasSaved = false;
    try {
      let result = await saveCoordinator(snapshot.workspaceId, draft, phoneChanged ? verificationToken : "");
      coordinatorWasSaved = true;
      if (photoFile) {
        const photoPath = await uploadCoordinatorPhoto(result.id, photoFile);
        result = await saveCoordinator(snapshot.workspaceId, {
          ...draft,
          id: result.id,
          version: result.version,
          photoPath
        });
      }
      setMessage(`Coordinator saved. Referral code: ${result.referralCode}`);
      setDraft(null);
      await refreshNetwork();
      setSelectedCoordinatorId(result.id);
    } catch (saveError) {
      if (coordinatorWasSaved) await refreshNetwork();
      setError(saveError instanceof Error ? saveError.message : "Coordinator could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(coordinator: Coordinator, status: CoordinatorStatus) {
    if (!snapshot) return;
    setError("");
    try {
      await changeCoordinatorStatus({
        workspaceId: snapshot.workspaceId,
        coordinatorId: coordinator.id,
        status,
        expectedVersion: coordinator.version
      });
      await refreshNetwork();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Status could not be updated.");
    }
  }

  async function deleteCoordinator(coordinator: Coordinator) {
    if (!snapshot || !window.confirm(`Delete ${coordinator.fullName}? This preserves the audit history.`)) return;
    setError("");
    try {
      await removeCoordinator({
        workspaceId: snapshot.workspaceId,
        coordinatorId: coordinator.id,
        expectedVersion: coordinator.version
      });
      await refreshNetwork();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Coordinator could not be deleted.");
    }
  }

  async function showProfilePhoto(coordinator: Coordinator) {
    setSelectedCoordinatorId(coordinator.id);
    setProfilePhotoUrl("");
    if (!coordinator.photoPath) return;
    try {
      setProfilePhotoUrl(await openCoordinatorPhoto(coordinator.photoPath));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Coordinator photo could not be opened.");
    }
  }

  if (loading && !snapshot) {
    return (
      <section className="coordinator-loading-shell" role="status" aria-label="Loading Coordinator Network">
        <div className="coordinator-loading-heading">
          <span className="coordinator-skeleton coordinator-skeleton-icon" />
          <div>
            <span className="coordinator-skeleton coordinator-skeleton-title" />
            <span className="coordinator-skeleton coordinator-skeleton-copy" />
          </div>
        </div>
        <div className="coordinator-loading-cards" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <span className="coordinator-skeleton" key={index} />)}
        </div>
        <strong>Loading Coordinator Network…</strong>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <div className="empty-state compact-empty coordinator-error-state" role="alert">
        <span className="coordinator-state-icon" aria-hidden="true"><AlertCircle size={26} /></span>
        <div>
          <h2>Coordinator Network unavailable</h2>
          <p>{error || "The workspace could not be loaded. Check your connection and try again."}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshNetwork()}>
          <RefreshCw size={18} /> Retry
        </button>
      </div>
    );
  }

  return (
    <section
      className={`page-stack coordinator-network${snapshot.canManage && !draft ? " coordinator-network-has-fab" : ""}`}
      aria-busy={loading}
    >
      <Panel title="Coordinator Network" icon={<Network />}>
        <div className="coordinator-network-header">
          <div>
            <span className="eyebrow">Business OS · live workspace data</span>
            <h2>Build and operate the reporting network</h2>
            <p>Manage verified coordinators, geography ownership, reporting lines, campaign assignments, and referrals.</p>
          </div>
          <div className="button-row coordinator-header-actions">
            <button className="secondary-button" type="button" disabled={loading} onClick={() => void refreshNetwork()}>
              <RefreshCw size={18} /> Refresh
            </button>
            {snapshot.canManage && (
              <button className="primary-button" type="button" onClick={openCreateForm}>
                <Plus size={18} /> Add coordinator
              </button>
            )}
          </div>
        </div>
        <nav className="coordinator-view-tabs" aria-label="Coordinator Network views" role="tablist">
          {coordinatorViews.map((item) => (
            <button
              aria-controls={`coordinator-${item}-panel`}
              aria-selected={view === item}
              className={view === item ? "active" : ""}
              data-coordinator-view={item}
              role="tab"
              tabIndex={view === item ? 0 : -1}
              type="button"
              key={item}
              onClick={() => setView(item)}
              onKeyDown={(event) => handleViewKeyDown(event, item)}
            >
              {item === "dashboard" ? "Dashboard" : item === "directory" ? "Directory" : item === "tree" ? "Tree View" : "Activity Log"}
            </button>
          ))}
        </nav>
      </Panel>

      {(error || message) && (
        <p
          aria-live="polite"
          className={`coordinator-feedback ${error ? "error-message" : "success-message"}`}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      )}

      {draft && snapshot.canManage && (
        <Panel title={draft.version ? "Edit coordinator" : "Add coordinator"} icon={<UserCheck />}>
          <div className="coordinator-form-grid">
            <Field label="Full name *">
              <input
                aria-invalid={Boolean(formErrors.fullName)}
                autoFocus={!draft.version}
                value={draft.fullName}
                onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
              />
              {formErrors.fullName && <span className="field-error">{formErrors.fullName}</span>}
            </Field>
            <Field label="Mobile *">
              <input aria-invalid={Boolean(formErrors.phone)} inputMode="tel" value={draft.phone} onChange={(event) => {
                setDraft({ ...draft, phone: event.target.value });
                setVerificationToken("");
                setVerifiedPhone("");
              }} />
              {formErrors.phone && <span className="field-error">{formErrors.phone}</span>}
            </Field>
            <Field label="Email">
              <input aria-invalid={Boolean(formErrors.email)} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              {formErrors.email && <span className="field-error">{formErrors.email}</span>}
            </Field>
            <Field label="Role *">
              <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as CoordinatorRole })}>
                {coordinatorRoles.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
              </select>
              <small>Required geography: {getCoordinatorRoleLevel(draft.role) ?? "deepest assigned area"}</small>
            </Field>
            <Field label="Status *">
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CoordinatorStatus })}>
                {coordinatorStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="Reports to">
              <select value={draft.reportsToCoordinatorId} onChange={(event) => setDraft({ ...draft, reportsToCoordinatorId: event.target.value })}>
                <option value="">No reporting parent</option>
                {snapshot.coordinators
                  .filter((item) => item.id !== draft.id && roleRank[item.role] > roleRank[draft.role])
                  .map((item) => <option key={item.id} value={item.id}>{item.fullName} · {formatRole(item.role)}</option>)}
              </select>
            </Field>
            <Field label="Referred by code">
              <input value={draft.referredByCode} onChange={(event) => setDraft({ ...draft, referredByCode: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Profile photo">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} />
              <small>Private image, maximum 5 MB.</small>
            </Field>
          </div>

          <div className="coordinator-mobile-verification">
            <Phone size={20} />
            <div>
              <strong>Mobile verification</strong>
              <p>Use the existing VoiceUp OTP provider before saving a new or changed mobile number.</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => void sendMobileOtp()}>Send code</button>
            {otpChallengeId && verifiedPhone !== normalizeIndianPhone(draft.phone).normalized && (
              <>
                <input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} />
                <button className="primary-button" type="button" onClick={() => void verifyMobileOtp()}>Verify mobile</button>
              </>
            )}
            {verifiedPhone === normalizeIndianPhone(draft.phone).normalized && verifiedPhone && (
              <span className="coordinator-verified-badge"><BadgeCheck size={17} /> Verified</span>
            )}
            {otpMessage && <small>{otpMessage}</small>}
          </div>

          <div className="coordinator-geography-form">
            <div>
              <strong>Geography hierarchy</strong>
              <p>The saved hierarchy is normalized and reused across coordinators.</p>
            </div>
            <IndiaLocationFields
              idPrefix={`coordinator-${draft.id}`}
              values={draft.geography as LocationWithPin}
              onChange={(values) => setDraft({ ...draft, geography: { ...draft.geography, ...values } })}
              locationOverrides={locationOverrides}
              locationDeletions={locationDeletions}
              showOptionalLabels
            />
            {(draft.role === "ward_coordinator" || draft.role === "field_coordinator") && (
              <Field label="Ward *">
                <input
                  value={draft.geography.ward}
                  onChange={(event) => setDraft({
                    ...draft,
                    geography: { ...draft.geography, ward: event.target.value }
                  })}
                />
              </Field>
            )}
            {formErrors.geography && <span className="field-error">{formErrors.geography}</span>}
          </div>

          <div className="coordinator-campaign-links">
            <strong>Linked campaigns</strong>
            {campaigns.length === 0 ? (
              <p className="helper-text">No campaigns are available in this workspace.</p>
            ) : campaigns.map((campaign) => (
              <label key={campaign.id}>
                <input
                  type="checkbox"
                  checked={draft.campaignIds.includes(campaign.id)}
                  onChange={(event) => setDraft({
                    ...draft,
                    campaignIds: event.target.checked
                      ? [...draft.campaignIds, campaign.id]
                      : draft.campaignIds.filter((id) => id !== campaign.id)
                  })}
                />
                <span>{campaign.title}</span>
                <small>{campaign.status}</small>
              </label>
            ))}
          </div>

          <Field label="Internal notes">
            <textarea rows={4} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </Field>
          <div className="button-row coordinator-form-actions" aria-label="Coordinator form actions">
            <button className="primary-button" type="button" disabled={saving} onClick={() => void submitCoordinator()}>
              <ShieldCheck size={18} /> {saving ? "Saving…" : "Save coordinator"}
            </button>
            <button className="secondary-button" type="button" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </Panel>
      )}

      {view === "dashboard" && metrics && (
        <div className="coordinator-view-panel coordinator-dashboard" id="coordinator-dashboard-panel" role="tabpanel">
          <div className="metric-grid coordinator-metric-grid">
            <MetricCard icon={<UsersRound />} label="Coordinators" value={metrics.total} detail="Persisted profiles" />
            <MetricCard icon={<BadgeCheck />} label="Active" value={metrics.active} detail="Operational status" />
            <MetricCard icon={<Phone />} label="Mobile verified" value={metrics.mobileVerified} detail="OTP-verified profiles" />
            <MetricCard icon={<MapPin />} label="Geographies" value={metrics.geographyCoverage} detail="Assigned coverage areas" />
            <MetricCard icon={<GitBranch />} label="Campaign linked" value={metrics.linkedToCampaign} detail="Assigned coordinators" />
            <MetricCard icon={<Network />} label="Referrals" value={metrics.referralLinks} detail="Accepted coordinator referrals" />
          </div>
          <div className="two-column coordinator-dashboard-overview">
            <Panel title="Status overview" icon={<BadgeCheck />}>
              <div className="coordinator-summary-list">
                {coordinatorStatuses.map((status) => (
                  <div key={status}><span>{status}</span><strong>{snapshot.coordinators.filter((item) => item.status === status).length}</strong></div>
                ))}
              </div>
            </Panel>
            <Panel title="Role coverage" icon={<MapPin />}>
              <div className="coordinator-summary-list">
                {coordinatorRoles.map((role) => (
                  <div key={role}><span>{formatRole(role)}</span><strong>{snapshot.coordinators.filter((item) => item.role === role).length}</strong></div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {view === "directory" && (
        <div className="coordinator-view-panel coordinator-directory-view" id="coordinator-directory-panel" role="tabpanel">
          <Panel title="Search and filters" icon={<Search />}>
            <div className="coordinator-filter-grid">
              <div className="coordinator-search-field">
                <Field label="Search coordinators">
                  <div className="coordinator-search-control">
                    <Search size={18} aria-hidden="true" />
                    <input placeholder="Name, mobile, email, referral, geography" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                </Field>
              </div>
              <Field label="Role">
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | CoordinatorRole)}>
                  <option value="all">All roles</option>
                  {coordinatorRoles.map((role) => <option value={role} key={role}>{formatRole(role)}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | CoordinatorStatus)}>
                  <option value="all">All statuses</option>
                  {coordinatorStatuses.map((status) => <option value={status} key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Campaign">
                <select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}>
                  <option value="all">All campaigns</option>
                  {campaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.title}</option>)}
                </select>
              </Field>
              <Field label="Geography">
                <select value={geographyFilter} onChange={(event) => setGeographyFilter(event.target.value)}>
                  <option value="all">All geographies</option>
                  {snapshot.geographies.map((geography) => <option value={geography.id} key={geography.id}>{geography.path.join(" › ")}</option>)}
                </select>
              </Field>
            </div>
            <p className="coordinator-filter-summary" aria-live="polite">
              Showing <strong>{filteredCoordinators.length}</strong> of <strong>{snapshot.coordinators.length}</strong> coordinators
            </p>
          </Panel>
          <Panel title={`Directory · ${filteredCoordinators.length}`} icon={<UsersRound />}>
            {filteredCoordinators.length === 0 ? (
              <div className="empty-state compact-empty">
                <span className="coordinator-state-icon" aria-hidden="true"><UsersRound size={26} /></span>
                <h3>No coordinators found</h3>
                <p>{snapshot.coordinators.length === 0 ? "Add the first verified coordinator to begin the network." : "Change the search or filters."}</p>
                {snapshot.coordinators.length === 0 && snapshot.canManage && (
                  <button className="primary-button" type="button" onClick={openCreateForm}><Plus size={18} /> Add coordinator</button>
                )}
              </div>
            ) : (
              <div className="coordinator-directory-grid">
                {filteredCoordinators.map((coordinator) => (
                  <article key={coordinator.id} className="coordinator-directory-card">
                    <button
                      aria-label={`Open profile for ${coordinator.fullName}`}
                      className="coordinator-profile-trigger"
                      type="button"
                      onClick={() => void showProfilePhoto(coordinator)}
                    >
                      <CircleUserRound size={30} />
                      <span><strong>{coordinator.fullName}</strong><small>{formatRole(coordinator.role)}</small></span>
                      <ChevronRight size={18} />
                    </button>
                    <div className="coordinator-directory-meta"><span className="status-pill" data-status={coordinator.status}>{coordinator.status}</span>{coordinator.mobileVerifiedAt && <span className="coordinator-verified-badge"><BadgeCheck size={15} /> Verified</span>}</div>
                    <p>{coordinatorGeographyLabel(coordinator, snapshot.geographies)}</p>
                    <small>{coordinator.referralCode}</small>
                    {snapshot.canManage && (
                      <div className="button-row coordinator-card-actions">
                        <button className="secondary-button" type="button" onClick={() => openEditForm(coordinator)}>Edit</button>
                        <select aria-label={`Change status for ${coordinator.fullName}`} value={coordinator.status} onChange={(event) => void updateStatus(coordinator, event.target.value as CoordinatorStatus)}>
                          {coordinatorStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                        <button className="danger-button icon-button" type="button" aria-label={`Delete ${coordinator.fullName}`} onClick={() => void deleteCoordinator(coordinator)}><Trash2 size={17} /></button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Panel>
          {selectedCoordinator && (
            <Panel title="Coordinator profile" icon={<CircleUserRound />}>
              <div className="coordinator-profile" aria-live="polite">
                <div className="coordinator-profile-photo">
                  {profilePhotoUrl ? <img src={profilePhotoUrl} alt={`${selectedCoordinator.fullName} profile`} /> : <CircleUserRound size={72} />}
                  {selectedCoordinator.photoPath && <button className="secondary-button" type="button" onClick={() => void showProfilePhoto(selectedCoordinator)}><Camera size={17} /> Open photo</button>}
                </div>
                <div className="coordinator-profile-details">
                  <h3>{selectedCoordinator.fullName}</h3>
                  <p>{formatRole(selectedCoordinator.role)} · {selectedCoordinator.status}</p>
                  <div><span>Mobile</span><strong>{selectedCoordinator.phone}</strong></div>
                  <div><span>Email</span><strong>{selectedCoordinator.email || "Not provided"}</strong></div>
                  <div><span>Geography</span><strong>{coordinatorGeographyLabel(selectedCoordinator, snapshot.geographies)}</strong></div>
                  <div><span>Referral code</span><strong>{selectedCoordinator.referralCode}</strong></div>
                  <div><span>Campaigns</span><strong>{snapshot.campaignLinks.filter((link) => link.coordinatorId === selectedCoordinator.id).length}</strong></div>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}

      {view === "tree" && (
        <div className="coordinator-view-panel" id="coordinator-tree-panel" role="tabpanel">
          <Panel title="Reporting hierarchy" icon={<GitBranch />}>
            <p className="coordinator-section-intro">Reporting lines flow from senior coordinators to their direct teams.</p>
            {reportingTree.length === 0 ? (
              <div className="empty-state compact-empty"><span className="coordinator-state-icon" aria-hidden="true"><GitBranch size={26} /></span><h3>No reporting hierarchy yet</h3><p>Add coordinators and assign reporting parents.</p></div>
            ) : (
              <ul className="coordinator-tree" role="tree" aria-label="Coordinator reporting hierarchy">
                {reportingTree.map((node) => <CoordinatorTreeBranch key={node.coordinator.id} node={node} />)}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {view === "activity" && (
        <div className="coordinator-view-panel" id="coordinator-activity-panel" role="tabpanel">
          <Panel title="Coordinator activity log" icon={<Activity />}>
            {snapshot.activity.length === 0 ? (
              <div className="empty-state compact-empty"><span className="coordinator-state-icon" aria-hidden="true"><Activity size={26} /></span><h3>No coordinator activity yet</h3><p>Server-recorded changes will appear here.</p></div>
            ) : (
              <div className="activity-list coordinator-activity-list">
                {snapshot.activity.map((entry) => {
                  const coordinator = entry.coordinatorId ? snapshot.coordinators.find((item) => item.id === entry.coordinatorId) : undefined;
                  return (
                    <article className="activity-card" key={entry.id}>
                      <div><strong>{formatActivity(entry.action)}</strong><span>{coordinator?.fullName ?? "Coordinator Network"}</span></div>
                      <time>{new Date(entry.createdAt).toLocaleString()}</time>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      {snapshot.canManage && !draft && (
        <button className="coordinator-fab" type="button" onClick={openCreateForm} aria-label="Create coordinator">
          <Plus size={22} /> <span>Create coordinator</span>
        </button>
      )}
    </section>
  );
}
