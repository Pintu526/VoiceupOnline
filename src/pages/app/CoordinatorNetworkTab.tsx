import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
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
  SlidersHorizontal,
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
  getCoordinatorCommandCenter,
  getCoordinatorLifecycle,
  getCoordinatorProfileWorkspace,
  getCoordinatorRoleLevel,
  validateCoordinatorDraft,
  type Coordinator,
  type CoordinatorActivity,
  type CoordinatorDraft,
  type CoordinatorGeography,
  type CoordinatorLifecycleAction,
  type CoordinatorNetworkSnapshot,
  type CoordinatorRole,
  type CoordinatorStatus,
  type CoordinatorTreeNode
} from "../../coordinators";
import { useTranslation } from "../../i18n";
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

type CoordinatorView = "dashboard" | "directory" | "profile" | "tree" | "activity";

interface LifecycleWizardState {
  action: CoordinatorLifecycleAction;
  step: number;
  reason: string;
  managerId: string;
  geographyId: string;
  campaignIds: string[];
  processing: boolean;
  complete: boolean;
  error: string;
}

const coordinatorViews: Exclude<CoordinatorView, "profile">[] = ["dashboard", "directory", "tree", "activity"];

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

function formatGeographyLevel(level: string) {
  return level.replace(/_/g, " ").replace(/^./, (value: string) => value.toUpperCase());
}

function formatCoordinatorDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatProfileDate(value: string, language: "en" | "hi" | "or") {
  const locale = language === "hi" ? "hi-IN" : language === "or" ? "or-IN" : "en-IN";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatStatusChange(activity: CoordinatorActivity) {
  const from = typeof activity.metadata.from === "string" ? activity.metadata.from : "Previous status";
  const to = typeof activity.metadata.to === "string" ? activity.metadata.to : "Updated";
  return `${from} → ${to}`;
}

function CoordinatorTreeBranch({
  node,
  onOpenProfile,
  depth = 0
}: {
  node: CoordinatorTreeNode;
  onOpenProfile: (coordinator: Coordinator) => void;
  depth?: number;
}) {
  return (
    <li className="coordinator-tree-node" role="treeitem" aria-expanded={node.children.length > 0 ? true : undefined}>
      <button className="coordinator-tree-card" type="button" onClick={() => onOpenProfile(node.coordinator)} style={{ "--coordinator-tree-depth": depth } as CSSProperties}>
        <CircleUserRound size={20} />
        <span>
          <strong>{node.coordinator.fullName}</strong>
          <small>{formatRole(node.coordinator.role)} · {node.coordinator.status}</small>
        </span>
      </button>
      {node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <CoordinatorTreeBranch key={child.coordinator.id} node={child} onOpenProfile={onOpenProfile} depth={depth + 1} />
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
  const { language, t } = useTranslation();
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
  const [lifecycleWizard, setLifecycleWizard] = useState<LifecycleWizardState | null>(null);

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

  const coordinatorById = useMemo(
    () => new Map((snapshot?.coordinators ?? []).map((coordinator) => [coordinator.id, coordinator])),
    [snapshot?.coordinators]
  );
  const campaignIdsByCoordinator = useMemo(() => {
    const links = new Map<string, string[]>();
    for (const link of snapshot?.campaignLinks ?? []) {
      links.set(link.coordinatorId, [...(links.get(link.coordinatorId) ?? []), link.campaignId]);
    }
    return links;
  }, [snapshot?.campaignLinks]);
  const campaignById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign])),
    [campaigns]
  );
  const selectedProfile = useMemo(
    () => snapshot ? getCoordinatorProfileWorkspace(snapshot, selectedCoordinatorId) : null,
    [selectedCoordinatorId, snapshot]
  );
  const selectedLifecycle = useMemo(
    () => snapshot ? getCoordinatorLifecycle(snapshot, selectedCoordinatorId) : null,
    [selectedCoordinatorId, snapshot]
  );
  const commandCenter = useMemo(
    () => snapshot ? getCoordinatorCommandCenter(snapshot) : null,
    [snapshot]
  );
  const reportingTree = useMemo(
    () => buildCoordinatorTree(snapshot?.coordinators ?? []),
    [snapshot?.coordinators]
  );
  const filteredCoordinators = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.coordinators.filter((coordinator) => {
      const geography = coordinatorGeographyLabel(coordinator, snapshot.geographies);
      const linkedCampaigns = campaignIdsByCoordinator.get(coordinator.id) ?? [];
      return coordinatorMatchesSearch(coordinator, geography, search)
        && (roleFilter === "all" || coordinator.role === roleFilter)
        && (statusFilter === "all" || coordinator.status === statusFilter)
        && (campaignFilter === "all" || linkedCampaigns.includes(campaignFilter))
        && (geographyFilter === "all" || coordinator.geographyId === geographyFilter);
    });
  }, [campaignFilter, campaignIdsByCoordinator, geographyFilter, roleFilter, search, snapshot, statusFilter]);

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

  function handleViewKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentView: Exclude<CoordinatorView, "profile">) {
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

  function openDirectoryControl(controlId: string) {
    setView("directory");
    requestAnimationFrame(() => document.getElementById(controlId)?.focus());
  }

  function showStatusDirectory(status: CoordinatorStatus) {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter(status);
    setCampaignFilter("all");
    setGeographyFilter("all");
    setView("directory");
  }

  function showRoleDirectory(role: CoordinatorRole) {
    setSearch("");
    setRoleFilter(role);
    setStatusFilter("all");
    setCampaignFilter("all");
    setGeographyFilter("all");
    setView("directory");
  }

  function showGeographyDirectory(geographyId: string) {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setCampaignFilter("all");
    setGeographyFilter(geographyId);
    setView("directory");
  }

  function showCoordinatorDirectory(coordinator: Coordinator) {
    void showProfilePhoto(coordinator);
  }

  function openLifecycleWizard(action: CoordinatorLifecycleAction, coordinator: Coordinator) {
    if (!snapshot?.canManage) return;
    if (action === "verify_mobile") {
      openEditForm(coordinator);
      return;
    }
    setLifecycleWizard({
      action,
      step: 0,
      reason: "",
      managerId: coordinator.reportsToCoordinatorId ?? "",
      geographyId: coordinator.geographyId,
      campaignIds: [...(campaignIdsByCoordinator.get(coordinator.id) ?? [])],
      processing: false,
      complete: false,
      error: ""
    });
  }

  function lifecycleWizardSteps(action: CoordinatorLifecycleAction) {
    const keys: Record<CoordinatorLifecycleAction, string[]> = {
      verify_mobile: ["verification"],
      activate: ["validation", "review", "complete"],
      transfer: ["manager", "geography", "campaign", "confirmation", "complete"],
      suspend: ["reason", "confirmation", "complete"],
      reactivate: ["review", "confirmation", "complete"],
      archive: ["warning", "confirmation", "complete"]
    };
    return keys[action];
  }

  function canAdvanceLifecycleWizard() {
    if (!lifecycleWizard || !selectedProfile) return false;
    if ((lifecycleWizard.action === "suspend" || lifecycleWizard.action === "archive")
      && lifecycleWizard.step === 0
      && lifecycleWizard.reason.trim().length < 3) return false;
    if (lifecycleWizard.action === "archive" && selectedProfile.directReports.length > 0) return false;
    if (lifecycleWizard.action === "activate" && !selectedProfile.coordinator.mobileVerifiedAt) return false;
    if (lifecycleWizard.action === "transfer" && lifecycleWizard.step === 1 && !lifecycleWizard.geographyId) return false;
    return true;
  }

  async function completeLifecycleAction() {
    if (!lifecycleWizard || !selectedProfile || !snapshot?.canManage) return;
    const coordinator = selectedProfile.coordinator;
    setLifecycleWizard((current) => current ? { ...current, processing: true, error: "" } : current);
    try {
      if (lifecycleWizard.action === "transfer") {
        const geography = snapshot.geographies.find((item) => item.id === lifecycleWizard.geographyId);
        if (!geography) throw new Error(t("coordinatorLifecycle.errors.geographyRequired"));
        await saveCoordinator(snapshot.workspaceId, {
          ...draftForCoordinator(coordinator, snapshot),
          reportsToCoordinatorId: lifecycleWizard.managerId,
          geography: geographyInputFor(geography.id, snapshot.geographies, coordinator.postalCode),
          campaignIds: lifecycleWizard.campaignIds
        });
      } else if (lifecycleWizard.action === "archive") {
        await removeCoordinator({
          workspaceId: snapshot.workspaceId,
          coordinatorId: coordinator.id,
          expectedVersion: coordinator.version
        });
        await refreshNetwork();
        setLifecycleWizard(null);
        setView("directory");
        setMessage(t("coordinatorLifecycle.success.archive"));
        return;
      } else {
        const status: CoordinatorStatus = lifecycleWizard.action === "suspend" ? "suspended" : "active";
        await changeCoordinatorStatus({
          workspaceId: snapshot.workspaceId,
          coordinatorId: coordinator.id,
          status,
          expectedVersion: coordinator.version
        });
      }
      await refreshNetwork();
      setLifecycleWizard((current) => current ? { ...current, processing: false, complete: true, step: lifecycleWizardSteps(current.action).length - 1 } : current);
    } catch (lifecycleError) {
      setLifecycleWizard((current) => current ? {
        ...current,
        processing: false,
        error: lifecycleError instanceof Error ? lifecycleError.message : t("coordinatorLifecycle.errors.actionFailed")
      } : current);
    }
  }

  async function advanceLifecycleWizard() {
    if (!lifecycleWizard || !canAdvanceLifecycleWizard()) return;
    const confirmationStep = lifecycleWizardSteps(lifecycleWizard.action).length - 2;
    if (lifecycleWizard.step >= confirmationStep) {
      await completeLifecycleAction();
      return;
    }
    setLifecycleWizard({ ...lifecycleWizard, step: lifecycleWizard.step + 1, error: "" });
  }

  function scrollProfileSection(section: "hierarchy" | "activity") {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(`coordinator-profile-${section}`)?.scrollIntoView({ behavior, block: "start" });
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

  async function showProfilePhoto(coordinator: Coordinator) {
    setSelectedCoordinatorId(coordinator.id);
    setView("profile");
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
              aria-selected={view === item || (view === "profile" && item === "directory")}
              className={view === item || (view === "profile" && item === "directory") ? "active" : ""}
              data-coordinator-view={item}
              role="tab"
              tabIndex={view === item || (view === "profile" && item === "directory") ? 0 : -1}
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
            <Field label={t("coordinatorLifecycle.card.currentStatus")}>
              <div className="coordinator-lifecycle-form-status">
                <span className="status-pill" data-status={draft.status}>{t(`coordinatorProfile.statuses.${draft.status}`)}</span>
                <small>{draft.version ? t("coordinatorLifecycle.form.statusManaged") : t("coordinatorLifecycle.form.inviteReadyOnSave")}</small>
              </div>
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

      {view === "dashboard" && commandCenter && (
        <div className="coordinator-view-panel coordinator-dashboard" id="coordinator-dashboard-panel" role="tabpanel">
          <div className="coordinator-command-heading">
            <div>
              <span className="eyebrow">Operational command center</span>
              <h2>Coordinator network at a glance</h2>
              <p>Live workspace totals, coverage, and activity derived from the current Coordinator Network snapshot.</p>
            </div>
            <span className="coordinator-live-indicator"><span /> Live workspace data</span>
          </div>
          <div className="metric-grid coordinator-metric-grid">
            <MetricCard icon={<UsersRound />} label="Coordinators" value={commandCenter.metrics.total} detail="Persisted profiles" />
            <MetricCard icon={<BadgeCheck />} label="Active" value={commandCenter.metrics.active} detail="Operational status" />
            <MetricCard icon={<Phone />} label="Mobile verified" value={commandCenter.metrics.mobileVerified} detail="OTP-verified profiles" />
            <MetricCard icon={<MapPin />} label="Geographies" value={commandCenter.metrics.geographyCoverage} detail="Directly assigned areas" />
            <MetricCard icon={<GitBranch />} label="Campaign linked" value={commandCenter.metrics.linkedToCampaign} detail="Assigned coordinators" />
            <MetricCard icon={<Network />} label="Referrals" value={commandCenter.metrics.referralLinks} detail="Accepted coordinator referrals" />
          </div>

          <Panel title={t("coordinatorLifecycle.commandCenter.title")} icon={<BadgeCheck />}>
            <div className="coordinator-lifecycle-metrics">
              {(["active", "suspended", "verified", "pending", "archived"] as const).map((metric) => (
                <div key={metric}>
                  <strong>{commandCenter.lifecycle[metric]}</strong>
                  <span>{t(`coordinatorLifecycle.commandCenter.${metric}`)}</span>
                </div>
              ))}
            </div>
            <p className="coordinator-lifecycle-source-note">{t("coordinatorLifecycle.commandCenter.auditWindow")}</p>
          </Panel>

          <Panel title="Quick actions" icon={<ShieldCheck />}>
            <div className="coordinator-quick-actions" aria-label="Coordinator quick actions">
              {snapshot.canManage && (
                <button className="coordinator-quick-action primary" type="button" onClick={openCreateForm}>
                  <Plus size={20} /><span><strong>Create coordinator</strong><small>Add a verified network member</small></span>
                </button>
              )}
              <button className="coordinator-quick-action" type="button" onClick={() => openDirectoryControl("coordinator-directory-search")}>
                <Search size={20} /><span><strong>Search directory</strong><small>Find a coordinator or geography</small></span>
              </button>
              <button className="coordinator-quick-action" type="button" onClick={() => openDirectoryControl("coordinator-directory-role-filter")}>
                <SlidersHorizontal size={20} /><span><strong>Filter network</strong><small>Narrow by role, status, or assignment</small></span>
              </button>
              <button className="coordinator-quick-action" type="button" disabled={loading} onClick={() => void refreshNetwork()}>
                <RefreshCw size={20} /><span><strong>{loading ? "Refreshing…" : "Refresh data"}</strong><small>Reload the workspace snapshot</small></span>
              </button>
            </div>
          </Panel>

          <div className="two-column coordinator-dashboard-overview">
            <Panel title="Status distribution" icon={<BadgeCheck />}>
              <div className="coordinator-distribution-list">
                {commandCenter.statusDistribution.map((item) => (
                  <button type="button" key={item.status} onClick={() => showStatusDirectory(item.status)}>
                    <span className="coordinator-distribution-heading"><strong>{formatGeographyLevel(item.status)}</strong><span>{item.count} · {item.percentage}%</span></span>
                    <span className="coordinator-distribution-track" aria-hidden="true"><span style={{ width: `${item.percentage}%` }} /></span>
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Role distribution" icon={<UsersRound />}>
              <div className="coordinator-distribution-list">
                {commandCenter.roleDistribution.map((item) => (
                  <button type="button" key={item.role} onClick={() => showRoleDirectory(item.role)}>
                    <span className="coordinator-distribution-heading"><strong>{formatRole(item.role)}</strong><span>{item.count} · {item.percentage}%</span></span>
                    <span className="coordinator-distribution-track" aria-hidden="true"><span style={{ width: `${item.percentage}%` }} /></span>
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Geographic coverage" icon={<MapPin />}>
            {commandCenter.coverage.known === 0 ? (
              <div className="empty-state compact-empty"><span className="coordinator-state-icon" aria-hidden="true"><MapPin size={26} /></span><h3>No saved geography hierarchy yet</h3><p>Coverage will appear after coordinators are assigned to saved areas.</p></div>
            ) : (
              <div className="coordinator-coverage-layout">
                <div className="coordinator-coverage-summary">
                  <strong>{commandCenter.coverage.covered}<span> / {commandCenter.coverage.known}</span></strong>
                  <p>Known geography nodes covered by at least one coordinator in that branch.</p>
                </div>
                <div className="coordinator-coverage-levels">
                  {commandCenter.coverage.byLevel.map((item) => {
                    const coveragePercentage = Math.round((item.covered / item.known) * 100);
                    return (
                      <div key={item.level}>
                        <span className="coordinator-distribution-heading"><strong>{formatGeographyLevel(item.level)}</strong><span>{item.covered}/{item.known} covered · {item.coordinators} assigned</span></span>
                        <span className="coordinator-distribution-track" aria-hidden="true"><span style={{ width: `${coveragePercentage}%` }} /></span>
                      </div>
                    );
                  })}
                </div>
                <div className={`coordinator-coverage-gaps${commandCenter.coverage.gaps.length > 0 ? " has-gaps" : ""}`}>
                  <strong>{commandCenter.coverage.gaps.length > 0 ? "Coverage gaps in known areas" : "Known hierarchy covered"}</strong>
                  {commandCenter.coverage.gaps.length > 0 ? (
                    <div>
                      {commandCenter.coverage.gaps.slice(0, 8).map((geography) => (
                        <button type="button" key={geography.id} onClick={() => showGeographyDirectory(geography.id)}>{geography.path.join(" › ")}</button>
                      ))}
                      {commandCenter.coverage.gaps.length > 8 && <small>+{commandCenter.coverage.gaps.length - 8} more known areas</small>}
                    </div>
                  ) : <p>Every saved geography branch has at least one coordinator assignment.</p>}
                </div>
              </div>
            )}
          </Panel>

          <div className="coordinator-command-activity-grid">
            <Panel title="Recent activity" icon={<Activity />}>
              {commandCenter.recentActivity.length === 0 ? (
                <p className="coordinator-command-empty">No coordinator activity has been recorded.</p>
              ) : (
                <div className="coordinator-command-list">
                  {commandCenter.recentActivity.map((entry) => {
                    const coordinator = entry.coordinatorId ? coordinatorById.get(entry.coordinatorId) : undefined;
                    return <article key={entry.id}><span className="coordinator-state-icon" aria-hidden="true"><Activity size={17} /></span><div><strong>{formatActivity(entry.action)}</strong><span>{coordinator?.fullName ?? "Coordinator Network"}</span><time dateTime={entry.createdAt}>{formatCoordinatorDate(entry.createdAt)}</time></div></article>;
                  })}
                </div>
              )}
            </Panel>
            <Panel title="Recently added" icon={<UserCheck />}>
              {commandCenter.recentlyAdded.length === 0 ? (
                <p className="coordinator-command-empty">No coordinators have been added yet.</p>
              ) : (
                <div className="coordinator-command-list">
                  {commandCenter.recentlyAdded.map((coordinator) => (
                    <button type="button" key={coordinator.id} onClick={() => showCoordinatorDirectory(coordinator)}><span className="coordinator-state-icon" aria-hidden="true"><CircleUserRound size={17} /></span><span><strong>{coordinator.fullName}</strong><small>{formatRole(coordinator.role)}</small><time dateTime={coordinator.createdAt}>{formatCoordinatorDate(coordinator.createdAt)}</time></span><ChevronRight size={17} aria-hidden="true" /></button>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Recent status changes" icon={<BadgeCheck />}>
              {commandCenter.recentStatusChanges.length === 0 ? (
                <p className="coordinator-command-empty">No status changes have been recorded.</p>
              ) : (
                <div className="coordinator-command-list">
                  {commandCenter.recentStatusChanges.map((entry) => {
                    const coordinator = entry.coordinatorId ? coordinatorById.get(entry.coordinatorId) : undefined;
                    return <article key={entry.id}><span className="coordinator-state-icon" aria-hidden="true"><BadgeCheck size={17} /></span><div><strong>{coordinator?.fullName ?? "Coordinator"}</strong><span>{formatStatusChange(entry)}</span><time dateTime={entry.createdAt}>{formatCoordinatorDate(entry.createdAt)}</time></div></article>;
                  })}
                </div>
              )}
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
                    <input id="coordinator-directory-search" placeholder="Name, mobile, email, referral, geography" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                </Field>
              </div>
              <Field label="Role">
                <select id="coordinator-directory-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | CoordinatorRole)}>
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
                        <button className="secondary-button" type="button" onClick={() => void showProfilePhoto(coordinator)}>{t("coordinatorLifecycle.actions.manage")}</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {view === "profile" && selectedProfile && (
        <div className="coordinator-view-panel coordinator-profile-workspace" id="coordinator-profile-panel" role="tabpanel">
          <div className="coordinator-profile-sticky">
            <button className="secondary-button" type="button" onClick={() => setView("directory")}>
              <ArrowLeft size={18} /> {t("coordinatorProfile.actions.back")}
            </button>
            <div className="coordinator-profile-sticky-identity">
              <CircleUserRound size={22} />
              <span>
                <strong>{selectedProfile.coordinator.fullName}</strong>
                <small>{t(`coordinatorProfile.roles.${selectedProfile.coordinator.role}`)}</small>
              </span>
            </div>
            <div className="coordinator-profile-sticky-actions">
              <button className="secondary-button" type="button" onClick={() => openDirectoryControl("coordinator-directory-search")}>
                <Search size={18} /> {t("coordinatorProfile.actions.search")}
              </button>
              {snapshot.canManage && (
                <button className="primary-button" type="button" onClick={() => openEditForm(selectedProfile.coordinator)}>
                  {t("coordinatorProfile.actions.edit")}
                </button>
              )}
            </div>
          </div>

          <section className="coordinator-profile-hero" aria-labelledby="coordinator-profile-name">
            <div className="coordinator-profile-hero-photo">
              {profilePhotoUrl ? (
                <img src={profilePhotoUrl} alt={`${selectedProfile.coordinator.fullName} ${t("coordinatorProfile.photoAlt")}`} />
              ) : (
                <CircleUserRound size={92} aria-hidden="true" />
              )}
              {selectedProfile.coordinator.photoPath && (
                <button className="secondary-button" type="button" onClick={() => void showProfilePhoto(selectedProfile.coordinator)}>
                  <Camera size={17} /> {t("coordinatorProfile.actions.openPhoto")}
                </button>
              )}
            </div>
            <div className="coordinator-profile-hero-main">
              <span className="eyebrow">{t("coordinatorProfile.workspace")}</span>
              <h2 id="coordinator-profile-name">{selectedProfile.coordinator.fullName}</h2>
              <div className="coordinator-profile-badges">
                <span>{t(`coordinatorProfile.roles.${selectedProfile.coordinator.role}`)}</span>
                <span className="status-pill" data-status={selectedProfile.coordinator.status}>
                  {t(`coordinatorProfile.statuses.${selectedProfile.coordinator.status}`)}
                </span>
                {selectedProfile.coordinator.mobileVerifiedAt && (
                  <span className="coordinator-verified-badge"><BadgeCheck size={15} /> {t("coordinatorProfile.summary.verified")}</span>
                )}
              </div>
              <div className="coordinator-profile-hero-facts">
                <div><span>{t("coordinatorProfile.hero.reportingManager")}</span><strong>{selectedProfile.manager?.fullName ?? t("coordinatorProfile.hero.noManager")}</strong></div>
                <div><span>{t("coordinatorProfile.hero.assignedGeography")}</span><strong>{selectedProfile.geography?.path.join(" › ") ?? t("coordinatorProfile.notRecorded")}</strong></div>
                <div><span>{t("coordinatorProfile.hero.campaigns")}</span><strong>{selectedProfile.campaignLinks.length}</strong></div>
                <div><span>{t("coordinatorProfile.hero.lastActivity")}</span><strong>{selectedProfile.lastActivityAt ? formatProfileDate(selectedProfile.lastActivityAt, language) : t("coordinatorProfile.hero.noActivity")}</strong></div>
              </div>
              <div className="button-row coordinator-profile-quick-actions" aria-label={t("coordinatorProfile.quickActions")}>
                {snapshot.canManage && <button className="primary-button" type="button" onClick={() => openEditForm(selectedProfile.coordinator)}>{t("coordinatorProfile.actions.edit")}</button>}
                <button className="secondary-button" type="button" onClick={() => scrollProfileSection("hierarchy")}><GitBranch size={18} /> {t("coordinatorProfile.actions.viewHierarchy")}</button>
                <button className="secondary-button" type="button" onClick={() => scrollProfileSection("activity")}><Activity size={18} /> {t("coordinatorProfile.actions.viewActivity")}</button>
              </div>
            </div>
          </section>

          {selectedLifecycle && (
            <>
              <div className="coordinator-profile-section-grid coordinator-lifecycle-overview">
                <Panel title={t("coordinatorLifecycle.timeline.title")} icon={<GitBranch />}>
                  <div className="coordinator-lifecycle-context">
                    <div><span>{t("coordinatorLifecycle.timeline.previous")}</span><strong>{selectedLifecycle.previousStage ? t(`coordinatorLifecycle.stages.${selectedLifecycle.previousStage}`) : t("coordinatorLifecycle.notRecorded")}</strong></div>
                    <div><span>{t("coordinatorLifecycle.timeline.current")}</span><strong>{t(`coordinatorLifecycle.stages.${selectedLifecycle.currentStage}`)}</strong></div>
                    <div><span>{t("coordinatorLifecycle.timeline.next")}</span><strong>{selectedLifecycle.actions.length ? selectedLifecycle.actions.map((action) => t(`coordinatorLifecycle.actions.${action}`)).join(" · ") : t("coordinatorLifecycle.timeline.none")}</strong></div>
                  </div>
                  <ol className="coordinator-lifecycle-timeline" aria-label={t("coordinatorLifecycle.timeline.ariaLabel")}>
                    {selectedLifecycle.milestones.map((milestone) => (
                      <li className={milestone.current ? "current" : milestone.completed ? "completed" : ""} key={milestone.stage}>
                        <span aria-hidden="true">{milestone.completed ? "✓" : ""}</span>
                        <strong>{t(`coordinatorLifecycle.stages.${milestone.stage}`)}</strong>
                      </li>
                    ))}
                  </ol>
                  <p className="coordinator-lifecycle-source-note">{t("coordinatorLifecycle.timeline.sourceNote")}</p>
                </Panel>

                <Panel title={t("coordinatorLifecycle.card.title")} icon={<BadgeCheck />}>
                  <div className="coordinator-lifecycle-card-grid">
                    <div><span>{t("coordinatorLifecycle.card.currentStatus")}</span><strong>{t(`coordinatorLifecycle.stages.${selectedLifecycle.currentStage}`)}</strong></div>
                    <div><span>{t("coordinatorLifecycle.card.created")}</span><strong>{formatProfileDate(selectedLifecycle.dates.created, language)}</strong></div>
                    <div><span>{t("coordinatorLifecycle.card.verified")}</span><strong>{selectedLifecycle.dates.verified ? formatProfileDate(selectedLifecycle.dates.verified, language) : t("coordinatorLifecycle.notRecorded")}</strong></div>
                    <div><span>{t("coordinatorLifecycle.card.activated")}</span><strong>{selectedLifecycle.dates.activated ? formatProfileDate(selectedLifecycle.dates.activated, language) : t("coordinatorLifecycle.notRecorded")}</strong></div>
                    <div><span>{t("coordinatorLifecycle.card.lastUpdated")}</span><strong>{formatProfileDate(selectedLifecycle.dates.updated, language)}</strong></div>
                    <div><span>{t("coordinatorLifecycle.card.manager")}</span><strong>{selectedProfile.manager?.fullName ?? t("coordinatorLifecycle.notRecorded")}</strong></div>
                    <div className="coordinator-lifecycle-card-wide"><span>{t("coordinatorLifecycle.card.geography")}</span><strong>{selectedProfile.geography?.path.join(" › ") ?? t("coordinatorLifecycle.notRecorded")}</strong></div>
                  </div>
                </Panel>
              </div>

              <Panel title={t("coordinatorLifecycle.transitions.title")} icon={<ShieldCheck />}>
                <p className="coordinator-lifecycle-source-note">{t("coordinatorLifecycle.transitions.help")}</p>
                {snapshot.canManage ? (
                  <div className="coordinator-lifecycle-actions">
                    {selectedLifecycle.actions.map((action) => (
                      <button className={action === "archive" ? "danger-button" : action === "activate" || action === "reactivate" ? "primary-button" : "secondary-button"} type="button" key={action} onClick={() => openLifecycleWizard(action, selectedProfile.coordinator)}>
                        {action === "archive" ? <Trash2 size={18} /> : action === "transfer" ? <GitBranch size={18} /> : <BadgeCheck size={18} />}
                        <span><strong>{t(`coordinatorLifecycle.actions.${action}`)}</strong><small>{t(`coordinatorLifecycle.actionHelp.${action}`)}</small></span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="coordinator-lifecycle-readonly"><ShieldCheck size={18} /> {t("coordinatorLifecycle.transitions.readOnly")}</p>
                )}
              </Panel>
            </>
          )}

          <div className="coordinator-profile-section-grid">
            <Panel title={t("coordinatorProfile.sections.summary")} icon={<CircleUserRound />}>
              <div className="coordinator-profile-fact-grid">
                <div className="coordinator-profile-fact"><span>{t("coordinatorProfile.summary.fullName")}</span><strong>{selectedProfile.coordinator.fullName}</strong></div>
                <div className="coordinator-profile-fact"><span>{t("coordinatorProfile.summary.mobile")}</span><strong>{selectedProfile.coordinator.phone}</strong></div>
                <div className="coordinator-profile-fact"><span>{t("coordinatorProfile.summary.email")}</span><strong>{selectedProfile.coordinator.email || t("coordinatorProfile.summary.notProvided")}</strong></div>
                <div className="coordinator-profile-fact"><span>{t("coordinatorProfile.summary.verification")}</span><strong>{selectedProfile.coordinator.mobileVerifiedAt ? t("coordinatorProfile.summary.verified") : t("coordinatorProfile.summary.notVerified")}</strong></div>
                <div className="coordinator-profile-fact"><span>{t("coordinatorProfile.summary.referralCode")}</span><strong>{selectedProfile.coordinator.referralCode}</strong></div>
                <div className="coordinator-profile-fact"><span>{t("coordinatorProfile.summary.accountStatus")}</span><strong>{t(`coordinatorProfile.statuses.${selectedProfile.coordinator.status}`)}</strong></div>
                <div className="coordinator-profile-fact coordinator-profile-fact-wide"><span>{t("coordinatorProfile.summary.reportingChain")}</span><strong>{selectedProfile.reportingChain.length ? [...selectedProfile.reportingChain.map((item) => item.fullName), selectedProfile.coordinator.fullName].join(" › ") : t("coordinatorProfile.summary.noReportingChain")}</strong></div>
              </div>
            </Panel>

            <Panel title={t("coordinatorProfile.sections.geography")} icon={<MapPin />}>
              <div className="coordinator-profile-fact-grid">
                {(["country", "state", "district", "block", "panchayat", "ward"] as const).map((level) => (
                  <div className="coordinator-profile-fact" key={level}>
                    <span>{t(`coordinatorProfile.geography.${level}`)}</span>
                    <strong>{selectedProfile.geographyChain.find((item) => item.level === level)?.name ?? t("coordinatorProfile.notRecorded")}</strong>
                  </div>
                ))}
                <div className="coordinator-profile-fact"><span>{t("coordinatorProfile.geography.village")}</span><strong>{t("coordinatorProfile.notRecorded")}</strong></div>
                <div className="coordinator-profile-fact coordinator-profile-fact-wide"><span>{t("coordinatorProfile.geography.coverageHierarchy")}</span><strong>{selectedProfile.geographyChain.length ? selectedProfile.geographyChain.map((item) => item.name).join(" › ") : t("coordinatorProfile.notRecorded")}</strong></div>
              </div>
            </Panel>
          </div>

          <Panel title={t("coordinatorProfile.sections.campaigns")} icon={<ShieldCheck />}>
            {selectedProfile.campaignLinks.length === 0 ? (
              <div className="empty-state compact-empty"><GitBranch size={25} aria-hidden="true" /><h3>{t("coordinatorProfile.campaigns.noCampaigns")}</h3></div>
            ) : (
              <div className="coordinator-profile-campaigns">
                {selectedProfile.campaignLinks.map((link) => {
                  const campaign = campaignById.get(link.campaignId);
                  return (
                    <article key={`${link.campaignId}-${link.assignedAt}`}>
                      <div><strong>{campaign?.title ?? link.campaignId}</strong><span>{campaign ? t(`coordinatorProfile.campaignStatuses.${String(campaign.status).toLowerCase()}`) : t("coordinatorProfile.notAvailable")}</span></div>
                      <time dateTime={link.assignedAt}>{t("coordinatorProfile.campaigns.assignedOn")} {formatProfileDate(link.assignedAt, language)}</time>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={t("coordinatorProfile.sections.hierarchy")} icon={<GitBranch />}>
            <div className="coordinator-profile-hierarchy" id="coordinator-profile-hierarchy">
              <div><span>{t("coordinatorProfile.hierarchy.manager")}</span>{selectedProfile.manager ? <button type="button" onClick={() => void showProfilePhoto(selectedProfile.manager!)}>{selectedProfile.manager.fullName}<small>{t(`coordinatorProfile.roles.${selectedProfile.manager.role}`)}</small></button> : <strong>{t("coordinatorProfile.hierarchy.noManager")}</strong>}</div>
              <div className="coordinator-profile-hierarchy-current"><span>{t("coordinatorProfile.hierarchy.currentCoordinator")}</span><strong>{selectedProfile.coordinator.fullName}</strong></div>
              <div><span>{t("coordinatorProfile.hierarchy.directReports")}</span>{selectedProfile.directReports.length ? selectedProfile.directReports.map((report) => <button type="button" key={report.id} onClick={() => void showProfilePhoto(report)}>{report.fullName}<small>{t(`coordinatorProfile.roles.${report.role}`)}</small></button>) : <strong>{t("coordinatorProfile.hierarchy.noDirectReports")}</strong>}</div>
            </div>
          </Panel>

          <div className="coordinator-profile-section-grid">
            <Panel title={t("coordinatorProfile.sections.activity")} icon={<Activity />}>
              <div id="coordinator-profile-activity">
                {selectedProfile.timeline.length === 0 ? (
                  <div className="empty-state compact-empty"><Activity size={25} aria-hidden="true" /><h3>{t("coordinatorProfile.activity.noActivity")}</h3></div>
                ) : (
                  <div className="coordinator-profile-timeline">
                    {selectedProfile.timeline.map((item) => {
                      const campaign = item.kind === "assignment" ? campaignById.get(item.campaignLink.campaignId) : undefined;
                      const activityKey = item.kind === "audit" ? item.activity.action.replace("coordinator.", "") : "assignment";
                      return (
                        <article key={item.id}>
                          <span aria-hidden="true" />
                          <div><strong>{t(`coordinatorProfile.activity.actions.${activityKey}`)}</strong>{item.kind === "assignment" && <small>{campaign?.title ?? item.campaignLink.campaignId}</small>}<time dateTime={item.createdAt}>{formatProfileDate(item.createdAt, language)}</time></div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>

            <Panel title={t("coordinatorProfile.sections.performance")} icon={<BadgeCheck />}>
              <p className="coordinator-profile-performance-note">{t("coordinatorProfile.performance.factualHelp")}</p>
              <div className="coordinator-profile-scorecard">
                <div><strong>{selectedProfile.scorecard.assignments}</strong><span>{t("coordinatorProfile.performance.assignments")}</span></div>
                <div><strong>{selectedProfile.scorecard.activityEvents}</strong><span>{t("coordinatorProfile.performance.events")}</span></div>
                <div><strong>{selectedProfile.scorecard.coverageLevels}</strong><span>{t("coordinatorProfile.performance.levels")}</span></div>
                <div><strong>{selectedProfile.scorecard.directReports}</strong><span>{t("coordinatorProfile.performance.reports")}</span></div>
              </div>
            </Panel>
          </div>

          {lifecycleWizard && selectedLifecycle && (
            <div className="coordinator-lifecycle-dialog-backdrop" role="presentation">
              <section className="coordinator-lifecycle-dialog" role="dialog" aria-modal="true" aria-labelledby="coordinator-lifecycle-dialog-title">
                <header>
                  <div>
                    <span className="eyebrow">{t("coordinatorLifecycle.wizard.eyebrow")}</span>
                    <h2 id="coordinator-lifecycle-dialog-title">{t(`coordinatorLifecycle.wizard.titles.${lifecycleWizard.action}`)}</h2>
                  </div>
                  <button className="secondary-button icon-button" type="button" aria-label={t("coordinatorLifecycle.wizard.close")} disabled={lifecycleWizard.processing} onClick={() => setLifecycleWizard(null)}>×</button>
                </header>

                <ol className="coordinator-lifecycle-progress" aria-label={t("coordinatorLifecycle.wizard.progress")}>
                  {lifecycleWizardSteps(lifecycleWizard.action).map((step, index) => (
                    <li className={index === lifecycleWizard.step ? "current" : index < lifecycleWizard.step ? "complete" : ""} key={step}>
                      <span>{index < lifecycleWizard.step ? "✓" : index + 1}</span>
                      <strong>{t(`coordinatorLifecycle.wizard.steps.${step}`)}</strong>
                    </li>
                  ))}
                </ol>

                <div className="coordinator-lifecycle-dialog-body">
                  {lifecycleWizard.complete ? (
                    <div className="coordinator-lifecycle-success" role="status">
                      <BadgeCheck size={38} />
                      <h3>{t(`coordinatorLifecycle.success.${lifecycleWizard.action}`)}</h3>
                      <p>{t("coordinatorLifecycle.success.auditRecorded")}</p>
                    </div>
                  ) : lifecycleWizard.action === "activate" && lifecycleWizard.step === 0 ? (
                    <div className="coordinator-lifecycle-checklist">
                      <div data-ready={Boolean(selectedProfile.coordinator.mobileVerifiedAt)}><BadgeCheck size={19} /><span><strong>{t("coordinatorLifecycle.validation.mobile")}</strong><small>{selectedProfile.coordinator.mobileVerifiedAt ? t("coordinatorLifecycle.validation.ready") : t("coordinatorLifecycle.validation.missing")}</small></span></div>
                      <div data-ready={Boolean(selectedProfile.geography)}><MapPin size={19} /><span><strong>{t("coordinatorLifecycle.validation.geography")}</strong><small>{selectedProfile.geography?.path.join(" › ") ?? t("coordinatorLifecycle.validation.missing")}</small></span></div>
                      <div data-ready><GitBranch size={19} /><span><strong>{t("coordinatorLifecycle.validation.manager")}</strong><small>{selectedProfile.manager?.fullName ?? t("coordinatorLifecycle.validation.noManager")}</small></span></div>
                    </div>
                  ) : lifecycleWizard.action === "transfer" && lifecycleWizard.step === 0 ? (
                    <Field label={t("coordinatorLifecycle.transfer.manager")}>
                      <select value={lifecycleWizard.managerId} onChange={(event) => setLifecycleWizard({ ...lifecycleWizard, managerId: event.target.value })}>
                        <option value="">{t("coordinatorLifecycle.transfer.noManager")}</option>
                        {snapshot.coordinators
                          .filter((item) => item.id !== selectedProfile.coordinator.id && roleRank[item.role] > roleRank[selectedProfile.coordinator.role])
                          .map((item) => <option key={item.id} value={item.id}>{item.fullName} · {t(`coordinatorProfile.roles.${item.role}`)}</option>)}
                      </select>
                    </Field>
                  ) : lifecycleWizard.action === "transfer" && lifecycleWizard.step === 1 ? (
                    <Field label={t("coordinatorLifecycle.transfer.geography")}>
                      <select value={lifecycleWizard.geographyId} onChange={(event) => setLifecycleWizard({ ...lifecycleWizard, geographyId: event.target.value })}>
                        {snapshot.geographies
                          .filter((geography) => geography.level === getCoordinatorRoleLevel(selectedProfile.coordinator.role))
                          .map((geography) => <option key={geography.id} value={geography.id}>{geography.path.join(" › ")}</option>)}
                      </select>
                    </Field>
                  ) : lifecycleWizard.action === "transfer" && lifecycleWizard.step === 2 ? (
                    <fieldset className="coordinator-lifecycle-campaign-options">
                      <legend>{t("coordinatorLifecycle.transfer.campaigns")}</legend>
                      {campaigns.length ? campaigns.map((campaign) => (
                        <label key={campaign.id}>
                          <input type="checkbox" checked={lifecycleWizard.campaignIds.includes(campaign.id)} onChange={(event) => setLifecycleWizard({
                            ...lifecycleWizard,
                            campaignIds: event.target.checked
                              ? [...lifecycleWizard.campaignIds, campaign.id]
                              : lifecycleWizard.campaignIds.filter((id) => id !== campaign.id)
                          })} />
                          <span><strong>{campaign.title}</strong><small>{t(`coordinatorProfile.campaignStatuses.${campaign.status.toLowerCase()}`)}</small></span>
                        </label>
                      )) : <p>{t("coordinatorLifecycle.transfer.noCampaigns")}</p>}
                    </fieldset>
                  ) : (lifecycleWizard.action === "suspend" || lifecycleWizard.action === "archive") && lifecycleWizard.step === 0 ? (
                    <Field label={t(`coordinatorLifecycle.${lifecycleWizard.action}.reason`)}>
                      <textarea autoFocus rows={4} maxLength={500} value={lifecycleWizard.reason} onChange={(event) => setLifecycleWizard({ ...lifecycleWizard, reason: event.target.value })} />
                      <small>{t("coordinatorLifecycle.wizard.reasonAuditNote")}</small>
                      {lifecycleWizard.action === "archive" && selectedProfile.directReports.length > 0 && <span className="field-error">{t("coordinatorLifecycle.archive.directReportsBlock")}</span>}
                    </Field>
                  ) : lifecycleWizard.step === lifecycleWizardSteps(lifecycleWizard.action).length - 2 ? (
                    <div className="coordinator-lifecycle-confirmation">
                      <AlertCircle size={30} />
                      <h3>{t(`coordinatorLifecycle.confirmation.${lifecycleWizard.action}`)}</h3>
                      <dl>
                        <div><dt>{t("coordinatorLifecycle.confirmation.coordinator")}</dt><dd>{selectedProfile.coordinator.fullName}</dd></div>
                        <div><dt>{t("coordinatorLifecycle.card.currentStatus")}</dt><dd>{t(`coordinatorLifecycle.stages.${selectedLifecycle.currentStage}`)}</dd></div>
                        {lifecycleWizard.action === "transfer" && <div><dt>{t("coordinatorLifecycle.transfer.geography")}</dt><dd>{snapshot.geographies.find((item) => item.id === lifecycleWizard.geographyId)?.path.join(" › ") ?? t("coordinatorLifecycle.notRecorded")}</dd></div>}
                      </dl>
                    </div>
                  ) : (
                    <div className="coordinator-lifecycle-review">
                      <BadgeCheck size={30} />
                      <h3>{t(`coordinatorLifecycle.review.${lifecycleWizard.action}`)}</h3>
                      <p>{t("coordinatorLifecycle.review.serverValidation")}</p>
                    </div>
                  )}
                  {lifecycleWizard.error && <p className="error-message" role="alert">{lifecycleWizard.error}</p>}
                </div>

                <footer className="coordinator-lifecycle-dialog-actions">
                  {lifecycleWizard.complete ? (
                    <>
                      {lifecycleWizard.action === "suspend" && (
                        <button className="secondary-button" type="button" onClick={() => openLifecycleWizard("reactivate", selectedProfile.coordinator)}>{t("coordinatorLifecycle.wizard.undo")}</button>
                      )}
                      <button className="primary-button" type="button" onClick={() => setLifecycleWizard(null)}>{t("coordinatorLifecycle.wizard.done")}</button>
                    </>
                  ) : (
                    <>
                      <button className="secondary-button" type="button" disabled={lifecycleWizard.processing} onClick={() => lifecycleWizard.step > 0 ? setLifecycleWizard({ ...lifecycleWizard, step: lifecycleWizard.step - 1, error: "" }) : setLifecycleWizard(null)}>
                        {lifecycleWizard.step > 0 ? t("coordinatorLifecycle.wizard.back") : t("coordinatorLifecycle.wizard.cancel")}
                      </button>
                      <button className={lifecycleWizard.action === "archive" ? "danger-button" : "primary-button"} type="button" disabled={lifecycleWizard.processing || !canAdvanceLifecycleWizard()} onClick={() => void advanceLifecycleWizard()}>
                        {lifecycleWizard.processing ? t("coordinatorLifecycle.wizard.processing") : lifecycleWizard.step === lifecycleWizardSteps(lifecycleWizard.action).length - 2 ? t("coordinatorLifecycle.wizard.confirm") : t("coordinatorLifecycle.wizard.continue")}
                      </button>
                    </>
                  )}
                </footer>
              </section>
            </div>
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
                {reportingTree.map((node) => <CoordinatorTreeBranch key={node.coordinator.id} node={node} onOpenProfile={(coordinator) => void showProfilePhoto(coordinator)} />)}
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
