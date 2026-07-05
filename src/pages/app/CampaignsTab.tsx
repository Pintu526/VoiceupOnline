import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  History,
  Image as ImageIcon,
  Landmark,
  Plus,
  QrCode,
  Rocket,
  Save,
  Search,
  Settings,
  Sparkles,
  Star
} from "lucide-react";
import type {
  AuthorityRule,
  AuthoritySelectionMode,
  AuthorityTargetLevel,
  AuditLogEntry,
  Campaign,
  CampaignCategory,
  LocationGovernanceLevel,
  Organization,
  SignerRequiredField
} from "../../types";
import type { CampaignTemplate } from "../../campaignTemplates";
import type { AuthorityDirectoryEntry } from "../../authorityDirectory";
import type {
  LocationDeletionLevel,
  LocationDeletions,
  LocationOverrides,
  LocationWithPin
} from "../../geography";
import { Panel } from "../../ui/Panel";
import { Field } from "../../ui/Field";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { IndiaLocationFields } from "../../components/IndiaLocationFields";
import { PasswordField } from "../../ui/PasswordField";
import { categories } from "../../constants";
import { createId } from "../../lib";
import {
  formatAuthorityDisplay,
  getAppealAuthority,
  getAuthorityOptionsForCampaign
} from "../../utils/authority";
import {
  getCampaignAdminUrl,
  getCampaignGoalValue,
  getCampaignPublicUrl,
  getConfiguredLocationLockLevel,
  getLocationGovernance,
  getLocationLevelLabel,
  getLockedLocationValues,
  getSignerLocationRestrictionLevel,
  getSaasAdminPageUrl,
  hasSaasLocks,
  signerFieldLabel
} from "../../utils/campaign";

interface CampaignsTabProps {
  campaignDraft: Campaign | null;
  activeCampaign: Campaign | undefined;
  setCampaignDraft: React.Dispatch<React.SetStateAction<Campaign | null>>;
  campaignFormMode: "create" | "edit";
  setCampaignFormMode: React.Dispatch<React.SetStateAction<"create" | "edit">>;
  authorities: AuthorityRule[];
  setAuthorities: React.Dispatch<React.SetStateAction<AuthorityRule[]>>;
  auditLogs: AuditLogEntry[];
  organization: Organization;
  isCampaignAdminRoute: boolean;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  locationCsvFile: File | null;
  setLocationCsvFile: React.Dispatch<React.SetStateAction<File | null>>;
  authorityCsvFile: File | null;
  setAuthorityCsvFile: React.Dispatch<React.SetStateAction<File | null>>;
  csvUploadMessage: string;
  setCsvUploadMessage: React.Dispatch<React.SetStateAction<string>>;
  onSaveCampaign: (event: FormEvent) => void;
  onPublishCampaign: () => void;
  onCreateCampaign: () => void;
  onCloneCampaign: () => void;
  onArchiveCampaign: () => void;
  onOpenAiCopilot: () => void;
  aiDraftAppliedFocusKey: number;
  onAddAuthorityRule: () => void;
  onAddAdminLocationOption: (values: LocationWithPin) => boolean | Promise<boolean>;
  onRemoveAdminLocationOption: (values: LocationWithPin, level: LocationDeletionLevel) => void;
  onUploadLocationCsv: (file: File) => void;
  onUploadAuthorityCsv: (file: File) => void;
  onUpdateCampaignMedia: (file: File) => void;
  onUpdateCampaignDonationQr: (file: File) => void;
}

const wizardSteps = [
  {
    title: "Choose Template",
    helper: "Start from a polished campaign blueprint, then edit every detail."
  },
  {
    title: "Campaign Details",
    helper: "Shape the title, story, target, dates, and campaign admin access."
  },
  {
    title: "Location",
    helper: "Confirm governance limits, public signer restrictions, and local context."
  },
  {
    title: "Authorities",
    helper: "Review suggested authorities, routing choices, and uploaded authority masters."
  },
  {
    title: "Supporter Form",
    helper: "Choose required fields and preview the public signer experience."
  },
  {
    title: "Media",
    helper: "Polish the banner, focus point, donation media, and campaign sharing assets."
  },
  {
    title: "Review",
    helper: "Check quality, warnings, and missing information before publishing."
  },
  {
    title: "Publish",
    helper: "Preview public links, QR label, and final publish readiness."
  }
];

