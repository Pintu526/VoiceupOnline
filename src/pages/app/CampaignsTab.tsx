import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  GitBranch,
  History,
  Image as ImageIcon,
  Landmark,
  Plus,
  Printer,
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
  CampaignGeographyMode,
  CampaignScope,
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
import { GlobalLocationFields } from "../../components/GlobalLocationFields";
import { PasswordField } from "../../ui/PasswordField";
import { ReferralQrPreview } from "../../components/ReferralQrPreview";
import { QrCodeGraphic } from "../../components/QrCodeGraphic";
import { GrowthConfigurationStudio } from "../../growth/components/GrowthConfigurationStudio";
import { categories } from "../../constants";
import { createId } from "../../lib";
import {
  formatAuthorityDisplay,
  getAppealAuthority,
  getAuthorityOptionsForCampaign
} from "../../utils/authority";
import {
  getCampaignAdminUrl,
  getCampaignGeographyMode,
  getCampaignGoalValue,
  getCampaignLocationLabels,
  getCampaignPublicUrl,
  getCampaignScope,
  getCampaignScopeLabel,
  getConfiguredLocationLockLevel,
  formatLocationForCampaign,
  getLocationGovernance,
  getLocationLevelLabel,
  getLockedLocationValues,
  getSignerLocationRestrictionLevel,
  getSaasAdminPageUrl,
  hasSaasLocks,
  isGlobalCampaign,
  signerFieldLabel
} from "../../utils/campaign";
import { downloadQrPosterSvg, getCampaignReferralUrl } from "../../utils/referrals";
import { useTranslation } from "../../i18n";

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
  "organisation", "details", "authorities", "location", "supporterForm", "media", "growth", "publish"
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

const campaignScopeOptions: CampaignScope[] = [
  "local",
  "city",
  "state_province",
  "national",
  "global"
];

function isCampaignLocationReady(campaign: Campaign) {
  if (!isGlobalCampaign(campaign)) return Boolean(campaign.state && campaign.district);
  const scope = getCampaignScope(campaign);
  if (scope === "global") return true;
  if (scope === "national") return Boolean(campaign.country);
  if (scope === "state_province") return Boolean(campaign.country && campaign.state);
  if (scope === "city") return Boolean(campaign.country && campaign.state && campaign.district);
  return Boolean(campaign.country && campaign.state && campaign.district && campaign.panchayat);
}

function getCampaignLocationReadinessSuggestion(campaign: Campaign) {
  if (!isGlobalCampaign(campaign)) return "Select at least state and district.";
  const labels = getCampaignLocationLabels(campaign);
  const scope = getCampaignScope(campaign);
  if (scope === "global") return "Global campaigns do not require a fixed location.";
  if (scope === "national") return `Add ${labels.country.toLowerCase()}.`;
  if (scope === "state_province") return `Add ${labels.country.toLowerCase()} and ${labels.state.toLowerCase()}.`;
  if (scope === "city") return `Add ${labels.country.toLowerCase()}, ${labels.state.toLowerCase()}, and ${labels.district.toLowerCase()}.`;
  return `Add ${labels.country.toLowerCase()}, ${labels.state.toLowerCase()}, ${labels.district.toLowerCase()}, and ${labels.panchayat.toLowerCase()}.`;
}

