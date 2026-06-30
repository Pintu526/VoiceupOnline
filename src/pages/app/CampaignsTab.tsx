import type { FormEvent } from "react";
import {
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
import { getCampaignBaseUrl, getCampaignGoalValue, hasSaasLocks, signerFieldLabel } from "../../utils/campaign";

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
  onAddAdminLocationOption: (values: LocationWithPin) => void;
  onRemoveAdminLocationOption: (values: LocationWithPin, level: LocationDeletionLevel) => void;
  onUploadLocationCsv: (file: File) => void;
  onUploadAuthorityCsv: (file: File) => void;
  onUpdateCampaignMedia: (file: File) => void;
  onUpdateCampaignDonationQr: (file: File) => void;
}

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
  return (
    <section className="page-stack">
      <Panel title="Campaign configuration" icon={<Settings />}>
        {campaignDraft ? (
          <form className="form-grid" onSubmit={onSaveCampaign}>
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

            <IndiaLocationFields
              idPrefix="campaign-location"
              values={campaignDraft}
              onChange={(values) => setCampaignDraft({ ...campaignDraft, ...values })}
              locationOverrides={locationOverrides}
              locationDeletions={locationDeletions}
              allowInlineAdd
              onAddLocation={onAddAdminLocationOption}
              onRemoveLocation={onRemoveAdminLocationOption}
            />

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
                {getAuthorityOptionsForCampaign(campaignDraft, authorities).map((authority) => (
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
              <input
                value={formatAuthorityDisplay(getAppealAuthority(campaignDraft, authorities))}
                readOnly
              />
            </Field>

            {/* Donation editor */}
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

            {/* CSV upload tools */}
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

            <Field label="Consent text" wide>
              <textarea
                rows={3}
                value={campaignDraft.consentText}
                onChange={(e) =>
                  setCampaignDraft({ ...campaignDraft, consentText: e.target.value })
                }
              />
            </Field>

            {/* SaaS admin controls — only visible in main app, not campaign admin route */}
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

            {/* Media editor */}
            <div className="wide media-editor">
              <div>
                <span className="label">Campaign banner image</span>
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
                {!campaignDraft.heroImage && <span>Banner preview</span>}
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

            {/* Required signer fields */}
            <div className="wide required-fields">
              <span className="label">Required signer details</span>
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
                    checked={campaignDraft.requiredFields.includes(field)}
                    disabled={isCampaignAdminRoute && campaignDraft.requiredFieldsLockedBySaas}
                    onChange={(e) => {
                      const requiredFields = e.target.checked
                        ? [...campaignDraft.requiredFields, field]
                        : campaignDraft.requiredFields.filter((f) => f !== field);
                      setCampaignDraft({ ...campaignDraft, requiredFields });
                    }}
                  />
                  {signerFieldLabel(field)}
                </label>
              ))}
            </div>

            <div className="button-row wide">
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