function addDays(dateValue: string, days: number) {
  const baseDate = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

function slugifyCampaignTitle(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `template-campaign-${Date.now()}`;
}

function campaignSnapshot(campaign: Campaign | null | undefined) {
  if (!campaign) return "";
  return JSON.stringify(campaign);
}

function getCampaignQuality(
  campaign: Campaign,
  selectedAuthority: string,
  selectedTemplate: CampaignTemplate | undefined
) {
  const checks = [
    {
      label: "Title",
      ready: campaign.title.trim().length >= 18,
      suggestion: "Use a specific, action-oriented title."
    },
    {
      label: "Description",
      ready: campaign.description.trim().length >= 80 && (campaign.appealContent ?? "").trim().length >= 120,
      suggestion: "Add a fuller summary and petition appeal."
    },
    {
      label: "Banner",
      ready: Boolean(campaign.heroImage),
      suggestion: "Upload a clear campaign banner."
    },
    {
      label: "Authority",
      ready: Boolean(selectedAuthority || campaign.selectedAuthorityId || campaign.authorityTargetLevel),
      suggestion: "Confirm who receives the petition."
    },
    {
      label: "Location",
      ready: Boolean(campaign.state && campaign.district),
      suggestion: "Select at least state and district."
    },
    {
      label: "Goal",
      ready: getCampaignGoalValue(campaign) >= 100,
      suggestion: "Set a realistic supporter target."
    },
    {
      label: "Supporter form",
      ready: (campaign.requiredFields ?? []).length > 0,
      suggestion: "Choose at least one required signer field."
    },
    {
      label: "Template fit",
      ready: Boolean(selectedTemplate),
      suggestion: "Start from a template for faster launch."
    }
  ];
  const score = Math.round((checks.filter((check) => check.ready).length / checks.length) * 100);
  return {
    score,
    checks,
    suggestions: checks.filter((check) => !check.ready).map((check) => check.suggestion)
  };
}

export function CampaignsTab({
  campaignDraft,
  activeCampaign,
  setCampaignDraft,
  campaignFormMode,
  setCampaignFormMode,
  authorities,
  setAuthorities,
  auditLogs,
  organization,
  isCampaignAdminRoute,
  locationOverrides,
  locationDeletions,
  locationCsvFile,
  setLocationCsvFile,
  authorityCsvFile,
  setAuthorityCsvFile,
  csvUploadMessage,
  setCsvUploadMessage,
  onSaveCampaign,
  onPublishCampaign,
  onCreateCampaign,
  onCloneCampaign,
  onArchiveCampaign,
  onOpenAiCopilot,
  aiDraftAppliedFocusKey,
  onAddAuthorityRule,
  onAddAdminLocationOption,
  onRemoveAdminLocationOption,
  onUploadLocationCsv,
  onUploadAuthorityCsv,
  onUpdateCampaignMedia,
  onUpdateCampaignDonationQr
}: CampaignsTabProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templateCategories, setTemplateCategories] = useState<string[]>(["All"]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("All");
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>([]);
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [authorityDirectory, setAuthorityDirectory] = useState<AuthorityDirectoryEntry[]>([]);
  const [authorityDirectoryCategories, setAuthorityDirectoryCategories] = useState<string[]>(["All"]);
  const [authorityRecommendations, setAuthorityRecommendations] = useState<AuthorityDirectoryEntry[]>([]);
  const [authoritySearch, setAuthoritySearch] = useState("");
  const [authorityCategoryFilter, setAuthorityCategoryFilter] = useState("All");
  const [authorityKindFilter, setAuthorityKindFilter] = useState("All");
  const [authorityDepartmentFilter, setAuthorityDepartmentFilter] = useState("All");
  const [authorityStateFilter, setAuthorityStateFilter] = useState("");
  const [authorityDistrictFilter, setAuthorityDistrictFilter] = useState("");
  const [favoriteAuthorityIds, setFavoriteAuthorityIds] = useState<string[]>([]);
  const [recentAuthorityIds, setRecentAuthorityIds] = useState<string[]>([]);
  const [secondaryAuthorityIds, setSecondaryAuthorityIds] = useState<string[]>([]);
  const [ccAuthorityIds, setCcAuthorityIds] = useState<string[]>([]);
  const [copiedCampaignLink, setCopiedCampaignLink] = useState("");
  const [campaignLinkMessage, setCampaignLinkMessage] = useState("");
  const savedSnapshot = campaignFormMode === "edit" ? campaignSnapshot(activeCampaign) : "";
  const draftSnapshot = campaignSnapshot(campaignDraft);
  const hasUnsavedChanges = Boolean(campaignDraft) && (
    campaignFormMode === "create" || draftSnapshot !== savedSnapshot
  );

  useEffect(() => {
    if (aiDraftAppliedFocusKey > 0) {
      setActiveStep(1);
    }
  }, [aiDraftAppliedFocusKey]);

  useEffect(() => {
    if (!copiedCampaignLink) return undefined;
    const timeoutId = window.setTimeout(() => {
      setCopiedCampaignLink("");
      setCampaignLinkMessage("");
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copiedCampaignLink]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    let isMounted = true;
    import("../../campaignTemplates").then((module) => {
      if (!isMounted) return;
      setTemplates(module.campaignTemplates);
      setTemplateCategories(module.campaignTemplateCategories);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    import("../../authorityDirectory").then((module) => {
      if (!isMounted) return;
      setAuthorityDirectory(module.authorityDirectory);
      setAuthorityDirectoryCategories(module.authorityDirectoryCategories);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const locationGovernance = getLocationGovernance(organization);
  const configuredGovernanceLockLevel = getConfiguredLocationLockLevel(
    locationGovernance,
    locationGovernance.lockLevel
  );
  const governedLocationValues = getLockedLocationValues(
    locationGovernance,
    configuredGovernanceLockLevel
  );
  const effectiveCampaignDraft = campaignDraft
    ? { ...campaignDraft, ...governedLocationValues }
    : null;
  const selectedAuthority = effectiveCampaignDraft
    ? formatAuthorityDisplay(getAppealAuthority(effectiveCampaignDraft, authorities))
    : "";
  const progress = ((activeStep + 1) / wizardSteps.length) * 100;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  useEffect(() => {
    let isMounted = true;
    if (!selectedTemplate) {
      setAuthorityRecommendations([]);
      return;
    }
    import("../../authorityDirectory").then((module) => {
      if (!isMounted) return;
      setAuthorityRecommendations(
        module.getAuthorityRecommendations(selectedTemplate.name, selectedTemplate.categoryGroup)
      );
    });
    return () => {
      isMounted = false;
    };
  }, [selectedTemplate]);
  const filteredTemplates = useMemo(() => {
    const search = templateSearch.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesCategory = templateCategory === "All" || template.categoryGroup === templateCategory;
      const matchesSearch =
        !search ||
        [template.name, template.categoryGroup, template.campaignTitle, template.summary, ...template.suggestedTags]
          .join(" ")
          .toLowerCase()
          .includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [templateCategory, templateSearch, templates]);
  const favoriteTemplates = templates.filter((template) => favoriteTemplateIds.includes(template.id));
  const recentTemplates = recentTemplateIds
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is CampaignTemplate => Boolean(template));
  const authorityDepartments = useMemo(
    () => ["All", ...Array.from(new Set(authorityDirectory.map((entry) => entry.department))).sort()],
    [authorityDirectory]
  );
  const filteredAuthorityDirectory = useMemo(() => {
    const search = authoritySearch.trim().toLowerCase();
    return authorityDirectory.filter((entry) => {
      const matchesSearch =
        !search ||
        [
          entry.name,
          entry.designation,
          entry.department,
          entry.category,
          entry.level,
          entry.state,
          entry.district,
          entry.politicalParty,
          entry.notes
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesCategory =
        authorityCategoryFilter === "All" || entry.category === authorityCategoryFilter;
      const matchesKind = authorityKindFilter === "All" || entry.kind === authorityKindFilter;
      const matchesDepartment =
        authorityDepartmentFilter === "All" || entry.department === authorityDepartmentFilter;
      const matchesState =
        !authorityStateFilter.trim() ||
        entry.state.toLowerCase().includes(authorityStateFilter.trim().toLowerCase());
      const matchesDistrict =
        !authorityDistrictFilter.trim() ||
        entry.district.toLowerCase().includes(authorityDistrictFilter.trim().toLowerCase());
      return matchesSearch && matchesCategory && matchesKind && matchesDepartment && matchesState && matchesDistrict;
    });
  }, [
    authorityCategoryFilter,
    authorityDepartmentFilter,
    authorityDirectory,
    authorityDistrictFilter,
    authorityKindFilter,
    authoritySearch,
    authorityStateFilter
  ]);
  const recentAuthorities = recentAuthorityIds
    .map((id) => authorityDirectory.find((entry) => entry.id === id))
    .filter((entry): entry is AuthorityDirectoryEntry => Boolean(entry));
  const authorityEscalationChain = ["Ward", "Panchayat", "Block", "District", "State", "National"];
  const politicalHierarchy = ["Ward Member", "Sarpanch", "Councillor", "MLA", "MP", "Minister"];
  const departmentMapping = selectedTemplate
    ? `${selectedTemplate.suggestedCategory} -> ${
        authorityRecommendations[0]?.department ?? "Responsible department"
      }`
    : "Choose a template to map department";
  const authorityConfidenceScore = Math.min(
    98,
    54 +
      (authorityRecommendations.length ? 18 : 0) +
      (effectiveCampaignDraft?.state ? 8 : 0) +
      (effectiveCampaignDraft?.district ? 8 : 0) +
      (campaignDraft?.selectedAuthorityId ? 10 : 0)
  );
  const duplicateAuthorityKeys = authorities
    .map((authority) => `${authority.name}|${authority.department}|${authority.email}`.toLowerCase())
    .filter((key, index, list) => key.trim() && list.indexOf(key) !== index);

  const readinessItems = campaignDraft
    ? [
        {
          label: "Campaign basics",
          ready: Boolean(campaignDraft.title && campaignDraft.slug && getCampaignGoalValue(campaignDraft) > 0),
          detail: campaignDraft.title || "Campaign name is empty"
        },
        {
          label: "Location routing",
          ready: Boolean(effectiveCampaignDraft?.state && effectiveCampaignDraft?.district),
          detail:
            [effectiveCampaignDraft?.state, effectiveCampaignDraft?.district, effectiveCampaignDraft?.block]
              .filter(Boolean)
              .join(", ") || "State and district are empty"
        },
        {
          label: "Authority routing",
          ready: Boolean(selectedAuthority),
          detail: selectedAuthority || "Default authority will be used when available"
        },
        {
          label: "Public page content",
          ready: Boolean(campaignDraft.description && campaignDraft.consentText),
          detail: campaignDraft.description ? "Description is present" : "Description is empty"
        }
      ]
    : [];
  const readyCount = readinessItems.filter((item) => item.ready).length;
  const campaignQuality = campaignDraft
    ? getCampaignQuality(campaignDraft, selectedAuthority, selectedTemplate)
    : null;
  const campaignVersionHistory = campaignDraft
    ? auditLogs
        .filter((log) => log.campaignId === campaignDraft.id)
        .slice(0, 8)
    : [];
  const draftSlug = campaignDraft?.slug.trim() ?? "";
  const hasDraftSlug = Boolean(draftSlug);
  const publicCampaignUrl = hasDraftSlug
    ? getCampaignPublicUrl(organization, { slug: draftSlug })
    : "";
  const campaignAdminUrl = hasDraftSlug
    ? getCampaignAdminUrl(organization, { slug: draftSlug })
    : "";
  const saasAdminUrl = getSaasAdminPageUrl();

  async function copyCampaignLink(kind: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCampaignLink(kind);
      setCampaignLinkMessage(`${kind} copied.`);
    } catch {
      setCopiedCampaignLink("");
      setCampaignLinkMessage("Copy failed. Select and copy the link manually.");
    }
  }

  function confirmArchiveCampaign() {
    if (!campaignDraft) return;
    const confirmed = window.confirm(
      `Archive "${campaignDraft.title || "this campaign"}"? It will be marked Closed and kept in the workspace.`
    );
    if (confirmed) onArchiveCampaign();
  }

  function applyTemplate(template: CampaignTemplate) {
    if (!campaignDraft) return;
    const shouldCreateNewDraft = campaignFormMode === "edit";
    const nextSlug = shouldCreateNewDraft
      ? `${slugifyCampaignTitle(template.campaignTitle)}-${Date.now()}`
      : campaignDraft.slug;
    const requiredFields = campaignDraft.requiredFieldsLockedBySaas
      ? campaignDraft.requiredFields
      : Array.from(new Set(template.suggestedSupporterFields)) as SignerRequiredField[];
    setSelectedTemplateId(template.id);
    setRecentTemplateIds((current) => [template.id, ...current.filter((id) => id !== template.id)].slice(0, 4));
    setCampaignDraft({
      ...campaignDraft,
      id: shouldCreateNewDraft ? createId("cmp") : campaignDraft.id,
      slug: nextSlug,
      status: shouldCreateNewDraft ? "Draft" : campaignDraft.status,
      title: template.campaignTitle,
      category: template.suggestedCategory,
      description: template.summary,
      appealContent: template.detailedDescription,
      goal: campaignDraft.goalLockedBySaas ? campaignDraft.goal : template.suggestedTarget,
      endDate: campaignDraft.datesLockedBySaas
        ? campaignDraft.endDate
        : addDays(campaignDraft.startDate, template.suggestedDurationDays),
      consentText:
        campaignDraft.consentText ||
        "I consent to add my signature to this public petition and allow the campaign team to submit it to the relevant authority.",
      requiredFields,
      socialShareText: template.socialShareText,
      thankYouMessage: template.whatsappMessage,
      participantUpdateMessage: template.whatsappMessage,
      qrLabel: shouldCreateNewDraft ? template.name : campaignDraft.qrLabel || template.name,
      shareUrl: getCampaignPublicUrl(organization, { slug: nextSlug }),
      adminUrl: getCampaignAdminUrl(organization, { slug: nextSlug })
    });
    if (shouldCreateNewDraft) {
      setCampaignFormMode("create");
    }
  }

  function getAuthorityTargetLevel(entry: AuthorityDirectoryEntry): AuthorityTargetLevel {
    if (["National", "State"].includes(entry.level)) return "state";
    return "district";
  }

  function findUploadedAuthorityMatch(entry: AuthorityDirectoryEntry) {
    return authorities.find((authority) => {
      const haystack = [authority.name, authority.position, authority.department]
        .join(" ")
        .toLowerCase();
      return (
        haystack.includes(entry.designation.toLowerCase()) ||
        haystack.includes(entry.department.toLowerCase())
      );
    });
  }

  function useAuthorityEntry(entry: AuthorityDirectoryEntry) {
    if (!campaignDraft) return;
    const uploadedMatch = findUploadedAuthorityMatch(entry);
    setRecentAuthorityIds((current) => [entry.id, ...current.filter((id) => id !== entry.id)].slice(0, 5));
    setCampaignDraft({
      ...campaignDraft,
      authorityTargetLevel: getAuthorityTargetLevel(entry),
      selectedAuthorityId: uploadedMatch?.id ?? campaignDraft.selectedAuthorityId
    });
  }

  function toggleAuthorityList(
    entryId: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    setter((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId]
    );
  }

  return (
    <section className="page-stack">
      <Panel title="Campaign configuration" icon={<Settings />}>
        {campaignDraft ? (
          <form className="campaign-wizard" onSubmit={onSaveCampaign}>
            <div className="campaign-wizard-progress" aria-label="Campaign setup progress">
              {wizardSteps.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  className={index === activeStep ? "active" : ""}
                  aria-current={index === activeStep ? "step" : undefined}
                  onClick={() => setActiveStep(index)}
                >
                  <span>{index + 1}</span>
                  <strong>{step.title}</strong>
                </button>
              ))}
            </div>

            <div className="campaign-wizard-header">
              <div className="campaign-wizard-title-row">
                <div>
                  <span className="eyebrow">Step {activeStep + 1} of {wizardSteps.length}</span>
                  <h3>{wizardSteps[activeStep].title}</h3>
                  <p>{wizardSteps[activeStep].helper}</p>
                </div>
                <button className="secondary-button" type="button" onClick={onOpenAiCopilot}>
                  <Sparkles size={18} /> Create with AI
                </button>
              </div>
              <div className="progress">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>

            {hasUnsavedChanges && (
              <div className="unsaved-changes-banner" role="status">
                <AlertTriangle size={18} />
                <div>
                  <strong>Unsaved changes</strong>
                  <span>
                    {campaignFormMode === "create"
                      ? "This is a new campaign draft. Use Create new campaign to save it."
                      : "Update this campaign before leaving Campaign Studio."}
                  </span>
                </div>
              </div>
            )}

            {activeStep === 0 && (
              <div className="campaign-wizard-step template-library">
                <div className="template-toolbar">
                  <Field label="Search templates">
                    <div className="input-with-icon">
                      <Search size={18} />
                      <input
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="Search by topic, authority, or tag"
                      />
                    </div>
                  </Field>
                  <Field label="Category filter">
                    <select value={templateCategory} onChange={(e) => setTemplateCategory(e.target.value)}>
                      {templateCategories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                {(favoriteTemplates.length > 0 || recentTemplates.length > 0) && (
                  <div className="template-quick-lanes">
                    {favoriteTemplates.length > 0 && (
                      <div>
                        <span className="eyebrow">Favorites</span>
                        <div className="template-chip-row">
                          {favoriteTemplates.map((template) => (
                            <button key={template.id} type="button" onClick={() => applyTemplate(template)}>
                              {template.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {recentTemplates.length > 0 && (
                      <div>
                        <span className="eyebrow">Recent</span>
                        <div className="template-chip-row">
                          {recentTemplates.map((template) => (
                            <button key={template.id} type="button" onClick={() => applyTemplate(template)}>
                              {template.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="template-grid">
                  {filteredTemplates.map((template) => {
                    const isFavorite = favoriteTemplateIds.includes(template.id);
                    const isSelected = selectedTemplateId === template.id;
                    return (
                      <article className={isSelected ? "template-card selected" : "template-card"} key={template.id}>
                        <div className="template-card-header">
                          <span className="template-icon" aria-hidden="true">{template.icon}</span>
                          <button
                            className={isFavorite ? "icon-button active" : "icon-button"}
                            type="button"
                            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            onClick={() =>
                              setFavoriteTemplateIds((current) =>
                                isFavorite
                                  ? current.filter((id) => id !== template.id)
                                  : [...current, template.id]
                              )
                            }
                          >
                            <Star size={17} />
                          </button>
                        </div>
                        <span className="eyebrow">{template.categoryGroup}</span>
                        <h4>{template.name}</h4>
                        <p>{template.preview}</p>
                        <div className="template-meta">
                          <span>{template.suggestedTarget.toLocaleString()} supporters</span>
                          <span>{template.suggestedDurationDays} days</span>
                          <span>{template.suggestedCategory}</span>
                        </div>
                        <details>
                          <summary>Preview details</summary>
                          <p>{template.summary}</p>
                          <small>{template.suggestedBannerStyle}</small>
                        </details>
                        <button className="primary-button" type="button" onClick={() => applyTemplate(template)}>
                          Use template
                        </button>
                      </article>
                    );
                  })}
                </div>
                {templates.length === 0 && <p className="helper-text">Loading campaign templates...</p>}
                {templates.length > 0 && filteredTemplates.length === 0 && (
                  <p className="helper-text">No templates match this search.</p>
                )}
              </div>
            )}

            {activeStep === 1 && (
              <div className="form-grid campaign-wizard-step">
                {isCampaignAdminRoute && hasSaasLocks(campaignDraft) && (
                  <div className="info-message wide campaign-admin-control-summary">
                    <strong>SaaS admin controls are active for this campaign.</strong>
                    <span>Target signatures: {getCampaignGoalValue(campaignDraft).toLocaleString()}</span>
                    <span>
                      Signer limit:{" "}
                      {campaignDraft.maxSignersAllowed > 0
                        ? campaignDraft.maxSignersAllowed.toLocaleString()
                        : "No campaign-specific limit"}
                    </span>
                    <span>
                      Scan document limit:{" "}
                      {campaignDraft.maxScansAllowed > 0
                        ? campaignDraft.maxScansAllowed.toLocaleString()
                        : "No campaign-specific limit"}
                    </span>
                    <span>Start date: {campaignDraft.startDate || "Not set"}</span>
                    <span>End date: {campaignDraft.endDate || "Not set"}</span>
                  </div>
                )}

                <Field label="Campaign name">
                  <input
                    value={campaignDraft.title}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, title: e.target.value })}
                  />
                </Field>
                <Field label="Public slug">
                  <input
                    value={campaignDraft.slug}
                    onChange={(e) => {
                      const slug = e.target.value;
                      setCampaignDraft({
                        ...campaignDraft,
                        slug,
                        shareUrl: getCampaignPublicUrl(organization, { slug }),
                        adminUrl: getCampaignAdminUrl(organization, { slug })
                      });
                    }}
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={campaignDraft.category}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, category: e.target.value as CampaignCategory })
                    }
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={campaignDraft.status}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, status: e.target.value as Campaign["status"] })
                    }
                  >
                    <option>Draft</option>
                    <option>Published</option>
                    <option>Paused</option>
                    <option>Closed</option>
                  </select>
                </Field>
                <Field label="Target signatures">
                  <input
                    type="number"
                    min="1"
                    value={getCampaignGoalValue(campaignDraft)}
                    disabled={
                      isCampaignAdminRoute &&
                      (campaignDraft.goalLockedBySaas || campaignDraft.maxSignersAllowed > 0)
                    }
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, goal: Number(e.target.value) })
                    }
                  />
                  {isCampaignAdminRoute && campaignDraft.maxSignersAllowed > 0 && (
                    <small>SaaS admin limit: {campaignDraft.maxSignersAllowed.toLocaleString()} signers</small>
                  )}
                </Field>
                <Field label="Location">
                  <input
                    value={campaignDraft.location}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, location: e.target.value })}
                  />
                </Field>
                <Field label="Start date">
                  <input
                    type="date"
                    value={campaignDraft.startDate}
                    disabled={isCampaignAdminRoute && campaignDraft.datesLockedBySaas}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, startDate: e.target.value })}
                  />
                </Field>
                <Field label="End date">
                  <input
                    type="date"
                    value={campaignDraft.endDate}
                    disabled={isCampaignAdminRoute && campaignDraft.datesLockedBySaas}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, endDate: e.target.value })}
                  />
                </Field>
                <Field label="Public share URL">
                  <input
                    value={hasDraftSlug ? publicCampaignUrl : ""}
                    placeholder="Add a campaign slug to generate this URL"
                    readOnly
                  />
                  <small>Generated from the public slug.</small>
                </Field>
                <Field label="Campaign admin URL">
                  <input
                    value={hasDraftSlug ? campaignAdminUrl : ""}
                    placeholder="Add a campaign slug to generate this URL"
                    readOnly
                  />
                  <small>Generated from the public slug.</small>
                </Field>
                <div className="campaign-links-card wide" aria-live="polite">
                  <div className="campaign-links-header">
                    <div>
                      <span className="eyebrow">Campaign links</span>
                      <h4>Slug-based routes</h4>
                    </div>
                    {!hasDraftSlug && (
                      <span className="route-warning">Add a campaign slug to generate links.</span>
                    )}
                  </div>
                  <div className="campaign-link-list">
                    <div className="campaign-link-row public-route">
                      <span>Public campaign URL</span>
                      <code>{hasDraftSlug ? publicCampaignUrl : "Slug required"}</code>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!hasDraftSlug}
                        onClick={() => copyCampaignLink("Public campaign URL", publicCampaignUrl)}
                      >
                        <Copy size={16} /> {copiedCampaignLink === "Public campaign URL" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="campaign-link-row campaign-admin-route">
                      <span>Campaign admin URL</span>
                      <code>{hasDraftSlug ? campaignAdminUrl : "Slug required"}</code>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!hasDraftSlug}
                        onClick={() => copyCampaignLink("Campaign admin URL", campaignAdminUrl)}
                      >
                        <Copy size={16} /> {copiedCampaignLink === "Campaign admin URL" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="campaign-link-row saas-admin-route">
                      <span>SaaS admin URL</span>
                      <code>{saasAdminUrl}</code>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => copyCampaignLink("SaaS admin URL", saasAdminUrl)}
                      >
                        <Copy size={16} /> {copiedCampaignLink === "SaaS admin URL" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  {campaignLinkMessage && <p className="success-message">{campaignLinkMessage}</p>}
                </div>
                <Field label="Campaign admin email">
                  <input
                    type="email"
                    value={campaignDraft.adminEmail ?? ""}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, adminEmail: e.target.value })}
                  />
                </Field>
                <Field label="Campaign admin passcode">
                  <PasswordField
                    placeholder="Campaign admin passcode"
                    value={campaignDraft.adminPasscode ?? ""}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, adminPasscode: e.target.value })
                    }
                  />
                </Field>
                <Field label="QR / WhatsApp campaign label">
                  <input
                    value={campaignDraft.qrLabel}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, qrLabel: e.target.value })}
                  />
                </Field>
              </div>
            )}

            {activeStep === 2 && effectiveCampaignDraft && (
              <div className="form-grid campaign-wizard-step">
                {locationGovernance.lockLevel !== "none" && (
                  <div className="info-message wide geography-lock-summary">
                    <strong>
                      SaaS geography lock: {getLocationLevelLabel(locationGovernance.lockLevel)}
                    </strong>
                    <span>
                      Campaign configuration is limited to{" "}
                      {[locationGovernance.panchayat, locationGovernance.block, locationGovernance.district, locationGovernance.state]
                        .filter(Boolean)
                        .join(", ")}
                      .
                    </span>
                  </div>
                )}
                <IndiaLocationFields
                  idPrefix="campaign-location"
                  values={effectiveCampaignDraft}
                  onChange={(values) => setCampaignDraft({ ...campaignDraft, ...values })}
                  locationOverrides={locationOverrides}
                  locationDeletions={locationDeletions}
                  allowedLocation={configuredGovernanceLockLevel === "none" ? undefined : governedLocationValues}
                  lockedLevel={isCampaignAdminRoute ? configuredGovernanceLockLevel : "none"}
                  allowInlineAdd
                  onAddLocation={onAddAdminLocationOption}
                  onRemoveLocation={onRemoveAdminLocationOption}
                />

                <div className="wide signer-restriction-panel">
                  <span className="eyebrow">Public signer locality restriction</span>
                  <p className="helper-text">
                    Further restrict public signatures to the campaign locality for a local cause.
                  </p>
                  {(
                    [
                      ["none", "No public locality restriction"],
                      ["state", "Restrict public signing to campaign State"],
                      ["district", "Restrict public signing to campaign District"],
                      ["block", "Restrict public signing to campaign Block"],
                      ["panchayat", "Restrict public signing to campaign Panchayat/Ward"]
                    ] as [LocationGovernanceLevel, string][]
                  ).map(([level, label]) => (
                    <label className="check-row" key={level}>
                      <input
                        type="radio"
                        name="signerLocationRestrictionLevel"
                        checked={getSignerLocationRestrictionLevel(campaignDraft) === level}
                        onChange={() =>
                          setCampaignDraft({
                            ...campaignDraft,
                            signerLocationRestrictionLevel: level
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>

              </div>
            )}

            {activeStep === 3 && effectiveCampaignDraft && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide authority-intelligence-panel">
                  <div className="authority-intelligence-header">
                    <div>
                      <span className="eyebrow">Authority Intelligence</span>
                      <h4>Recommended routing for this campaign</h4>
                      <p className="helper-text">
                        Recommendations are generated from the selected template and campaign geography.
                        Select an uploaded authority when available, or use a recommendation as a routing hint.
                      </p>
                    </div>
                    <button className="secondary-button" type="button" onClick={onAddAuthorityRule}>
                      <Plus size={18} /> Add manually
                    </button>
                  </div>

                  <div className="authority-recommendation-grid">
                    {(authorityRecommendations.length > 0 ? authorityRecommendations : []).map((entry, index) => {
                      const uploadedMatch = findUploadedAuthorityMatch(entry);
                      return (
                        <article className="authority-recommendation-card" key={entry.id}>
                          <span className="priority-pill">Priority {index + 1}</span>
                          <strong>{entry.designation}</strong>
                          <small>{entry.department} - {entry.level} - {entry.kind}</small>
                          <p>{entry.notes}</p>
                          <div className="template-chip-row">
                            <span>{uploadedMatch ? "Uploaded match found" : "Directory profile"}</span>
                            <span>{entry.status}</span>
                            <span>Public visibility ready</span>
                          </div>
                          <div className="button-row">
                            <button className="primary-button" type="button" onClick={() => useAuthorityEntry(entry)}>
                              Accept
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleAuthorityList(entry.id, setSecondaryAuthorityIds)}
                            >
                              {secondaryAuthorityIds.includes(entry.id) ? "Remove secondary" : "Secondary"}
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleAuthorityList(entry.id, setCcAuthorityIds)}
                            >
                              {ccAuthorityIds.includes(entry.id) ? "Remove CC" : "CC"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {selectedTemplate && authorityRecommendations.length === 0 && (
                      <p className="helper-text">
                        No exact directory routing rule is defined yet. Use search below or add an authority manually.
                      </p>
                    )}
                    {!selectedTemplate && (
                      <p className="helper-text">
                        Choose a campaign template first to get automatic authority recommendations.
                      </p>
                    )}
                  </div>
                </div>

                <div className="wide authority-picker-panel">
                  <div className="authority-picker-toolbar">
                    <Field label="Search authority directory">
                      <div className="input-with-icon">
                        <Search size={18} />
                        <input
                          value={authoritySearch}
                          onChange={(e) => setAuthoritySearch(e.target.value)}
                          placeholder="Search designation, department, district, party, notes"
                        />
                      </div>
                    </Field>
                    <Field label="Category">
                      <select
                        value={authorityCategoryFilter}
                        onChange={(e) => setAuthorityCategoryFilter(e.target.value)}
                      >
                        {authorityDirectoryCategories.map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Type">
                      <select value={authorityKindFilter} onChange={(e) => setAuthorityKindFilter(e.target.value)}>
                        <option>All</option>
                        <option>Government</option>
                        <option>Political</option>
                        <option>NGO</option>
                      </select>
                    </Field>
                    <Field label="Department">
                      <select
                        value={authorityDepartmentFilter}
                        onChange={(e) => setAuthorityDepartmentFilter(e.target.value)}
                      >
                        {authorityDepartments.map((department) => (
                          <option key={department}>{department}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="State">
                      <input
                        value={authorityStateFilter}
                        onChange={(e) => setAuthorityStateFilter(e.target.value)}
                        placeholder={effectiveCampaignDraft.state || "Any state"}
                      />
                    </Field>
                    <Field label="District">
                      <input
                        value={authorityDistrictFilter}
                        onChange={(e) => setAuthorityDistrictFilter(e.target.value)}
                        placeholder={effectiveCampaignDraft.district || "Any district"}
                      />
                    </Field>
                  </div>

                  {(recentAuthorities.length > 0 || favoriteAuthorityIds.length > 0) && (
                    <div className="template-quick-lanes">
                      {recentAuthorities.length > 0 && (
                        <div>
                          <span className="eyebrow">Recently used</span>
                          <div className="template-chip-row">
                            {recentAuthorities.map((entry) => (
                              <button key={entry.id} type="button" onClick={() => useAuthorityEntry(entry)}>
                                {entry.designation}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {favoriteAuthorityIds.length > 0 && (
                        <div>
                          <span className="eyebrow">Favorites</span>
                          <div className="template-chip-row">
                            {authorityDirectory
                              .filter((entry) => favoriteAuthorityIds.includes(entry.id))
                              .map((entry) => (
                                <button key={entry.id} type="button" onClick={() => useAuthorityEntry(entry)}>
                                  {entry.designation}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="authority-directory-grid">
                    {filteredAuthorityDirectory.slice(0, 12).map((entry) => {
                      const isFavorite = favoriteAuthorityIds.includes(entry.id);
                      return (
                        <article className="authority-directory-card" key={entry.id}>
                          <div className="template-card-header">
                            <span className="status-pill">{entry.kind}</span>
                            <button
                              className={isFavorite ? "icon-button active" : "icon-button"}
                              type="button"
                              aria-label={isFavorite ? "Remove authority favorite" : "Favorite authority"}
                              onClick={() =>
                                setFavoriteAuthorityIds((current) =>
                                  isFavorite
                                    ? current.filter((id) => id !== entry.id)
                                    : [...current, entry.id]
                                )
                              }
                            >
                              <Star size={17} />
                            </button>
                          </div>
                          <strong>{entry.designation}</strong>
                          <small>{entry.department} - {entry.level}</small>
                          <div className="authority-edit-grid" aria-label={`${entry.designation} editable directory fields`}>
                            <input aria-label="Name" value={entry.name} readOnly />
                            <input aria-label="Email" value={entry.email} readOnly placeholder="Email" />
                            <input aria-label="Phone" value={entry.phone} readOnly placeholder="Phone" />
                            <input aria-label="Office address" value={entry.officeAddress} readOnly placeholder="Office address" />
                          </div>
                          <div className="button-row">
                            <button className="primary-button" type="button" onClick={() => useAuthorityEntry(entry)}>
                              Replace primary
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleAuthorityList(entry.id, setSecondaryAuthorityIds)}
                            >
                              Secondary
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleAuthorityList(entry.id, setCcAuthorityIds)}
                            >
                              CC
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <p className="helper-text">
                    Showing {Math.min(filteredAuthorityDirectory.length, 12)} of {filteredAuthorityDirectory.length} profiles.
                    Local office details remain editable in uploaded authority rules.
                  </p>
                </div>

                <Field label="Appeal should go to authority">
                  <select
                    value={campaignDraft.authorityTargetLevel ?? "district"}
                    disabled={isCampaignAdminRoute && campaignDraft.authorityLockedBySaas}
                    onChange={(e) =>
                      setCampaignDraft({
                        ...campaignDraft,
                        authorityTargetLevel: e.target.value as AuthorityTargetLevel
                      })
                    }
                  >
                    <option value="district">District level - District Collector</option>
                    <option value="state">State level - Chief Minister</option>
                    <option value="country">Country level - Prime Minister of India</option>
                  </select>
                </Field>
                <Field label="Authority selection mode">
                  <select
                    value={campaignDraft.authoritySelectionMode ?? "admin_enforced"}
                    disabled={isCampaignAdminRoute && campaignDraft.authorityLockedBySaas}
                    onChange={(e) =>
                      setCampaignDraft({
                        ...campaignDraft,
                        authoritySelectionMode: e.target.value as AuthoritySelectionMode
                      })
                    }
                  >
                    <option value="admin_enforced">Admin enforces selected authority</option>
                    <option value="public_choice">Public can choose from uploaded authorities</option>
                  </select>
                </Field>
                <Field label="Choose uploaded authority">
                  <select
                    value={campaignDraft.selectedAuthorityId ?? ""}
                    disabled={isCampaignAdminRoute && campaignDraft.authorityLockedBySaas}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, selectedAuthorityId: e.target.value })
                    }
                  >
                    <option value="">Use default authority for selected level</option>
                    {getAuthorityOptionsForCampaign(effectiveCampaignDraft, authorities).map((authority) => (
                      <option key={authority.id} value={authority.id}>
                        {authority.position ? `${authority.position} - ` : ""}
                        {authority.name}
                        {authority.district
                          ? ` (${authority.district})`
                          : authority.state
                            ? ` (${authority.state})`
                            : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Selected appeal authority">
                  <input value={selectedAuthority} readOnly />
                </Field>

                <div className="wide multi-authority-panel">
                  <span className="eyebrow">Multi-authority routing plan</span>
                  <div className="campaign-review-summary">
                    <div>
                      <span className="label">Primary Authority</span>
                      <strong>{selectedAuthority || "Default authority routing"}</strong>
                      <small>Persisted through existing campaign authority selection.</small>
                    </div>
                    <div>
                      <span className="label">Secondary Authorities</span>
                      <strong>{secondaryAuthorityIds.length}</strong>
                      <small>Provider ready for future email, WhatsApp, SMS, IVR, PDF, and API dispatch.</small>
                    </div>
                    <div>
                      <span className="label">CC Authorities</span>
                      <strong>{ccAuthorityIds.length}</strong>
                      <small>Planning only until provider dispatch is implemented.</small>
                    </div>
                    <div>
                      <span className="label">Public visibility</span>
                      <strong>Configurable</strong>
                      <small>Designed for future authority visibility controls.</small>
                    </div>
                  </div>
                </div>

                <div className="wide upload-tools">
                  <div className="csv-upload-card">
                    <span className="label">Location master CSV</span>
                    <label className="secondary-button">
                      Choose location CSV
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          setLocationCsvFile(e.target.files?.[0] ?? null);
                          setCsvUploadMessage("");
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <small>{locationCsvFile ? locationCsvFile.name : "No file selected"}</small>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!locationCsvFile}
                      onClick={() => {
                        if (locationCsvFile) onUploadLocationCsv(locationCsvFile);
                      }}
                    >
                      Upload location CSV
                    </button>
                  </div>
                  <div className="csv-upload-card">
                    <span className="label">Authority master CSV</span>
                    <label className="secondary-button">
                      Choose authority CSV
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          setAuthorityCsvFile(e.target.files?.[0] ?? null);
                          setCsvUploadMessage("");
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <small>{authorityCsvFile ? authorityCsvFile.name : "No file selected"}</small>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!authorityCsvFile}
                      onClick={() => {
                        if (authorityCsvFile) onUploadAuthorityCsv(authorityCsvFile);
                      }}
                    >
                      Upload authority CSV
                    </button>
                  </div>
                  <span className="helper-text">
                    Location CSV: state,district,block,panchayat,pin. Authority CSV:
                    level,state,district,position,name,address,email,phone.
                  </span>
                  {authorityCsvFile && (
                    <div className="csv-review-panel wide">
                      <span className="eyebrow">Authority CSV preview - provider ready</span>
                      <div className="campaign-review-summary">
                        <div>
                          <span className="label">File</span>
                          <strong>{authorityCsvFile.name}</strong>
                          <small>{Math.round(authorityCsvFile.size / 1024)} KB selected</small>
                        </div>
                        <div>
                          <span className="label">Validation</span>
                          <strong>Ready to validate</strong>
                          <small>Column checks run through the existing upload handler.</small>
                        </div>
                        <div>
                          <span className="label">Duplicates</span>
                          <strong>Ready to detect</strong>
                          <small>Name, designation, email, and phone can be compared before import.</small>
                        </div>
                        <div>
                          <span className="label">Import summary</span>
                          <strong>Generated after upload</strong>
                          <small>Existing upload message is displayed below.</small>
                        </div>
                      </div>
                    </div>
                  )}
                  {csvUploadMessage && (
                    <p
                      className={
                        csvUploadMessage.toLowerCase().includes("failed")
                          ? "error-message wide"
                          : "success-message wide"
                      }
                    >
                      {csvUploadMessage}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeStep === 4 && (
              <div className="form-grid campaign-wizard-step">
                <Field label="Campaign description" wide>
                  <textarea
                    rows={5}
                    value={campaignDraft.description}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="Appeal / cause text shown on public signing page" wide>
                  <textarea
                    rows={5}
                    value={campaignDraft.appealContent ?? ""}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, appealContent: e.target.value })
                    }
                  />
                </Field>
                <Field label="Consent text" wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.consentText}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, consentText: e.target.value })
                    }
                  />
                </Field>

                <div className="wide media-editor">
                  <div>
                    <span className="label">Campaign banner image</span>
                    <p className="helper-text">
                      Recommended size: 1600 x 900 px. Use a clear landscape image with important
                      content near the selected focus point.
                    </p>
                    <label className="drop-zone compact-drop">
                      <ImageIcon size={28} />
                      <strong>Upload banner / background image</strong>
                      <span>Use a campaign poster or field photo. Crop is controlled below.</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUpdateCampaignMedia(file);
                        }}
                      />
                    </label>
                  </div>
                  <div
                    className="media-preview"
                    style={{
                      backgroundImage: campaignDraft.heroImage
                        ? `url(${campaignDraft.heroImage})`
                        : undefined,
                      backgroundPosition: campaignDraft.heroImagePosition,
                      backgroundSize: `${campaignDraft.heroImageZoom}%`
                    }}
                  >
                    {campaignDraft.heroImage ? (
                      <div className="media-preview-overlay">
                        <span>Focus: {campaignDraft.heroImagePosition}</span>
                        <span>Zoom: {campaignDraft.heroImageZoom}%</span>
                      </div>
                    ) : (
                      <span>Banner preview</span>
                    )}
                  </div>
                  <Field label="Image crop / zoom">
                    <input
                      type="range"
                      min="100"
                      max="220"
                      value={campaignDraft.heroImageZoom}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, heroImageZoom: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Image focus">
                    <select
                      value={campaignDraft.heroImagePosition}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, heroImagePosition: e.target.value })
                      }
                    >
                      <option value="center center">Center</option>
                      <option value="center top">Top</option>
                      <option value="center bottom">Bottom</option>
                      <option value="left center">Left</option>
                      <option value="right center">Right</option>
                    </select>
                  </Field>
                  <Field label="Campaign video URL">
                    <input
                      placeholder="YouTube, Instagram, or hosted video link"
                      value={campaignDraft.campaignVideoUrl}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, campaignVideoUrl: e.target.value })
                      }
                    />
                  </Field>
                </div>

                <Field label="Social share text" wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.socialShareText}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, socialShareText: e.target.value })
                    }
                  />
                </Field>
                <Field label="Thank-you WhatsApp/SMS message" wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.thankYouMessage}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, thankYouMessage: e.target.value })
                    }
                  />
                </Field>
                <Field label="Participant update message" wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.participantUpdateMessage}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, participantUpdateMessage: e.target.value })
                    }
                  />
                </Field>

                <div className="wide required-fields">
                  <span className="label">Required signer details</span>
                  <span className="helper-text">
                    Select the signer details that must be required. Unselected fields remain optional on the public form.
                  </span>
                  {(
                    [
                      "name",
                      "email",
                      "phone",
                      "state",
                      "district",
                      "block",
                      "panchayat",
                      "address",
                      "postalCode"
                    ] as Campaign["requiredFields"]
                  ).map((field) => (
                    <label key={field} className="check-row">
                      <input
                        type="checkbox"
                        checked={(campaignDraft.requiredFields ?? []).includes(field)}
                        disabled={isCampaignAdminRoute && campaignDraft.requiredFieldsLockedBySaas}
                        onChange={(e) => {
                          const currentRequiredFields = campaignDraft.requiredFields ?? [];
                          const requiredFields = e.target.checked
                            ? [...currentRequiredFields, field]
                            : currentRequiredFields.filter((f) => f !== field);
                          setCampaignDraft({
                            ...campaignDraft,
                            requiredFields: Array.from(new Set(requiredFields))
                          });
                        }}
                      />
                      {signerFieldLabel(field)}
                    </label>
                  ))}
                </div>

                <div className="wide donation-editor">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={campaignDraft.donationEnabled ?? false}
                      disabled={isCampaignAdminRoute && campaignDraft.donationLockedBySaas}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, donationEnabled: e.target.checked })
                      }
                    />
                    Enable donation/support contribution option on public campaign page
                  </label>
                  <Field label="Donation caption">
                    <input
                      value={campaignDraft.donationCaption ?? ""}
                      disabled={isCampaignAdminRoute && campaignDraft.donationLockedBySaas}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, donationCaption: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="UPI ID">
                    <input
                      placeholder="name@upi"
                      value={campaignDraft.donationUpiId ?? ""}
                      disabled={isCampaignAdminRoute && campaignDraft.donationLockedBySaas}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, donationUpiId: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Payment details">
                    <textarea
                      rows={3}
                      placeholder="Bank account, Razorpay link, instructions, etc."
                      value={campaignDraft.donationPaymentDetails ?? ""}
                      disabled={isCampaignAdminRoute && campaignDraft.donationLockedBySaas}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, donationPaymentDetails: e.target.value })
                      }
                    />
                  </Field>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={campaignDraft.donationAllowOneTime ?? true}
                      disabled={isCampaignAdminRoute && campaignDraft.donationLockedBySaas}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, donationAllowOneTime: e.target.checked })
                      }
                    />
                    Allow one-time donation
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={campaignDraft.donationAllowRecurring ?? false}
                      disabled={isCampaignAdminRoute && campaignDraft.donationLockedBySaas}
                      onChange={(e) =>
                        setCampaignDraft({
                          ...campaignDraft,
                          donationAllowRecurring: e.target.checked
                        })
                      }
                    />
                    Allow recurring donation pledge
                  </label>
                  <label className="secondary-button">
                    Upload UPI QR image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUpdateCampaignDonationQr(file);
                      }}
                    />
                  </label>
                  {campaignDraft.donationQrImage && (
                    <img
                      className="donation-qr-preview"
                      alt="Donation QR preview"
                      src={campaignDraft.donationQrImage}
                    />
                  )}
                </div>
              </div>
            )}

            {activeStep === 5 && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide media-studio">
                  <div>
                    <span className="eyebrow">Campaign media manager</span>
                    <h4>Banner, focus, and device previews</h4>
                    <p className="helper-text">
                      Recommended banner size is 1600 x 900 px. Keep faces, roads, signs, or petition
                      text near the selected focus point so mobile crops stay useful.
                    </p>
                    <label className="drop-zone compact-drop">
                      <ImageIcon size={28} />
                      <strong>Upload banner image</strong>
                      <span>Existing upload and storage logic is reused.</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUpdateCampaignMedia(file);
                        }}
                      />
                    </label>
                  </div>
                  <div className="device-preview-grid">
                    <div
                      className="desktop-preview"
                      style={{
                        backgroundImage: campaignDraft.heroImage
                          ? `url(${campaignDraft.heroImage})`
                          : undefined,
                        backgroundPosition: campaignDraft.heroImagePosition,
                        backgroundSize: `${campaignDraft.heroImageZoom}%`
                      }}
                    >
                      <span>Desktop preview</span>
                    </div>
                    <div
                      className="mobile-preview"
                      style={{
                        backgroundImage: campaignDraft.heroImage
                          ? `url(${campaignDraft.heroImage})`
                          : undefined,
                        backgroundPosition: campaignDraft.heroImagePosition,
                        backgroundSize: `${campaignDraft.heroImageZoom}%`
                      }}
                    >
                      <span>Mobile preview</span>
                    </div>
                  </div>
                  <Field label="Crop / zoom">
                    <input
                      type="range"
                      min="100"
                      max="220"
                      value={campaignDraft.heroImageZoom}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, heroImageZoom: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Focus point">
                    <select
                      value={campaignDraft.heroImagePosition}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, heroImagePosition: e.target.value })
                      }
                    >
                      <option value="center center">Center</option>
                      <option value="center top">Top</option>
                      <option value="center bottom">Bottom</option>
                      <option value="left center">Left</option>
                      <option value="right center">Right</option>
                    </select>
                  </Field>
                  <Field label="Campaign video URL">
                    <input
                      placeholder="YouTube, Instagram, or hosted video link"
                      value={campaignDraft.campaignVideoUrl}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, campaignVideoUrl: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            )}

            {activeStep === 6 && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide campaign-review-panel">
                  <div>
                    <span className="eyebrow">Campaign quality score</span>
                    <strong>{campaignQuality?.score ?? 0} / 100</strong>
                    <p className="helper-text">
                      Visual guidance only. Save and publish still use the existing handlers.
                    </p>
                  </div>
                  <div className="campaign-readiness-list">
                    {campaignQuality?.checks.map((item) => (
                      <div className={item.ready ? "ready" : ""} key={item.label}>
                        <CheckCircle2 size={18} />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.ready ? "Looks ready" : item.suggestion}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {(campaignQuality?.suggestions.length ?? 0) > 0 && (
                  <div className="wide quality-suggestions">
                    <span className="eyebrow">Suggestions</span>
                    {campaignQuality?.suggestions.map((suggestion) => (
                      <p key={suggestion}>{suggestion}</p>
                    ))}
                  </div>
                )}

                <div className="wide campaign-review-summary">
                  <div>
                    <span className="label">Campaign</span>
                    <strong>{campaignDraft.title || "Untitled campaign"}</strong>
                    <small>{campaignDraft.slug ? `/${campaignDraft.slug}` : "No public slug yet"}</small>
                  </div>
                  <div>
                    <span className="label">Status</span>
                    <strong>{campaignDraft.status}</strong>
                    <small>{getCampaignGoalValue(campaignDraft).toLocaleString()} target signatures</small>
                  </div>
                  <div>
                    <span className="label">Authority</span>
                    <strong>{selectedAuthority || "Default authority"}</strong>
                    <small>{campaignDraft.authorityTargetLevel ?? "district"} level routing</small>
                  </div>
                  <div>
                    <span className="label">Public URL</span>
                    <strong>{hasDraftSlug ? publicCampaignUrl : "Add a campaign slug to generate links."}</strong>
                    <small>{campaignDraft.startDate || "No start date"} to {campaignDraft.endDate || "No end date"}</small>
                  </div>

                  <div className="authority-2-grid">
                    <div className="authority-2-card">
                      <span className="eyebrow">Escalation chain</span>
                      <div className="hierarchy-chain">
                        {authorityEscalationChain.map((level) => <span key={level}>{level}</span>)}
                      </div>
                      <small>Government hierarchy: Ward {"->"} Panchayat {"->"} Block {"->"} District {"->"} State {"->"} National</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">Political hierarchy</span>
                      <div className="hierarchy-chain">
                        {politicalHierarchy.map((level) => <span key={level}>{level}</span>)}
                      </div>
                      <small>Use as escalation context; not sent automatically.</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">Department mapping</span>
                      <strong>{departmentMapping}</strong>
                      <small>Mapped from campaign category and template recommendation.</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">Authority confidence</span>
                      <strong>{authorityConfidenceScore}%</strong>
                      <small>Based on template, selected authority, and location completeness.</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">CSV validation preview</span>
                      <strong>{authorityCsvFile ? authorityCsvFile.name : "No CSV selected"}</strong>
                      <small>{csvUploadMessage || "Upload preview is UI/provider-ready; existing upload handler remains unchanged."}</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">Duplicate detection</span>
                      <strong>{duplicateAuthorityKeys.length.toLocaleString()} possible duplicates</strong>
                      <small>Checks uploaded authority name, department, and email keys.</small>
                    </div>
                    <div className="authority-2-card selected-authority-package">
                      <span className="eyebrow">Selected authority package</span>
                      <strong>{selectedAuthority || "No primary authority selected"}</strong>
                      <small>Primary + secondary + CC package is ready for future petition delivery providers.</small>
                    </div>
                  </div>
                </div>

                <div className="wide campaign-version-history">
                  <div className="version-history-header">
                    <History size={20} />
                    <div>
                      <span className="eyebrow">Version history</span>
                      <h4>Recent campaign changes</h4>
                    </div>
                  </div>
                  {campaignVersionHistory.length > 0 ? (
                    <div className="version-history-list">
                      {campaignVersionHistory.map((entry) => (
                        <div key={entry.id}>
                          <strong>{entry.description}</strong>
                          <span>{new Date(entry.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="helper-text">
                      Version history appears after this campaign is created, updated, published, cloned, or archived.
                    </p>
                  )}
                  {campaignDraft.archivedAt && (
                    <p className="info-message">Archived on {new Date(campaignDraft.archivedAt).toLocaleString()}.</p>
                  )}
                </div>

                {!isCampaignAdminRoute && (
                  <div className="wide saas-control-panel">
                    <span className="eyebrow">SaaS admin campaign controls</span>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.publishingLockedBySaas ?? false}
                        onChange={(e) =>
                          setCampaignDraft({
                            ...campaignDraft,
                            publishingLockedBySaas: e.target.checked
                          })
                        }
                      />
                      Lock publishing for campaign admin
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.goalLockedBySaas ?? false}
                        onChange={(e) =>
                          setCampaignDraft({ ...campaignDraft, goalLockedBySaas: e.target.checked })
                        }
                      />
                      Lock target signatures for campaign admin
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.datesLockedBySaas ?? false}
                        onChange={(e) =>
                          setCampaignDraft({ ...campaignDraft, datesLockedBySaas: e.target.checked })
                        }
                      />
                      Lock campaign start/end dates for campaign admin
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.authorityLockedBySaas ?? false}
                        onChange={(e) =>
                          setCampaignDraft({
                            ...campaignDraft,
                            authorityLockedBySaas: e.target.checked
                          })
                        }
                      />
                      Lock authority settings for campaign admin
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.donationLockedBySaas ?? false}
                        onChange={(e) =>
                          setCampaignDraft({
                            ...campaignDraft,
                            donationLockedBySaas: e.target.checked
                          })
                        }
                      />
                      Lock donation settings for campaign admin
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.requiredFieldsLockedBySaas ?? false}
                        onChange={(e) =>
                          setCampaignDraft({
                            ...campaignDraft,
                            requiredFieldsLockedBySaas: e.target.checked
                          })
                        }
                      />
                      Lock required signer fields for campaign admin
                    </label>
                    <Field label="Campaign signer limit">
                      <input
                        type="number"
                        min="0"
                        value={campaignDraft.maxSignersAllowed ?? 0}
                        onChange={(e) =>
                          setCampaignDraft({
                            ...campaignDraft,
                            maxSignersAllowed: Number(e.target.value),
                            goal:
                              Number(e.target.value) > 0
                                ? Number(e.target.value)
                                : campaignDraft.goal
                          })
                        }
                      />
                    </Field>
                    <Field label="Campaign scan limit">
                      <input
                        type="number"
                        min="0"
                        value={campaignDraft.maxScansAllowed ?? 0}
                        onChange={(e) =>
                          setCampaignDraft({
                            ...campaignDraft,
                            maxScansAllowed: Number(e.target.value)
                          })
                        }
                      />
                    </Field>
                    <p className="helper-text">
                      Set 0 for no campaign-specific limit. If signer limit is set, it also becomes the
                      read-only target signature count for campaign admins. These controls are editable
                      only from the SaaS admin workspace.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeStep === 7 && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide publish-preview">
                  <div>
                    <span className="eyebrow">Ready to publish</span>
                    <h4>{campaignDraft.title || "Untitled campaign"}</h4>
                    <p>{campaignDraft.description || "Add a campaign summary before publishing."}</p>
                    <strong>{readyCount} of {readinessItems.length} publish readiness checks look ready</strong>
                  </div>
                  <div className="publish-url-card">
                    <span className="label">Campaign URL preview</span>
                    <strong>{hasDraftSlug ? publicCampaignUrl : "Add a campaign slug to generate links."}</strong>
                    <small>{campaignDraft.status} · {getCampaignGoalValue(campaignDraft).toLocaleString()} target signatures</small>
                  </div>
                  <div className="qr-preview-card">
                    <QrCode size={64} />
                    <span>{campaignDraft.qrLabel || campaignDraft.title || "Campaign QR"}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="campaign-wizard-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={activeStep === 0}
                onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
              >
                <ChevronLeft size={18} /> Previous
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={activeStep === wizardSteps.length - 1}
                onClick={() => setActiveStep((step) => Math.min(wizardSteps.length - 1, step + 1))}
              >
                Next step <ChevronRight size={18} />
              </button>
              <button className="primary-button" type="submit">
                <Save size={18} /> {campaignFormMode === "create" ? "Create new campaign" : "Update campaign"}
              </button>
              <button className="secondary-button" type="button" onClick={onPublishCampaign}>
                <Rocket size={18} /> Publish current campaign
              </button>
              <button className="secondary-button" type="button" onClick={onCloneCampaign}>
                <GitBranch size={18} /> Clone campaign
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={campaignFormMode === "create"}
                onClick={confirmArchiveCampaign}
              >
                <Archive size={18} /> Archive campaign
              </button>
            </div>
          </form>
        ) : (
          <NoCampaignPanel
            title="Create the first Indian campaign"
            description="This workspace is clean and has no sample data. Start by creating a real campaign for an NGO, RWA, association, union, or campaign agency."
            onCreateCampaign={onCreateCampaign}
          />
        )}
      </Panel>

      <Panel title="Authority rules" icon={<Landmark />}>
        <button className="secondary-button" type="button" onClick={onAddAuthorityRule}>
          <Plus size={18} /> Add authority rule
        </button>
        <div className="authority-list">
          {authorities.map((authority) => (
            <div className="authority-editor" key={authority.id}>
              <input
                value={authority.name}
                onChange={(e) =>
                  setAuthorities((current) =>
                    current.map((a) =>
                      a.id === authority.id ? { ...a, name: e.target.value } : a
                    )
                  )
                }
              />
              <input
                value={authority.department}
                onChange={(e) =>
                  setAuthorities((current) =>
                    current.map((a) =>
                      a.id === authority.id ? { ...a, department: e.target.value } : a
                    )
                  )
                }
              />
              <input
                value={authority.email}
                onChange={(e) =>
                  setAuthorities((current) =>
                    current.map((a) =>
                      a.id === authority.id ? { ...a, email: e.target.value } : a
                    )
                  )
                }
              />
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