function getCampaignQuality(
  campaign: Campaign,
  selectedAuthority: string,
  selectedTemplate: CampaignTemplate | undefined,
  t: (key: string) => string
) {
  const checks = [
    {
      label: t("campaignAdmin.quality.title"),
      ready: campaign.title.trim().length >= 18,
      suggestion: t("campaignAdmin.quality.titleHelp")
    },
    {
      label: t("campaignAdmin.quality.description"),
      ready: campaign.description.trim().length >= 80 && (campaign.appealContent ?? "").trim().length >= 120,
      suggestion: t("campaignAdmin.quality.descriptionHelp")
    },
    {
      label: t("campaignAdmin.quality.banner"),
      ready: Boolean(campaign.heroImage),
      suggestion: t("campaignAdmin.quality.bannerHelp")
    },
    {
      label: t("campaignAdmin.quality.authority"),
      ready: Boolean(selectedAuthority || campaign.selectedAuthorityId || campaign.authorityTargetLevel),
      suggestion: t("campaignAdmin.quality.authorityHelp")
    },
    {
      label: t("campaignAdmin.quality.location"),
      ready: isCampaignLocationReady(campaign),
      suggestion: getCampaignLocationReadinessSuggestion(campaign)
    },
    {
      label: t("campaignAdmin.quality.goal"),
      ready: getCampaignGoalValue(campaign) >= 100,
      suggestion: t("campaignAdmin.quality.goalHelp")
    },
    {
      label: t("campaignAdmin.quality.supporterForm"),
      ready: (campaign.requiredFields ?? []).length > 0,
      suggestion: t("campaignAdmin.quality.supporterFormHelp")
    },
    {
      label: t("campaignAdmin.quality.templateFit"),
      ready: Boolean(selectedTemplate),
      suggestion: t("campaignAdmin.quality.templateFitHelp")
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
  const { t } = useTranslation();
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
  const canUseCampaignCreationTools = campaignFormMode === "create" && !isCampaignAdminRoute;
  const [campaignLinkMessage, setCampaignLinkMessage] = useState("");
  const [creationMode, setCreationMode] = useState<"manual" | "template" | "ai">("manual");
  const savedSnapshot = campaignFormMode === "edit" ? campaignSnapshot(activeCampaign) : "";
  const draftSnapshot = campaignSnapshot(campaignDraft);
  const hasUnsavedChanges = Boolean(campaignDraft) && (
    campaignFormMode === "create" || draftSnapshot !== savedSnapshot
  );

  useEffect(() => {
    if (campaignFormMode === "create") {
      setCreationMode("manual");
      setActiveStep(0);
    }
  }, [campaignFormMode]);

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
  const orgSetupIncomplete = !organization.name || !organization.ownerEmail;
  const governedLocationValues = getLockedLocationValues(
    locationGovernance,
    configuredGovernanceLockLevel
  );
  const effectiveCampaignDraft = campaignDraft
    ? { ...campaignDraft, ...governedLocationValues }
    : null;
  const campaignGeographyMode = getCampaignGeographyMode(effectiveCampaignDraft ?? campaignDraft ?? activeCampaign);
  const isGlobalMode = campaignGeographyMode === "global";
  const locationLabels = getCampaignLocationLabels(effectiveCampaignDraft ?? campaignDraft ?? activeCampaign);
  const campaignScope = getCampaignScope(effectiveCampaignDraft ?? campaignDraft ?? activeCampaign);
  const signerRestrictionOptions: [LocationGovernanceLevel, string][] = isGlobalMode
    ? [
        ["none", "No public location restriction"],
        ["state", `Restrict public signing to campaign ${locationLabels.state}`],
        ["district", `Restrict public signing to campaign ${locationLabels.district}`],
        ["panchayat", `Restrict public signing to campaign ${locationLabels.panchayat}`]
      ]
    : [
        ["none", "No public location restriction"],
        ["state", `Restrict public signing to campaign ${locationLabels.state}`],
        ["district", `Restrict public signing to campaign ${locationLabels.district}`],
        ["block", `Restrict public signing to campaign ${locationLabels.block}`],
        ["panchayat", `Restrict public signing to campaign ${locationLabels.panchayat}`]
      ];
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
  const authorityEscalationChain = isGlobalMode
    ? ["Local", "City", "State / Province", "National", "Global"]
    : ["Ward", "Panchayat", "Block", "District", "State", "National"];
  const politicalHierarchy = isGlobalMode
    ? ["Community Lead", "City Official", "Regional Representative", "National Office", "International Partner"]
    : ["Ward Member", "Sarpanch", "Councillor", "MLA", "MP", "Minister"];
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
          label: t("campaignAdmin.quality.basics"),
          ready: Boolean(campaignDraft.title && campaignDraft.slug && getCampaignGoalValue(campaignDraft) > 0),
          detail: campaignDraft.title || t("campaignAdmin.quality.nameEmpty")
        },
        {
          label: t("campaignAdmin.fields.locationGovernance"),
          ready: effectiveCampaignDraft ? isCampaignLocationReady(effectiveCampaignDraft) : false,
          detail:
            effectiveCampaignDraft
              ? formatLocationForCampaign(effectiveCampaignDraft, effectiveCampaignDraft) ||
                getCampaignLocationReadinessSuggestion(effectiveCampaignDraft)
              : t("campaignAdmin.quality.locationEmpty")
        },
        {
          label: t("campaignAdmin.dashboard.authorityRouting"),
          ready: Boolean(selectedAuthority),
          detail: selectedAuthority || t("campaignAdmin.quality.defaultAuthority")
        },
        {
          label: t("campaignAdmin.quality.publicContent"),
          ready: Boolean(campaignDraft.description && campaignDraft.consentText),
          detail: campaignDraft.description ? t("campaignAdmin.quality.descriptionPresent") : t("campaignAdmin.quality.descriptionEmpty")
        }
      ]
    : [];
  const readyCount = readinessItems.filter((item) => item.ready).length;
  const campaignQuality = campaignDraft
    ? getCampaignQuality(campaignDraft, selectedAuthority, selectedTemplate, t)
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
  const starterReferralCode = hasDraftSlug ? `ADMIN-${draftSlug.toUpperCase().slice(0, 8)}` : "";
  const starterReferralUrl = hasDraftSlug
    ? getCampaignReferralUrl(organization, { slug: draftSlug }, starterReferralCode)
    : "";
  const requiredSignerFieldOptions: SignerRequiredField[] = isGlobalMode
    ? ["name", "email", "phone", "country", "state", "district", "panchayat", "address", "postalCode"]
    : ["name", "email", "phone", "state", "district", "block", "panchayat", "address", "postalCode"];

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
    const campaignName = campaignDraft.title || t("campaignAdmin.common.thisCampaign");
    const confirmed = window.confirm(
      `${t("campaignAdmin.confirm.archive")} "${campaignName}"? ${t("campaignAdmin.confirm.archiveKept")}`
    );
    if (!confirmed) return;
    const typedConfirmation = window.prompt(
      `${t("campaignAdmin.confirm.typeArchive")} "${campaignName}".`
    );
    if (typedConfirmation === "ARCHIVE") {
      onArchiveCampaign();
    }
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

  function updateCampaignGeographyMode(mode: CampaignGeographyMode) {
    if (!campaignDraft) return;
    const nextCountry =
      mode === "india_detailed"
        ? "India"
        : campaignDraft.country?.trim().toLowerCase() === "india"
          ? ""
          : campaignDraft.country ?? "";
    setCampaignDraft({
      ...campaignDraft,
      geographyMode: mode,
      country: nextCountry,
      block: mode === "global" ? "" : campaignDraft.block,
      campaignScope: campaignDraft.campaignScope ?? (mode === "global" ? "city" : "local"),
      signerLocationRestrictionLevel:
        mode === "global" && campaignDraft.signerLocationRestrictionLevel === "block"
          ? "district"
          : campaignDraft.signerLocationRestrictionLevel
    });
  }

  function updateCampaignScope(scope: CampaignScope) {
    if (!campaignDraft) return;
    setCampaignDraft({
      ...campaignDraft,
      campaignScope: scope,
      authorityTargetLevel:
        scope === "national" || scope === "global"
          ? "country"
          : scope === "state_province"
            ? "state"
            : campaignDraft.authorityTargetLevel
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
      <Panel
        title={t(campaignFormMode === "create" ? "campaignAdmin.studio.createNew" : "campaignAdmin.studio.configuration")}
        icon={<Settings />}
      >
        {orgSetupIncomplete && campaignFormMode === "create" && (
          <div className="info-message wide">
            <strong>{t("campaignAdmin.studio.organizationIncomplete")}</strong>
            <span>
              You can still create a campaign draft here. Complete your workspace details later in SaaS admin.
            </span>
          </div>
        )}
        {campaignDraft ? (
          <form className="campaign-wizard" onSubmit={onSaveCampaign}>
            <div className="campaign-wizard-progress" aria-label={t("campaignAdmin.studio.progressAria")}>
              {wizardSteps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  className={index === activeStep ? "active" : ""}
                  aria-current={index === activeStep ? "step" : undefined}
                  onClick={() => setActiveStep(index)}
                >
                  <span>{index + 1}</span>
                  <strong>{t(`campaignAdmin.studio.steps.${step}.title`)}</strong>
                </button>
              ))}
            </div>

            <div className="campaign-wizard-header">
              <div className="campaign-wizard-title-row">
                <div>
                  <span className="eyebrow">{t("campaignAdmin.studio.step")} {activeStep + 1} {t("campaignAdmin.selector.of")} {wizardSteps.length}</span>
                  <h3>{t(`campaignAdmin.studio.steps.${wizardSteps[activeStep]}.title`)}</h3>
                  <p>{t(`campaignAdmin.studio.steps.${wizardSteps[activeStep]}.helper`)}</p>
                </div>
                {canUseCampaignCreationTools && (
                  <button className="secondary-button" type="button" onClick={onOpenAiCopilot}>
                    <Sparkles size={18} /> {t("campaignAdmin.studio.createWithAi")}
                  </button>
                )}
              </div>
              <div className="progress">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>

            {hasUnsavedChanges && (
              <div className="unsaved-changes-banner" role="status">
                <AlertTriangle size={18} />
                <div>
                  <strong>{t("campaignAdmin.studio.unsaved")}</strong>
                  <span>
                    {campaignFormMode === "create"
                      ? t("campaignAdmin.studio.newDraftHelp")
                      : t("campaignAdmin.studio.updateBeforeLeaving")}
                  </span>
                </div>
              </div>
            )}

            {activeStep === 0 && (
              <div className="campaign-wizard-step template-library">
                {canUseCampaignCreationTools && (
                  <div className="creation-mode-toolbar">
                    <button
                      className={creationMode === "manual" ? "selected" : "secondary-button"}
                      type="button"
                      onClick={() => setCreationMode("manual")}
                    >
                      {t("campaignAdmin.studio.manual")}
                    </button>
                    <button
                      className={creationMode === "template" ? "selected" : "secondary-button"}
                      type="button"
                      onClick={() => setCreationMode("template")}
                    >
                      {t("campaignAdmin.studio.fromTemplate")}
                    </button>
                    <button
                      className={creationMode === "ai" ? "selected" : "secondary-button"}
                      type="button"
                      onClick={() => setCreationMode("ai")}
                    >
                      {t("campaignAdmin.studio.createWithAi")}
                    </button>
                  </div>
                )}

                {!canUseCampaignCreationTools || creationMode === "manual" ? (
                  <div className="manual-campaign-entry">
                    <div className="form-grid">
                      <Field label={t("campaignAdmin.fields.locationGovernance")}>
                        <select
                          value={campaignGeographyMode}
                          onChange={(e) => updateCampaignGeographyMode(e.target.value as CampaignGeographyMode)}
                        >
                          <option value="global">{t("campaignAdmin.options.globalMode")}</option>
                          <option value="india_detailed">{t("campaignAdmin.options.indiaMode")}</option>
                        </select>
                      </Field>
                      <Field label={t("campaignAdmin.fields.campaignReach")}>
                        <select
                          value={campaignScope}
                          onChange={(e) => updateCampaignScope(e.target.value as CampaignScope)}
                        >
                          {campaignScopeOptions.map((scope) => (
                            <option key={scope} value={scope}>
                              {getCampaignScopeLabel(scope)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {isGlobalMode && (
                        <Field label={locationLabels.country}>
                          <input
                            value={campaignDraft?.country ?? ""}
                            onChange={(e) => setCampaignDraft({ ...campaignDraft!, country: e.target.value })}
                            placeholder={locationLabels.country}
                          />
                        </Field>
                      )}
                    </div>
                      <Field label={t("campaignAdmin.fields.campaignTitle")}>
                      <input
                        value={campaignDraft?.title ?? ""}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft!, title: e.target.value })}
                            placeholder={t("campaignAdmin.placeholders.title")}
                      />
                    </Field>
                      <Field label={t("campaignAdmin.fields.campaignSlug")}>
                      <input
                        value={campaignDraft?.slug ?? ""}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft!, slug: e.target.value })}
                            placeholder={t("campaignAdmin.placeholders.slug")}
                      />
                    </Field>
                      <Field label={t("campaignAdmin.fields.summary")}>
                      <textarea
                        value={campaignDraft?.description ?? ""}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft!, description: e.target.value })}
                            placeholder={t("campaignAdmin.placeholders.summary")}
                      />
                    </Field>
                      <Field label={t("campaignAdmin.fields.description")}>
                      <textarea
                        value={campaignDraft?.appealContent ?? ""}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft!, appealContent: e.target.value })}
                            placeholder={t("campaignAdmin.placeholders.description")}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label={locationLabels.state}>
                        <input
                          value={campaignDraft?.state ?? ""}
                          onChange={(e) => setCampaignDraft({ ...campaignDraft!, state: e.target.value })}
                          placeholder={locationLabels.state}
                        />
                      </Field>
                      <Field label={locationLabels.district}>
                        <input
                          value={campaignDraft?.district ?? ""}
                          onChange={(e) => setCampaignDraft({ ...campaignDraft!, district: e.target.value })}
                          placeholder={locationLabels.district}
                        />
                      </Field>
                      {isGlobalMode && (
                        <Field label={locationLabels.panchayat}>
                          <input
                            value={campaignDraft?.panchayat ?? ""}
                            onChange={(e) => setCampaignDraft({ ...campaignDraft!, panchayat: e.target.value })}
                            placeholder={locationLabels.panchayat}
                          />
                        </Field>
                      )}
                      <Field label={t("campaignAdmin.fields.authority")}>
                        <select
                          value={campaignDraft?.selectedAuthorityId ?? ""}
                          onChange={(e) => setCampaignDraft({ ...campaignDraft!, selectedAuthorityId: e.target.value })}
                        >
                          <option value="">{t("campaignAdmin.options.selectAuthority")}</option>
                          {authorities.map((authority) => (
                            <option key={authority.id} value={authority.id}>
                              {authority.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                ) : creationMode === "template" ? (
                  <>
                    <div className="template-toolbar">
                      <Field label={t("campaignAdmin.fields.searchTemplates")}>
                        <div className="input-with-icon">
                          <Search size={18} />
                          <input
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder={t("campaignAdmin.placeholders.searchTemplates")}
                          />
                        </div>
                      </Field>
                      <Field label={t("campaignAdmin.fields.categoryFilter")}>
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
                            <span className="eyebrow">{t("campaignAdmin.selector.favourites")}</span>
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
                            <span className="eyebrow">{t("campaignAdmin.selector.recent")}</span>
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
                      {templates.length === 0 &&
                        Array.from({ length: 6 }).map((_, index) => (
                          <div className="template-card loading-card" key={`template-loading-${index}`} aria-hidden="true">
                            <span className="skeleton-line short" />
                            <span className="skeleton-line" />
                            <span className="skeleton-line" />
                          </div>
                        ))}
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
                              <summary>{t("campaignAdmin.studio.previewDetails")}</summary>
                              <p>{template.summary}</p>
                              <small>{template.suggestedBannerStyle}</small>
                            </details>
                            <button className="primary-button" type="button" onClick={() => applyTemplate(template)}>
                              {t("campaignAdmin.studio.useTemplate")}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                    {templates.length === 0 && <p className="helper-text">{t("campaignAdmin.studio.loadingTemplates")}</p>}
                    {templates.length > 0 && filteredTemplates.length === 0 && (
                      <p className="helper-text">{t("campaignAdmin.studio.noTemplates")}</p>
                    )}
                  </>
                ) : (
                  <div className="campaign-ai-callout">
                    <p>{t("campaignAdmin.studio.aiHelp")}</p>
                    <button className="primary-button" type="button" onClick={onOpenAiCopilot}>
                      <Sparkles size={18} /> {t("campaignAdmin.studio.openAiBuilder")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeStep === 1 && (
              <div className="form-grid campaign-wizard-step">
                {isCampaignAdminRoute && hasSaasLocks(campaignDraft) && (
                  <div className="info-message wide campaign-admin-control-summary">
                    <strong>{t("campaignAdmin.studio.saasControlsActive")}</strong>
                    <span>{t("campaignAdmin.fields.targetSignatures")}: {getCampaignGoalValue(campaignDraft).toLocaleString()}</span>
                    <span>
                      {t("campaignAdmin.fields.signerLimit")}: {" "}
                      {campaignDraft.maxSignersAllowed > 0
                        ? campaignDraft.maxSignersAllowed.toLocaleString()
                        : t("campaignAdmin.common.noSpecificLimit")}
                    </span>
                    <span>
                      {t("campaignAdmin.fields.scanLimit")}: {" "}
                      {campaignDraft.maxScansAllowed > 0
                        ? campaignDraft.maxScansAllowed.toLocaleString()
                        : t("campaignAdmin.common.noSpecificLimit")}
                    </span>
                    <span>{t("campaignAdmin.fields.startDate")}: {campaignDraft.startDate || t("campaignAdmin.common.notSet")}</span>
                    <span>{t("campaignAdmin.fields.endDate")}: {campaignDraft.endDate || t("campaignAdmin.common.notSet")}</span>
                  </div>
                )}

                <Field label={t("campaignAdmin.fields.campaignName")}>
                  <input
                    value={campaignDraft.title}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, title: e.target.value })}
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.publicSlug")}>
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
                <Field label={t("campaignAdmin.fields.category")}>
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
                <Field label={t("campaignAdmin.fields.status")}>
                  <select
                    value={campaignDraft.status}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, status: e.target.value as Campaign["status"] })
                    }
                  >
                    <option value="Draft">{t("campaignAdmin.status.draft")}</option>
                    <option value="Published">{t("campaignAdmin.status.published")}</option>
                    <option value="Paused">{t("campaignAdmin.status.paused")}</option>
                    <option value="Closed">{t("campaignAdmin.status.closed")}</option>
                  </select>
                </Field>
                <Field label={t("campaignAdmin.fields.targetSignatures")}>
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
                    <small>{t("campaignAdmin.studio.saasLimit")}: {campaignDraft.maxSignersAllowed.toLocaleString()} {t("campaignAdmin.fields.signers")}</small>
                  )}
                </Field>
                <Field label={t("campaignAdmin.fields.locationLabel")}>
                  <input
                    value={campaignDraft.location}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, location: e.target.value })}
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.startDate")}>
                  <input
                    type="date"
                    value={campaignDraft.startDate}
                    disabled={isCampaignAdminRoute && campaignDraft.datesLockedBySaas}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, startDate: e.target.value })}
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.endDate")}>
                  <input
                    type="date"
                    value={campaignDraft.endDate}
                    disabled={isCampaignAdminRoute && campaignDraft.datesLockedBySaas}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, endDate: e.target.value })}
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.publicShareUrl")}>
                  <input
                    value={hasDraftSlug ? publicCampaignUrl : ""}
                    placeholder={t("campaignAdmin.placeholders.addSlugUrl")}
                    readOnly
                  />
                  <small>{t("campaignAdmin.studio.generatedFromSlug")}</small>
                </Field>
                <Field label={t("campaignAdmin.fields.adminUrl")}>
                  <input
                    value={hasDraftSlug ? campaignAdminUrl : ""}
                    placeholder={t("campaignAdmin.placeholders.addSlugUrl")}
                    readOnly
                  />
                  <small>{t("campaignAdmin.studio.generatedFromSlug")}</small>
                </Field>
                <div className="campaign-links-card wide" aria-live="polite">
                  <div className="campaign-links-header">
                    <div>
                      <span className="eyebrow">{t("campaignAdmin.links.title")}</span>
                      <h4>{t("campaignAdmin.links.slugRoutes")}</h4>
                    </div>
                    {!hasDraftSlug && (
                      <span className="route-warning">{t("campaignAdmin.links.addSlug")}</span>
                    )}
                  </div>
                  <div className="campaign-link-list">
                    <div className="campaign-link-row public-route">
                      <span>{t("campaignAdmin.links.publicUrl")}</span>
                      <code>{hasDraftSlug ? publicCampaignUrl : t("campaignAdmin.links.slugRequired")}</code>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!hasDraftSlug}
                        onClick={() => copyCampaignLink("Public campaign URL", publicCampaignUrl)}
                      >
                        <Copy size={16} /> {copiedCampaignLink === "Public campaign URL" ? t("campaignAdmin.actions.copied") : t("campaignAdmin.actions.copy")}
                      </button>
                    </div>
                    <div className="campaign-link-row campaign-admin-route">
                      <span>{t("campaignAdmin.links.adminUrl")}</span>
                      <code>{hasDraftSlug ? campaignAdminUrl : t("campaignAdmin.links.slugRequired")}</code>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!hasDraftSlug}
                        onClick={() => copyCampaignLink("Campaign admin URL", campaignAdminUrl)}
                      >
                        <Copy size={16} /> {copiedCampaignLink === "Campaign admin URL" ? t("campaignAdmin.actions.copied") : t("campaignAdmin.actions.copy")}
                      </button>
                    </div>
                    <div className="campaign-link-row saas-admin-route">
                      <span>{t("campaignAdmin.links.saasUrl")}</span>
                      <code>{saasAdminUrl}</code>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => copyCampaignLink("SaaS admin URL", saasAdminUrl)}
                      >
                        <Copy size={16} /> {copiedCampaignLink === "SaaS admin URL" ? t("campaignAdmin.actions.copied") : t("campaignAdmin.actions.copy")}
                      </button>
                    </div>
                  </div>
                  {campaignLinkMessage && <p className="success-message">{campaignLinkMessage}</p>}
                </div>
                <div className="qr-sharing-center wide">
                  <div className="campaign-links-header">
                    <div>
                      <span className="eyebrow">{t("campaignAdmin.links.qrCenter")}</span>
                      <h4>{t("campaignAdmin.links.posterReferral")}</h4>
                    </div>
                    <span className="status-pill">{t("campaignAdmin.links.qrReady")}</span>
                  </div>
                  <div className="qr-sharing-grid">
                    <ReferralQrPreview
                      value={publicCampaignUrl || "Slug required"}
                      label={t("campaignAdmin.links.publicQr")}
                      caption={hasDraftSlug ? t("campaignAdmin.links.publicSignerUrl") : t("campaignAdmin.links.addSlug")}
                    />
                    <ReferralQrPreview
                      value={campaignAdminUrl || "Slug required"}
                      label={t("campaignAdmin.links.adminQr")}
                      caption={hasDraftSlug ? t("campaignAdmin.links.adminLoginUrl") : t("campaignAdmin.links.addSlug")}
                      compact
                    />
                    <div className="qr-poster-preview">
                      <span className="eyebrow">{t("campaignAdmin.links.printablePoster")}</span>
                      <strong>{campaignDraft.title || t("campaignAdmin.fields.campaignTitle")}</strong>
                      <p>{campaignDraft.description || t("campaignAdmin.links.posterSummary")}</p>
                      <code>{hasDraftSlug ? publicCampaignUrl : t("campaignAdmin.links.slugRequired")}</code>
                      <small>Scan to sign · {organization.name || "Voiceup"} · {campaignDraft.category}</small>
                    </div>
                  </div>
                  <div className="campaign-link-row referral-route">
                    <span>{t("campaignAdmin.links.referralUrl")}</span>
                    <code>{hasDraftSlug ? starterReferralUrl : t("campaignAdmin.links.slugRequired")}</code>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!hasDraftSlug}
                      onClick={() => copyCampaignLink("Starter referral URL", starterReferralUrl)}
                    >
                      <Copy size={16} /> {copiedCampaignLink === "Starter referral URL" ? t("campaignAdmin.actions.copied") : t("campaignAdmin.actions.copy")}
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!hasDraftSlug}
                      onClick={() =>
                        downloadQrPosterSvg({
                          campaign: campaignDraft,
                          organizationName: organization.name,
                          url: publicCampaignUrl,
                          referralCode: starterReferralCode
                        })
                      }
                    >
                      <Download size={16} /> {t("campaignAdmin.actions.downloadPoster")}
                    </button>
                    <button className="secondary-button" type="button" disabled={!hasDraftSlug} onClick={() => window.print()}>
                      <Printer size={16} /> {t("campaignAdmin.actions.printPoster")}
                    </button>
                  </div>
                  <p className="info-message">
                    {t("campaignAdmin.links.readyMessage")}
                  </p>
                </div>
                <Field label={t("campaignAdmin.fields.adminEmail")}>
                  <input
                    type="email"
                    value={campaignDraft.adminEmail ?? ""}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, adminEmail: e.target.value })}
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.adminPasscode")}>
                  <PasswordField
                    placeholder={t("campaignAdmin.login.passcodePlaceholder")}
                    value={campaignDraft.adminPasscode ?? ""}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, adminPasscode: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.qrLabel")}>
                  <input
                    value={campaignDraft.qrLabel}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, qrLabel: e.target.value })}
                  />
                </Field>
              </div>
            )}

            {activeStep === 3 && effectiveCampaignDraft && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide location-mode-panel">
                  <span className="eyebrow">{t("campaignAdmin.fields.locationGovernance")}</span>
                  <div className="form-grid">
                    <Field label={t("campaignAdmin.fields.geographyMode")}>
                      <select
                        value={campaignGeographyMode}
                        onChange={(e) => updateCampaignGeographyMode(e.target.value as CampaignGeographyMode)}
                      >
                        <option value="global">{t("campaignAdmin.options.globalMode")}</option>
                        <option value="india_detailed">{t("campaignAdmin.options.indiaMode")}</option>
                      </select>
                    </Field>
                    <Field label={t("campaignAdmin.fields.campaignReach")}>
                      <select
                        value={campaignScope}
                        onChange={(e) => updateCampaignScope(e.target.value as CampaignScope)}
                      >
                        {campaignScopeOptions.map((scope) => (
                          <option key={scope} value={scope}>
                            {getCampaignScopeLabel(scope)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
                {!isGlobalMode && locationGovernance.lockLevel !== "none" && (
                  <div className="info-message wide geography-lock-summary">
                    <strong>
                      Location Governance lock: {getLocationLevelLabel(locationGovernance.lockLevel)}
                    </strong>
                    <span>
                      India detailed campaign configuration is limited to{" "}
                      {[locationGovernance.panchayat, locationGovernance.block, locationGovernance.district, locationGovernance.state]
                        .filter(Boolean)
                        .join(", ")}
                      .
                    </span>
                  </div>
                )}
                {isGlobalMode ? (
                  <GlobalLocationFields
                    idPrefix="campaign-global-location"
                    values={effectiveCampaignDraft}
                    onChange={(values) => setCampaignDraft({ ...campaignDraft, ...values, block: "" })}
                    lockedLevel="none"
                  />
                ) : (
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
                )}

                <div className="wide signer-restriction-panel">
                  <span className="eyebrow">{t("campaignAdmin.fields.signerLocationRestriction")}</span>
                  <p className="helper-text">
                    Further restrict public signatures to the selected campaign geography for a local cause.
                  </p>
                  {signerRestrictionOptions.map(([level, label]) => (
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

            {activeStep === 2 && effectiveCampaignDraft && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide authority-intelligence-panel">
                  <div className="authority-intelligence-header">
                    <div>
                      <span className="eyebrow">{t("campaignAdmin.authority.intelligence")}</span>
                      <h4>{t("campaignAdmin.authority.recommendedRouting")}</h4>
                      <p className="helper-text">
                        Recommendations are generated from the selected template and Location Governance.
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
                            <span>{t("campaignAdmin.authority.visibilityReady")}</span>
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
                <Field label={t("campaignAdmin.fields.searchAuthority")}>
                      <div className="input-with-icon">
                        <Search size={18} />
                        <input
                          value={authoritySearch}
                          onChange={(e) => setAuthoritySearch(e.target.value)}
                    placeholder={t("campaignAdmin.placeholders.searchAuthority")}
                        />
                      </div>
                    </Field>
                <Field label={t("campaignAdmin.fields.category")}>
                      <select
                        value={authorityCategoryFilter}
                        onChange={(e) => setAuthorityCategoryFilter(e.target.value)}
                      >
                        {authorityDirectoryCategories.map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </Field>
                <Field label={t("campaignAdmin.fields.type")}>
                      <select value={authorityKindFilter} onChange={(e) => setAuthorityKindFilter(e.target.value)}>
                    <option value="All">{t("campaignAdmin.options.all")}</option>
                    <option value="Government">{t("campaignAdmin.options.government")}</option>
                    <option value="Political">{t("campaignAdmin.options.political")}</option>
                    <option value="NGO">NGO</option>
                      </select>
                    </Field>
                <Field label={t("campaignAdmin.fields.department")}>
                      <select
                        value={authorityDepartmentFilter}
                        onChange={(e) => setAuthorityDepartmentFilter(e.target.value)}
                      >
                        {authorityDepartments.map((department) => (
                          <option key={department}>{department}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={locationLabels.state}>
                      <input
                        value={authorityStateFilter}
                        onChange={(e) => setAuthorityStateFilter(e.target.value)}
                        placeholder={effectiveCampaignDraft.state || `Any ${locationLabels.state.toLowerCase()}`}
                      />
                    </Field>
                    <Field label={locationLabels.district}>
                      <input
                        value={authorityDistrictFilter}
                        onChange={(e) => setAuthorityDistrictFilter(e.target.value)}
                        placeholder={effectiveCampaignDraft.district || `Any ${locationLabels.district.toLowerCase()}`}
                      />
                    </Field>
                  </div>

                  {(recentAuthorities.length > 0 || favoriteAuthorityIds.length > 0) && (
                    <div className="template-quick-lanes">
                      {recentAuthorities.length > 0 && (
                        <div>
                          <span className="eyebrow">{t("campaignAdmin.authority.recentlyUsed")}</span>
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
                          <span className="eyebrow">{t("campaignAdmin.selector.favourites")}</span>
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
                    {authorityDirectory.length === 0 &&
                      Array.from({ length: 6 }).map((_, index) => (
                        <div className="authority-directory-card loading-card" key={`authority-loading-${index}`} aria-hidden="true">
                          <span className="skeleton-line short" />
                          <span className="skeleton-line" />
                          <span className="skeleton-line" />
                        </div>
                      ))}
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
                    {authorityDirectory.length === 0
                      ? "Loading authority directory..."
                      : `Showing ${Math.min(filteredAuthorityDirectory.length, 12)} of ${filteredAuthorityDirectory.length} profiles. Local office details remain editable in uploaded authority rules.`}
                  </p>
                </div>

                <Field label={t("campaignAdmin.fields.appealAuthority")}>
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
                    <option value="district">{locationLabels.district} level authority</option>
                    <option value="state">{locationLabels.state} level authority</option>
                    <option value="country">{t("campaignAdmin.options.nationalAuthority")}</option>
                  </select>
                </Field>
                <Field label={t("campaignAdmin.fields.authoritySelectionMode")}>
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
                    <option value="admin_enforced">{t("campaignAdmin.options.adminEnforced")}</option>
                    <option value="public_choice">{t("campaignAdmin.options.publicChoice")}</option>
                  </select>
                </Field>
                <Field label={t("campaignAdmin.fields.chooseAuthority")}>
                  <select
                    value={campaignDraft.selectedAuthorityId ?? ""}
                    disabled={isCampaignAdminRoute && campaignDraft.authorityLockedBySaas}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, selectedAuthorityId: e.target.value })
                    }
                  >
                    <option value="">{t("campaignAdmin.options.defaultAuthority")}</option>
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
                <Field label={t("campaignAdmin.fields.selectedAuthority")}>
                  <input value={selectedAuthority} readOnly />
                </Field>

                <div className="wide multi-authority-panel">
                  <span className="eyebrow">{t("campaignAdmin.authority.multiRouting")}</span>
                  <div className="campaign-review-summary">
                    <div>
                      <span className="label">{t("campaignAdmin.authority.primary")}</span>
                      <strong>{selectedAuthority || "Default authority routing"}</strong>
                      <small>{t("campaignAdmin.authority.primaryHelp")}</small>
                    </div>
                    <div>
                      <span className="label">{t("campaignAdmin.authority.secondary")}</span>
                      <strong>{secondaryAuthorityIds.length}</strong>
                      <small>{t("campaignAdmin.authority.secondaryHelp")}</small>
                    </div>
                    <div>
                      <span className="label">{t("campaignAdmin.authority.cc")}</span>
                      <strong>{ccAuthorityIds.length}</strong>
                      <small>{t("campaignAdmin.authority.ccHelp")}</small>
                    </div>
                    <div>
                      <span className="label">{t("campaignAdmin.authority.publicVisibility")}</span>
                      <strong>{t("campaignAdmin.authority.configurable")}</strong>
                      <small>{t("campaignAdmin.authority.visibilityHelp")}</small>
                    </div>
                  </div>
                </div>

                <div className="wide upload-tools">
                  <div className="csv-upload-card">
                    <span className="label">{t("campaignAdmin.authority.locationCsv")}</span>
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
                    <span className="label">{t("campaignAdmin.authority.authorityCsv")}</span>
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
                    Location CSV: country,state,district,block,panchayat,pin/postalCode. Authority CSV:
                    level,state,district,position,name,address,email,phone.
                  </span>
                  {authorityCsvFile && (
                    <div className="csv-review-panel wide">
                      <span className="eyebrow">{t("campaignAdmin.authority.csvPreview")}</span>
                      <div className="campaign-review-summary">
                        <div>
                          <span className="label">{t("campaignAdmin.authority.file")}</span>
                          <strong>{authorityCsvFile.name}</strong>
                          <small>{Math.round(authorityCsvFile.size / 1024)} KB selected</small>
                        </div>
                        <div>
                          <span className="label">{t("campaignAdmin.authority.validation")}</span>
                          <strong>{t("campaignAdmin.authority.readyValidate")}</strong>
                          <small>{t("campaignAdmin.authority.validationHelp")}</small>
                        </div>
                        <div>
                          <span className="label">{t("campaignAdmin.authority.duplicates")}</span>
                          <strong>{t("campaignAdmin.authority.readyDetect")}</strong>
                          <small>{t("campaignAdmin.authority.duplicateHelp")}</small>
                        </div>
                        <div>
                          <span className="label">{t("campaignAdmin.authority.importSummary")}</span>
                          <strong>{t("campaignAdmin.authority.generatedUpload")}</strong>
                          <small>{t("campaignAdmin.authority.uploadMessageHelp")}</small>
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
                <Field label={t("campaignAdmin.fields.campaignDescription")} wide>
                  <textarea
                    rows={5}
                    value={campaignDraft.description}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, description: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.appealText")} wide>
                  <textarea
                    rows={5}
                    value={campaignDraft.appealContent ?? ""}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, appealContent: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.consentText")} wide>
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
                    <span className="label">{t("campaignAdmin.fields.bannerImage")}</span>
                    <p className="helper-text">
                      Recommended size: 1600 x 900 px. Use a clear landscape image with important
                      content near the selected focus point.
                    </p>
                    <label className="drop-zone compact-drop">
                      <ImageIcon size={28} />
                      <strong>{t("campaignAdmin.media.uploadBanner")}</strong>
                      <span>{t("campaignAdmin.media.bannerHelp")}</span>
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
                      <span>{t("campaignAdmin.media.bannerPreview")}</span>
                    )}
                  </div>
                <Field label={t("campaignAdmin.fields.cropZoom")}>
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
                <Field label={t("campaignAdmin.fields.imageFocus")}>
                    <select
                      value={campaignDraft.heroImagePosition}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, heroImagePosition: e.target.value })
                      }
                    >
                      <option value="center center">{t("campaignAdmin.options.center")}</option>
                      <option value="center top">{t("campaignAdmin.options.top")}</option>
                      <option value="center bottom">{t("campaignAdmin.options.bottom")}</option>
                      <option value="left center">{t("campaignAdmin.options.left")}</option>
                      <option value="right center">{t("campaignAdmin.options.right")}</option>
                    </select>
                  </Field>
                <Field label={t("campaignAdmin.fields.videoUrl")}>
                    <input
                    placeholder={t("campaignAdmin.placeholders.videoUrl")}
                      value={campaignDraft.campaignVideoUrl}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, campaignVideoUrl: e.target.value })
                      }
                    />
                  </Field>
                </div>

                <Field label={t("campaignAdmin.fields.socialShareText")} wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.socialShareText}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, socialShareText: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.thankYouMessage")} wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.thankYouMessage}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, thankYouMessage: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("campaignAdmin.fields.updateMessage")} wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.participantUpdateMessage}
                    onChange={(e) =>
                      setCampaignDraft({ ...campaignDraft, participantUpdateMessage: e.target.value })
                    }
                  />
                </Field>

                <div className="wide required-fields">
                  <span className="label">{t("campaignAdmin.fields.requiredSignerDetails")}</span>
                  <span className="helper-text">
                    Select the signer details that must be required. Unselected fields remain optional on the public form.
                  </span>
                  {requiredSignerFieldOptions.map((field) => (
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
                      {signerFieldLabel(field, campaignDraft)}
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
                    <span className="eyebrow">{t("campaignAdmin.media.manager")}</span>
                    <h4>{t("campaignAdmin.media.managerSubtitle")}</h4>
                    <p className="helper-text">
                      Recommended banner size is 1600 x 900 px. Keep faces, roads, signs, or petition
                      text near the selected focus point so mobile crops stay useful.
                    </p>
                    <label className="drop-zone compact-drop">
                      <ImageIcon size={28} />
                      <strong>{t("campaignAdmin.media.uploadBannerImage")}</strong>
                      <span>{t("campaignAdmin.media.storageHelp")}</span>
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
                      <span>{t("campaignAdmin.media.desktopPreview")}</span>
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
                      <span>{t("campaignAdmin.media.mobilePreview")}</span>
                    </div>
                  </div>
                <Field label={t("campaignAdmin.fields.cropZoom")}>
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
                <Field label={t("campaignAdmin.fields.focusPoint")}>
                    <select
                      value={campaignDraft.heroImagePosition}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, heroImagePosition: e.target.value })
                      }
                    >
                      <option value="center center">{t("campaignAdmin.options.center")}</option>
                      <option value="center top">{t("campaignAdmin.options.top")}</option>
                      <option value="center bottom">{t("campaignAdmin.options.bottom")}</option>
                      <option value="left center">{t("campaignAdmin.options.left")}</option>
                      <option value="right center">{t("campaignAdmin.options.right")}</option>
                    </select>
                  </Field>
                <Field label={t("campaignAdmin.fields.videoUrl")}>
                    <input
                    placeholder={t("campaignAdmin.placeholders.videoUrl")}
                      value={campaignDraft.campaignVideoUrl}
                      onChange={(e) =>
                        setCampaignDraft({ ...campaignDraft, campaignVideoUrl: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            )}

            {activeStep === 6 && campaignDraft && (
              <div className="campaign-wizard-step">
                <GrowthConfigurationStudio campaign={campaignDraft} onChange={setCampaignDraft} />
              </div>
            )}

            {activeStep === 7 && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide campaign-review-panel">
                  <div>
                    <span className="eyebrow">{t("campaignAdmin.publish.readiness")}</span>
                    <strong>{campaignQuality?.score ?? 0} / 100</strong>
                    <p className="helper-text">
                      {t("campaignAdmin.quality.visualOnly")}
                    </p>
                  </div>
                  <div className="campaign-readiness-list">
                    {campaignQuality?.checks.map((item) => (
                      <div className={item.ready ? "ready" : ""} key={item.label}>
                        <CheckCircle2 size={18} />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.ready ? t("campaignAdmin.quality.looksReady") : item.suggestion}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {(campaignQuality?.suggestions.length ?? 0) > 0 && (
                  <div className="wide quality-suggestions">
                    <span className="eyebrow">{t("campaignAdmin.publish.suggestions")}</span>
                    {campaignQuality?.suggestions.map((suggestion) => (
                      <p key={suggestion}>{suggestion}</p>
                    ))}
                  </div>
                )}

                <div className="wide campaign-review-summary">
                  <div>
                    <span className="label">{t("campaignAdmin.publish.campaign")}</span>
                    <strong>{campaignDraft.title || t("campaignAdmin.selector.untitled")}</strong>
                    <small>{campaignDraft.slug ? `/${campaignDraft.slug}` : t("campaignAdmin.quality.noSlugYet")}</small>
                  </div>
                  <div>
                    <span className="label">{t("campaignAdmin.fields.status")}</span>
                    <strong>{campaignDraft.status}</strong>
                    <small>{getCampaignGoalValue(campaignDraft).toLocaleString()} {t("campaignAdmin.fields.targetSignatures")}</small>
                  </div>
                  <div>
                    <span className="label">{t("campaignAdmin.fields.authority")}</span>
                    <strong>{selectedAuthority || t("campaignAdmin.quality.defaultAuthorityLabel")}</strong>
                    <small>{campaignDraft.authorityTargetLevel ?? "district"} level routing</small>
                  </div>
                  <div>
                    <span className="label">{t("campaignAdmin.links.publicUrl")}</span>
                    <strong>{hasDraftSlug ? publicCampaignUrl : t("campaignAdmin.links.addSlug")}</strong>
                    <small>{campaignDraft.startDate || t("campaignAdmin.quality.noStartDate")} {t("campaignAdmin.quality.to")} {campaignDraft.endDate || t("campaignAdmin.quality.noEndDate")}</small>
                  </div>

                  <div className="authority-2-grid">
                    <div className="authority-2-card">
                      <span className="eyebrow">{t("campaignAdmin.authority.escalationChain")}</span>
                      <div className="hierarchy-chain">
                        {authorityEscalationChain.map((level) => <span key={level}>{level}</span>)}
                      </div>
                      <small>
                        {isGlobalMode
                          ? "Governance path: Local -> City -> State/Province -> National -> Global"
                          : "Government hierarchy: Ward -> Panchayat -> Block -> District -> State -> National"}
                      </small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">{t("campaignAdmin.authority.politicalHierarchy")}</span>
                      <div className="hierarchy-chain">
                        {politicalHierarchy.map((level) => <span key={level}>{level}</span>)}
                      </div>
                      <small>{t("campaignAdmin.authority.hierarchyHelp")}</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">{t("campaignAdmin.authority.departmentMapping")}</span>
                      <strong>{departmentMapping}</strong>
                      <small>{t("campaignAdmin.authority.departmentHelp")}</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">{t("campaignAdmin.authority.confidence")}</span>
                      <strong>{authorityConfidenceScore}%</strong>
                      <small>{t("campaignAdmin.authority.confidenceHelp")}</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">{t("campaignAdmin.authority.csvValidationPreview")}</span>
                      <strong>{authorityCsvFile ? authorityCsvFile.name : t("campaignAdmin.quality.noCsv")}</strong>
                      <small>{csvUploadMessage || t("campaignAdmin.quality.uploadPreview")}</small>
                    </div>
                    <div className="authority-2-card">
                      <span className="eyebrow">{t("campaignAdmin.authority.duplicateDetection")}</span>
                      <strong>{duplicateAuthorityKeys.length.toLocaleString()} {t("campaignAdmin.quality.possibleDuplicates")}</strong>
                      <small>{t("campaignAdmin.authority.duplicateDetectionHelp")}</small>
                    </div>
                    <div className="authority-2-card selected-authority-package">
                      <span className="eyebrow">{t("campaignAdmin.authority.selectedPackage")}</span>
                      <strong>{selectedAuthority || t("campaignAdmin.quality.noPrimaryAuthority")}</strong>
                      <small>{t("campaignAdmin.authority.selectedPackageHelp")}</small>
                    </div>
                  </div>
                </div>

                <div className="wide campaign-version-history">
                  <div className="version-history-header">
                    <History size={20} />
                    <div>
                      <span className="eyebrow">{t("campaignAdmin.publish.versionHistory")}</span>
                      <h4>{t("campaignAdmin.publish.recentChanges")}</h4>
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
                      {t("campaignAdmin.publish.historyHelp")}
                    </p>
                  )}
                  {campaignDraft.archivedAt && (
                    <p className="info-message">{t("campaignAdmin.status.archivedOn")} {new Date(campaignDraft.archivedAt).toLocaleString()}.</p>
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

                  <div className="wide publish-preview">
                    <div>
                      <span className="eyebrow">{t("campaignAdmin.publish.ready")}</span>
                      <h4>{campaignDraft.title || "Untitled campaign"}</h4>
                      <p>{campaignDraft.description || "Add a campaign summary before publishing."}</p>
                      <strong>{readyCount} of {readinessItems.length} publish readiness checks look ready</strong>
                    </div>
                    <div className="publish-url-card">
                      <span className="label">{t("campaignAdmin.publish.urlPreview")}</span>
                      <strong>{hasDraftSlug ? publicCampaignUrl : "Add a campaign slug to generate links."}</strong>
                      <small>{campaignDraft.status} · {getCampaignGoalValue(campaignDraft).toLocaleString()} target signatures</small>
                    </div>
                    <div className="qr-preview-card">
                      <QrCodeGraphic
                        value={hasDraftSlug ? publicCampaignUrl : ""}
                        label={t("campaignAdmin.links.publicQr")}
                      />
                      <span>{campaignDraft.qrLabel || campaignDraft.title || "Campaign QR"}</span>
                    </div>
                  </div>
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

            <div className="campaign-wizard-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={activeStep === 0}
                onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
              >
                <ChevronLeft size={18} /> {t("campaignAdmin.actions.previous")}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={activeStep === wizardSteps.length - 1}
                onClick={() => setActiveStep((step) => Math.min(wizardSteps.length - 1, step + 1))}
              >
                {t("campaignAdmin.actions.next")} <ChevronRight size={18} />
              </button>
              <button className="primary-button" type="submit">
                <Save size={18} /> {t(campaignFormMode === "create" ? "campaignAdmin.studio.createNew" : "campaignAdmin.actions.update")}
              </button>
              {campaignFormMode === "create" && (
                <button className="secondary-button" type="button" onClick={onPublishCampaign}>
                  <Rocket size={18} /> {t("campaignAdmin.actions.publishCurrent")}
                </button>
              )}
            </div>
          </form>
        ) : (
          <NoCampaignPanel
            title={t("campaignAdmin.empty.title")}
            description={t("campaignAdmin.empty.description")}
          />
        )}
      </Panel>

      <Panel title={t("campaignAdmin.authority.rules")} icon={<Landmark />}>
        <button className="secondary-button" type="button" onClick={onAddAuthorityRule}>
          <Plus size={18} /> {t("campaignAdmin.authority.addRule")}
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
