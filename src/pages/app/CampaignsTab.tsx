import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Landmark,
  Plus,
  Rocket,
  Save,
  Settings
} from "lucide-react";
import type {
  AuthorityRule,
  AuthoritySelectionMode,
  AuthorityTargetLevel,
  Campaign,
  CampaignCategory,
  LocationGovernanceLevel,
  Organization
} from "../../types";
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
import {
  formatAuthorityDisplay,
  getAppealAuthority,
  getAuthorityOptionsForCampaign
} from "../../utils/authority";
import {
  getCampaignBaseUrl,
  getCampaignGoalValue,
  getConfiguredLocationLockLevel,
  getLocationGovernance,
  getLocationLevelLabel,
  getLockedLocationValues,
  getSignerLocationRestrictionLevel,
  hasSaasLocks,
  signerFieldLabel
} from "../../utils/campaign";

interface CampaignsTabProps {
  campaignDraft: Campaign | null;
  setCampaignDraft: React.Dispatch<React.SetStateAction<Campaign | null>>;
  authorities: AuthorityRule[];
  setAuthorities: React.Dispatch<React.SetStateAction<AuthorityRule[]>>;
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
    title: "Campaign basics",
    helper: "Set the campaign identity, public links, dates, target, and admin access."
  },
  {
    title: "Location and authority routing",
    helper: "Choose the geography, upload routing masters, and confirm the appeal authority."
  },
  {
    title: "Public page content",
    helper: "Prepare supporter-facing copy, media, donation settings, and signer requirements."
  },
  {
    title: "Review and publish readiness",
    helper: "Check the key settings before saving or publishing the campaign."
  }
];

export function CampaignsTab({
  campaignDraft,
  setCampaignDraft,
  authorities,
  setAuthorities,
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
  onAddAuthorityRule,
  onAddAdminLocationOption,
  onRemoveAdminLocationOption,
  onUploadLocationCsv,
  onUploadAuthorityCsv,
  onUpdateCampaignMedia,
  onUpdateCampaignDonationQr
}: CampaignsTabProps) {
  const [activeStep, setActiveStep] = useState(0);
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
              <span className="eyebrow">Step {activeStep + 1} of {wizardSteps.length}</span>
              <h3>{wizardSteps[activeStep].title}</h3>
              <p>{wizardSteps[activeStep].helper}</p>
              <div className="progress">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>

            {activeStep === 0 && (
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
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, slug: e.target.value })}
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
                    value={campaignDraft.shareUrl}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, shareUrl: e.target.value })}
                  />
                </Field>
                <Field label="Campaign admin URL">
                  <input
                    value={
                      campaignDraft.adminUrl ??
                      `${getCampaignBaseUrl(organization)}/admin/${campaignDraft.slug}`
                    }
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, adminUrl: e.target.value })}
                  />
                </Field>
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

            {activeStep === 1 && effectiveCampaignDraft && (
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

            {activeStep === 2 && (
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

            {activeStep === 3 && (
              <div className="form-grid campaign-wizard-step">
                <div className="wide campaign-review-panel">
                  <div>
                    <span className="eyebrow">Publish readiness</span>
                    <strong>{readyCount} of {readinessItems.length} checks look ready</strong>
                    <p className="helper-text">
                      These are visual readiness checks only. Save and publish still use the existing handlers.
                    </p>
                  </div>
                  <div className="campaign-readiness-list">
                    {readinessItems.map((item) => (
                      <div className={item.ready ? "ready" : ""} key={item.label}>
                        <CheckCircle2 size={18} />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

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
                    <strong>{campaignDraft.shareUrl || `${getCampaignBaseUrl(organization)}/${campaignDraft.slug}`}</strong>
                    <small>{campaignDraft.startDate || "No start date"} to {campaignDraft.endDate || "No end date"}</small>
                  </div>
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
                <Save size={18} /> Save campaign
              </button>
              <button className="secondary-button" type="button" onClick={onPublishCampaign}>
                <Rocket size={18} /> Publish campaign
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
