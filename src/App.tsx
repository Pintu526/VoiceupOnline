import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileScan,
  FileText,
  Globe2,
  Landmark,
  Megaphone,
  Plus,
  QrCode,
  Rocket,
  Save,
  SearchCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  MessageCircle,
  Share2,
  Image as ImageIcon,
  MapPin as MapPinIcon,
  WalletCards
} from "lucide-react";
import Tesseract from "tesseract.js";
import {
  initialAuthorities,
  initialCampaigns,
  initialOrganization,
  initialSigners,
  subscriptionPlans,
  suggestedFeatures
} from "./data";
import {
  createId,
  createScanReviewItem,
  detectDuplicate,
  exportCsv,
  exportPdf,
  getCampaignMetrics,
  getCampaignSigners,
  groupSignersByLocation,
  groupSignersByDay,
  groupSignersByWeek,
  makePublicSigner,
  matchAuthority
} from "./lib";
import {
  addLocationOverride,
  findLocationByPin,
  findPinCode,
  flattenLocationOverrides,
  getBlockOptions,
  getDistrictOptions,
  getPinOptions,
  getPanchayatOptions,
  indianStatesAndUnionTerritories,
  type LocationOverrides,
  type LocationWithPin
} from "./geography";
import type { AuthorityRule, BillingPlan, Campaign, CampaignCategory, Organization, ScanReviewItem, Signer } from "./types";

type Tab = "dashboard" | "campaigns" | "public" | "scans" | "reports" | "engagement" | "saas" | "ideas";

const categories: CampaignCategory[] = ["Civic", "Environment", "Education", "Health", "Transport", "Housing", "Other"];
const storagePrefix = "voiceup-world-class-campaigns-v4";
const emptyMetrics = {
  total: 0,
  verified: 0,
  pending: 0,
  duplicates: 0,
  online: 0,
  scanned: 0,
  progress: 0
};

const blankSigner = {
  name: "",
  email: "",
  phone: "",
  state: "",
  district: "",
  block: "",
  panchayat: "",
  address: "",
  postalCode: "",
  comment: ""
};

function App() {
  const [campaigns, setCampaigns] = usePersistentState<Campaign[]>(`${storagePrefix}-campaigns`, initialCampaigns);
  const [signers, setSigners] = usePersistentState<Signer[]>(`${storagePrefix}-signers`, initialSigners);
  const [authorities, setAuthorities] = usePersistentState<AuthorityRule[]>(`${storagePrefix}-authorities`, initialAuthorities);
  const [organization, setOrganization] = usePersistentState<Organization>(`${storagePrefix}-organization`, initialOrganization);
  const [scanItems, setScanItems] = usePersistentState<ScanReviewItem[]>(`${storagePrefix}-scan-items`, []);
  const [locationOverrides, setLocationOverrides] = usePersistentState<LocationOverrides>(
    `${storagePrefix}-location-overrides`,
    {}
  );
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [activeCampaignId, setActiveCampaignId] = useState(initialCampaigns[0]?.id ?? "");
  const [campaignDraft, setCampaignDraft] = useState<Campaign | null>(campaigns[0] ?? null);
  const [publicForm, setPublicForm] = useState(blankSigner);
  const [publicMessage, setPublicMessage] = useState("");
  const [lastSignedSigner, setLastSignedSigner] = useState<Signer | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState("");
  const [locationManagerForm, setLocationManagerForm] = useState<LocationWithPin>({
    state: "",
    district: "",
    block: "",
    panchayat: "",
    postalCode: ""
  });
  const [scanText, setScanText] = useState(blankScanTemplate);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  const activeCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === activeCampaignId) ?? campaigns[0],
    [activeCampaignId, campaigns]
  );
  const campaignSigners = useMemo(
    () => (activeCampaign ? getCampaignSigners(activeCampaign.id, signers) : []),
    [activeCampaign, signers]
  );
  const metrics = useMemo(
    () => (activeCampaign ? getCampaignMetrics(activeCampaign, signers) : emptyMetrics),
    [activeCampaign, signers]
  );
  const authorityMatch = useMemo(
    () => (activeCampaign ? matchAuthority(activeCampaign, authorities) : undefined),
    [activeCampaign, authorities]
  );
  const dailyTotals = useMemo(() => groupSignersByDay(campaignSigners), [campaignSigners]);
  const weeklyTotals = useMemo(() => groupSignersByWeek(campaignSigners), [campaignSigners]);
  const stateTotals = useMemo(() => groupSignersByLocation(campaignSigners, "state"), [campaignSigners]);
  const districtTotals = useMemo(() => groupSignersByLocation(campaignSigners, "district"), [campaignSigners]);
  const blockTotals = useMemo(() => groupSignersByLocation(campaignSigners, "block"), [campaignSigners]);
  const panchayatTotals = useMemo(() => groupSignersByLocation(campaignSigners, "panchayat"), [campaignSigners]);
  const customLocationRows = useMemo(() => flattenLocationOverrides(locationOverrides), [locationOverrides]);

  useEffect(() => {
    if (!campaigns.some((campaign) => campaign.id === activeCampaignId)) {
      setActiveCampaignId(campaigns[0]?.id ?? "");
    }
  }, [activeCampaignId, campaigns]);

  useEffect(() => {
    setCampaignDraft(activeCampaign ?? null);
  }, [activeCampaign]);

  useEffect(() => {
    const slugFromPath = window.location.pathname.match(/^\/c\/([^/]+)/)?.[1];
    if (!slugFromPath) return;
    const campaignFromPath = campaigns.find((campaign) => campaign.slug === slugFromPath);
    if (campaignFromPath) {
      setActiveCampaignId(campaignFromPath.id);
      setActiveTab("public");
    }
  }, [campaigns]);

  function saveCampaign(event: FormEvent) {
    event.preventDefault();
    if (!campaignDraft) return;
    setCampaigns((currentCampaigns) =>
      currentCampaigns.map((campaign) => (campaign.id === campaignDraft.id ? campaignDraft : campaign))
    );
  }

  function createCampaign() {
    const campaign: Campaign = {
      id: createId("cmp"),
      title: "New Public Campaign",
      slug: `new-campaign-${Date.now()}`,
      category: "Civic",
      description: "Describe the public issue, requested action, and why citizens should support it.",
      state: "",
      district: "",
      block: "",
      panchayat: "",
      location: "City / District / Ward",
      postalCode: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      goal: 1000,
      status: "Draft",
      consentText:
        "I consent to this organization storing my details and using them only for this campaign submission in India.",
      requiredFields: ["name", "email", "phone", "state", "district", "block", "panchayat", "address", "postalCode"],
      shareUrl: `${getCampaignBaseUrl(organization)}/c/new-campaign`,
      qrLabel: "VOICEUP-INDIA-CAMPAIGN",
      heroImage: "",
      heroImagePosition: "center center",
      heroImageZoom: 120,
      campaignVideoUrl: "",
      socialShareText: "Join this public campaign and add your voice.",
      thankYouMessage:
        "Thank you for signing {{campaign}}. Your voice has been recorded. Track campaign progress here: {{url}}",
      participantUpdateMessage:
        "{{campaign}} update: {{verified}} verified supporters have joined so far. Share this campaign: {{url}}"
    };
    setCampaigns((currentCampaigns) => [...currentCampaigns, campaign]);
    setActiveCampaignId(campaign.id);
    setCampaignDraft(campaign);
    setActiveTab("campaigns");
  }

  function publishCampaign() {
    if (!campaignDraft) return;
    const publishedCampaign = {
      ...campaignDraft,
      status: "Published" as const,
      shareUrl: `${getCampaignBaseUrl(organization)}/c/${campaignDraft.slug}`
    };
    setCampaignDraft(publishedCampaign);
    setCampaigns((currentCampaigns) =>
      currentCampaigns.map((campaign) => (campaign.id === publishedCampaign.id ? publishedCampaign : campaign))
    );
  }

  function submitPublicSignature(event: FormEvent) {
    event.preventDefault();
    if (!activeCampaign) {
      setPublicMessage("Create and publish a campaign before collecting signatures.");
      return;
    }
    if (!publicForm.name || !publicForm.phone) {
      setPublicMessage("Name and phone are required to sign this campaign.");
      return;
    }
    const missingRequiredField = activeCampaign.requiredFields.find((field) => !publicForm[field]?.trim());
    if (missingRequiredField) {
      setPublicMessage(`${signerFieldLabel(missingRequiredField)} is required to sign this campaign.`);
      return;
    }
    const signer = makePublicSigner(activeCampaign.id, publicForm, campaignSigners);
    setSigners((currentSigners) => [signer, ...currentSigners]);
    setPublicForm(blankSigner);
    setLastSignedSigner(signer);
    setPublicMessage(
      signer.status === "duplicate"
        ? "Thanks. This looks like a duplicate, so it was sent to review."
        : "Thank you. Your signature has been recorded."
    );
  }

  async function uploadScan(file: File) {
    if (!activeCampaign) {
      setScanMessage("Create a campaign before uploading scanned signatures.");
      return;
    }
    setIsScanning(true);
    setScanMessage(`Reading ${file.name} with OCR. Handwriting may need manual correction.`);
    try {
      const result = await Tesseract.recognize(file, "eng");
      const extractedText = result.data.text.trim() || scanText;
      const item = createScanReviewItem(activeCampaign.id, file.name, extractedText);
      setScanItems((currentItems) => [item, ...currentItems]);
      setScanText(extractedText);
      setScanMessage("OCR completed. Review the extracted signer details before approval.");
    } catch (error) {
      const item = createScanReviewItem(activeCampaign.id, file.name, scanText);
      setScanItems((currentItems) => [item, ...currentItems]);
      setScanMessage("OCR could not read the file, so a manual review item was created from the text box.");
    } finally {
      setIsScanning(false);
    }
  }

  function createManualScanItem() {
    if (!activeCampaign) {
      setScanMessage("Create a campaign before adding scanned signatures.");
      return;
    }
    const item = createScanReviewItem(activeCampaign.id, "manual-scan-entry.txt", scanText);
    setScanItems((currentItems) => [item, ...currentItems]);
    setScanMessage("Manual scan review item created.");
  }

  function updateScanParsedSigner(scanId: string, field: keyof ScanReviewItem["parsedSigner"], value: string) {
    setScanItems((currentItems) =>
      currentItems.map((item) =>
        item.id === scanId ? { ...item, parsedSigner: { ...item.parsedSigner, [field]: value } } : item
      )
    );
  }

  function approveScan(scan: ScanReviewItem) {
    if (!activeCampaign) return;
    const duplicate = detectDuplicate(scan.parsedSigner, campaignSigners);
    const signer: Signer = {
      id: createId("sig"),
      campaignId: activeCampaign.id,
      ...scan.parsedSigner,
      source: "scan",
      status: duplicate ? "duplicate" : "pending",
      signedAt: new Date().toISOString(),
      scanFileName: scan.fileName,
      reviewerNote: duplicate ? `Possible duplicate of ${duplicate.name}` : "Imported from scanned hard copy."
    };
    setSigners((currentSigners) => [signer, ...currentSigners]);
    setScanItems((currentItems) =>
      currentItems.map((item) => (item.id === scan.id ? { ...item, status: "Approved" } : item))
    );
  }

  function updateSignerStatus(signerId: string, status: Signer["status"]) {
    setSigners((currentSigners) =>
      currentSigners.map((signer) => (signer.id === signerId ? { ...signer, status } : signer))
    );
  }

  function addAuthorityRule() {
    if (!activeCampaign) {
      setActiveTab("campaigns");
      return;
    }
    const rule: AuthorityRule = {
      id: createId("auth"),
      name: "New Authority",
      department: "Department name",
      category: activeCampaign.category,
      locationKeyword: activeCampaign.location.split(" ")[0] ?? "",
      postalPrefix: activeCampaign.postalCode.slice(0, 3),
      email: "authority@example.gov",
      submissionMethod: "Email",
      confidence: 70
    };
    setAuthorities((currentAuthorities) => [rule, ...currentAuthorities]);
  }

  function addAdminLocationOption(event: FormEvent) {
    event.preventDefault();
    setLocationOverrides((currentOverrides) => addLocationOverride(currentOverrides, locationManagerForm));
    setLocationManagerForm({ state: locationManagerForm.state, district: "", block: "", panchayat: "", postalCode: "" });
  }

  function selectSubscriptionPlan(planName: BillingPlan) {
    const plan = subscriptionPlans.find((candidate) => candidate.name === planName);
    if (!plan) return;
    setOrganization((currentOrganization) => ({
      ...currentOrganization,
      plan: plan.name,
      monthlySignatureLimit: plan.monthlySignatureLimit,
      monthlyScanLimit: plan.monthlyScanLimit,
      subscriptionStatus: currentOrganization.subscriptionStatus === "Cancelled" ? "Trial" : currentOrganization.subscriptionStatus,
      customBranding: plan.name !== "Starter" ? currentOrganization.customBranding : false
    }));
  }

  function updateCampaignMedia(file: File) {
    if (!campaignDraft) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCampaignDraft({ ...campaignDraft, heroImage: String(reader.result ?? "") });
    };
    reader.readAsDataURL(file);
  }

  function campaignReportMessage(campaign: Campaign) {
    return renderCampaignMessage(campaign.participantUpdateMessage, campaign, metrics);
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedMessage("Copied message to clipboard.");
    window.setTimeout(() => setCopiedMessage(""), 2500);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>Indian Campaign SaaS</span>
          </div>
        </div>
        <nav className="nav">
          <NavButton icon={<BarChart3 />} label="Dashboard" tab="dashboard" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Megaphone />} label="Campaign admin" tab="campaigns" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Globe2 />} label="Public signing" tab="public" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FileScan />} label="Scan hard copies" tab="scans" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FileText />} label="Reports" tab="reports" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<MessageCircle />} label="Engagement" tab="engagement" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<WalletCards />} label="SaaS admin" tab="saas" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Sparkles />} label="Feature ideas" tab="ideas" activeTab={activeTab} onClick={setActiveTab} />
        </nav>
        <div className="sidebar-card">
          <span className="eyebrow">Current plan</span>
          <strong>{organization.plan}</strong>
          <small>{organization.monthlySignatureLimit.toLocaleString()} signatures/month</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">Selected campaign</span>
            <select
              value={activeCampaignId}
              onChange={(event) => setActiveCampaignId(event.target.value)}
              disabled={campaigns.length === 0}
            >
              {campaigns.length === 0 ? (
                <option>No campaign yet</option>
              ) : (
                campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.title}
                  </option>
                ))
              )}
            </select>
          </div>
          <button className="secondary-button" type="button" onClick={createCampaign}>
            <Plus size={18} /> New campaign
          </button>
        </header>

        {activeTab === "dashboard" && (
          <section className="page-stack">
            {activeCampaign ? (
              <>
                <Hero campaign={activeCampaign} metrics={metrics} authority={authorityMatch?.authority} />
                <div className="metric-grid">
                  <MetricCard icon={<Users />} label="Total signers" value={metrics.total} detail={`${metrics.verified} verified`} />
                  <MetricCard icon={<Globe2 />} label="Online signatures" value={metrics.online} detail="Collected from public page" />
                  <MetricCard icon={<FileScan />} label="Scanned records" value={metrics.scanned} detail={`${metrics.pending} awaiting review`} />
                  <MetricCard icon={<SearchCheck />} label="Duplicates" value={metrics.duplicates} detail="Flagged automatically" />
                </div>
              </>
            ) : (
              <EmptyWorkspace
                organization={organization}
                onCreateCampaign={createCampaign}
                onOpenSubscription={() => setActiveTab("saas")}
              />
            )}

            <div className="two-column">
              <Panel title="Daily campaign status" icon={<CalendarDays />}>
                <BarList data={dailyTotals} emptyLabel="No signer activity yet." />
              </Panel>
              <Panel title="Authority routing" icon={<Landmark />}>
                {authorityMatch ? (
                  <div className="authority-card">
                    <strong>{authorityMatch.authority.name}</strong>
                    <span>{authorityMatch.authority.department}</span>
                    <span>{authorityMatch.authority.email}</span>
                    <div className="progress">
                      <div style={{ width: `${authorityMatch.score}%` }} />
                    </div>
                    <small>{authorityMatch.score}% routing confidence by category, location, and PIN code.</small>
                  </div>
                ) : (
                  <p>No matching authority rule has been configured.</p>
                )}
              </Panel>
            </div>
          </section>
        )}

        {activeTab === "campaigns" && (
          <section className="page-stack">
            <Panel title="Campaign configuration" icon={<Settings />}>
              {campaignDraft ? (
                <form className="form-grid" onSubmit={saveCampaign}>
                <Field label="Campaign name">
                  <input
                    value={campaignDraft.title}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, title: event.target.value })}
                  />
                </Field>
                  <Field label="Public slug">
                  <input
                    value={campaignDraft.slug}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, slug: event.target.value })}
                  />
                </Field>
                  <Field label="Category">
                  <select
                    value={campaignDraft.category}
                    onChange={(event) =>
                      setCampaignDraft({ ...campaignDraft, category: event.target.value as CampaignCategory })
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
                    onChange={(event) =>
                      setCampaignDraft({ ...campaignDraft, status: event.target.value as Campaign["status"] })
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
                    value={campaignDraft.goal}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, goal: Number(event.target.value) })}
                  />
                </Field>
                  <Field label="Location">
                  <input
                    value={campaignDraft.location}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, location: event.target.value })}
                  />
                </Field>
                  <IndiaLocationFields
                    idPrefix="campaign-location"
                    values={campaignDraft}
                    onChange={(values) => setCampaignDraft({ ...campaignDraft, ...values })}
                    locationOverrides={locationOverrides}
                  />
                  <Field label="Start date">
                  <input
                    type="date"
                    value={campaignDraft.startDate}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, startDate: event.target.value })}
                  />
                </Field>
                  <Field label="End date">
                  <input
                    type="date"
                    value={campaignDraft.endDate}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, endDate: event.target.value })}
                  />
                </Field>
                  <Field label="Public share URL">
                  <input
                    value={campaignDraft.shareUrl}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, shareUrl: event.target.value })}
                  />
                </Field>
                  <Field label="QR / WhatsApp campaign label">
                  <input
                    value={campaignDraft.qrLabel}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, qrLabel: event.target.value })}
                  />
                </Field>
                  <Field label="Campaign description" wide>
                  <textarea
                    rows={5}
                    value={campaignDraft.description}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, description: event.target.value })}
                  />
                </Field>
                  <Field label="Consent text" wide>
                  <textarea
                    rows={3}
                    value={campaignDraft.consentText}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, consentText: event.target.value })}
                  />
                </Field>
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
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) updateCampaignMedia(file);
                          }}
                        />
                      </label>
                    </div>
                    <div
                      className="media-preview"
                      style={{
                        backgroundImage: campaignDraft.heroImage ? `url(${campaignDraft.heroImage})` : undefined,
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
                        onChange={(event) =>
                          setCampaignDraft({ ...campaignDraft, heroImageZoom: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Image focus">
                      <select
                        value={campaignDraft.heroImagePosition}
                        onChange={(event) =>
                          setCampaignDraft({ ...campaignDraft, heroImagePosition: event.target.value })
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
                        onChange={(event) => setCampaignDraft({ ...campaignDraft, campaignVideoUrl: event.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Social share text" wide>
                    <textarea
                      rows={3}
                      value={campaignDraft.socialShareText}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, socialShareText: event.target.value })}
                    />
                  </Field>
                  <Field label="Thank-you WhatsApp/SMS message" wide>
                    <textarea
                      rows={3}
                      value={campaignDraft.thankYouMessage}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, thankYouMessage: event.target.value })}
                    />
                  </Field>
                  <Field label="Participant update message" wide>
                    <textarea
                      rows={3}
                      value={campaignDraft.participantUpdateMessage}
                      onChange={(event) => setCampaignDraft({ ...campaignDraft, participantUpdateMessage: event.target.value })}
                    />
                  </Field>
                  <div className="wide required-fields">
                  <span className="label">Required signer details</span>
                  {([
                    "name",
                    "email",
                    "phone",
                    "state",
                    "district",
                    "block",
                    "panchayat",
                    "address",
                    "postalCode"
                  ] as Campaign["requiredFields"]).map((field) => (
                    <label key={field} className="check-row">
                      <input
                        type="checkbox"
                        checked={campaignDraft.requiredFields.includes(field)}
                        onChange={(event) => {
                          const requiredFields = event.target.checked
                            ? [...campaignDraft.requiredFields, field]
                            : campaignDraft.requiredFields.filter((requiredField) => requiredField !== field);
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
                  <button className="secondary-button" type="button" onClick={publishCampaign}>
                    <Rocket size={18} /> Publish campaign
                  </button>
                </div>
                </form>
              ) : (
                <NoCampaignPanel
                  title="Create the first Indian campaign"
                  description="This workspace is clean and has no sample data. Start by creating a real campaign for an NGO, RWA, association, union, or campaign agency."
                  onCreateCampaign={createCampaign}
                />
              )}
            </Panel>

            <Panel title="Manage location dropdowns" icon={<MapPinIcon />}>
              <form className="form-grid" onSubmit={addAdminLocationOption}>
                <Field label="State / Union Territory">
                  <select
                    value={locationManagerForm.state}
                    required
                    onChange={(event) =>
                      setLocationManagerForm({
                        state: event.target.value,
                        district: "",
                        block: "",
                        panchayat: "",
                        postalCode: ""
                      })
                    }
                  >
                    <option value="">Select state</option>
                    {indianStatesAndUnionTerritories.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="District to add">
                  <input
                    placeholder="Enter missing district"
                    value={locationManagerForm.district}
                    onChange={(event) => setLocationManagerForm({ ...locationManagerForm, district: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Block / Tehsil / Taluk to add">
                  <input
                    placeholder="Optional block"
                    value={locationManagerForm.block}
                    onChange={(event) => setLocationManagerForm({ ...locationManagerForm, block: event.target.value })}
                  />
                </Field>
                <Field label="Gram Panchayat / Ward to add">
                  <input
                    placeholder="Optional panchayat or ward"
                    value={locationManagerForm.panchayat}
                    onChange={(event) => setLocationManagerForm({ ...locationManagerForm, panchayat: event.target.value })}
                  />
                </Field>
                <div className="wide button-row">
                  <button className="primary-button" type="submit">
                    <Plus size={18} /> Add to dropdowns
                  </button>
                  <span className="helper-text">
                    Added values are available immediately in Campaign Admin and Public Signing forms.
                  </span>
                </div>
              </form>
              <div className="custom-location-list">
                {customLocationRows.length === 0 ? (
                  <p>No admin-added locations yet.</p>
                ) : (
                  customLocationRows.map((row) => (
                    <div className="custom-location-chip" key={`${row.state}-${row.district}-${row.block}-${row.panchayat}`}>
                      <strong>{row.district}</strong>
                      <span>{[row.panchayat, row.block, row.state].filter(Boolean).join(" / ")}</span>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel title="Authority rules" icon={<Landmark />}>
              <button className="secondary-button" type="button" onClick={addAuthorityRule}>
                <Plus size={18} /> Add authority rule
              </button>
              <div className="authority-list">
                {authorities.map((authority) => (
                  <div className="authority-editor" key={authority.id}>
                    <input
                      value={authority.name}
                      onChange={(event) =>
                        setAuthorities((currentAuthorities) =>
                          currentAuthorities.map((currentAuthority) =>
                            currentAuthority.id === authority.id
                              ? { ...currentAuthority, name: event.target.value }
                              : currentAuthority
                          )
                        )
                      }
                    />
                    <input
                      value={authority.department}
                      onChange={(event) =>
                        setAuthorities((currentAuthorities) =>
                          currentAuthorities.map((currentAuthority) =>
                            currentAuthority.id === authority.id
                              ? { ...currentAuthority, department: event.target.value }
                              : currentAuthority
                          )
                        )
                      }
                    />
                    <input
                      value={authority.email}
                      onChange={(event) =>
                        setAuthorities((currentAuthorities) =>
                          currentAuthorities.map((currentAuthority) =>
                            currentAuthority.id === authority.id
                              ? { ...currentAuthority, email: event.target.value }
                              : currentAuthority
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === "public" && (
          activeCampaign ? (
            <section className="public-layout">
              <div
                className={activeCampaign.heroImage ? "campaign-page campaign-page-with-media" : "campaign-page"}
                style={{
                  backgroundImage: activeCampaign.heroImage
                    ? `linear-gradient(135deg, rgba(15, 23, 42, 0.74), rgba(15, 23, 42, 0.34)), url(${activeCampaign.heroImage})`
                    : undefined,
                  backgroundPosition: activeCampaign.heroImagePosition,
                  backgroundSize: `${activeCampaign.heroImageZoom}%`
                }}
              >
                <span className="status-pill">{activeCampaign.status}</span>
                <h1>{activeCampaign.title}</h1>
                <p>{activeCampaign.description}</p>
                <div className="public-progress">
                  <div className="progress">
                    <div style={{ width: `${metrics.progress}%` }} />
                  </div>
                  <strong>{metrics.verified.toLocaleString()}</strong> of {activeCampaign.goal.toLocaleString()} verified
                  signatures
                </div>
                <div className="qr-box">
                  <QrCode size={40} />
                  <div>
                    <strong>{activeCampaign.qrLabel}</strong>
                    <span>{activeCampaign.shareUrl}</span>
                  </div>
                </div>
                {activeCampaign.campaignVideoUrl && (
                  <a className="video-link" href={activeCampaign.campaignVideoUrl} target="_blank" rel="noreferrer">
                    Watch campaign video
                  </a>
                )}
              </div>

              <Panel title="Support this campaign" icon={<ClipboardList />}>
                <form className="form-stack" onSubmit={submitPublicSignature}>
                  <input
                    placeholder="Full name"
                    value={publicForm.name}
                    onChange={(event) => setPublicForm({ ...publicForm, name: event.target.value })}
                  />
                  <input
                    placeholder="Email"
                    type="email"
                    value={publicForm.email}
                    onChange={(event) => setPublicForm({ ...publicForm, email: event.target.value })}
                  />
                  <input
                    placeholder="Phone"
                    value={publicForm.phone}
                    onChange={(event) => setPublicForm({ ...publicForm, phone: event.target.value })}
                  />
                  <IndiaLocationFields
                    idPrefix="public-signer-location"
                    values={publicForm}
                    onChange={(values) => setPublicForm({ ...publicForm, ...values })}
                    locationOverrides={locationOverrides}
                  />
                  <input
                    placeholder="Address"
                    value={publicForm.address}
                    onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
                  />
                  <textarea
                    placeholder="Optional comment"
                    rows={3}
                    value={publicForm.comment}
                    onChange={(event) => setPublicForm({ ...publicForm, comment: event.target.value })}
                  />
                  <label className="check-row">
                    <input required type="checkbox" /> {activeCampaign.consentText}
                  </label>
                  <button className="primary-button" type="submit">
                    <CheckCircle2 size={18} /> Sign campaign
                  </button>
                  {publicMessage && <p className="success-message">{publicMessage}</p>}
                  {lastSignedSigner?.campaignId === activeCampaign.id && (
                    <div className="participant-actions">
                      <strong>Send thank-you message</strong>
                      <div className="button-row">
                        <a
                          className="secondary-link-button"
                          href={whatsAppLink(lastSignedSigner.phone, renderCampaignMessage(activeCampaign.thankYouMessage, activeCampaign, metrics))}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp
                        </a>
                        <a
                          className="secondary-link-button"
                          href={smsLink(lastSignedSigner.phone, renderCampaignMessage(activeCampaign.thankYouMessage, activeCampaign, metrics))}
                        >
                          SMS
                        </a>
                      </div>
                    </div>
                  )}
                </form>
              </Panel>
            </section>
          ) : (
            <NoCampaignPanel
              title="No public campaign yet"
              description="Create and publish a campaign before collecting signatures from the public page."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "scans" && (
          activeCampaign ? (
            <section className="page-stack">
              <Panel title="Scan hard-copy signatures" icon={<Upload />}>
                <div className="scan-grid">
                  <label className="drop-zone">
                    <FileScan size={34} />
                    <strong>Upload scanned image</strong>
                    <span>PNG, JPG, WEBP, or scanned image files work best for OCR.</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadScan(file);
                      }}
                    />
                  </label>
                  <div>
                    <span className="label">Manual OCR correction or paste</span>
                    <textarea rows={8} value={scanText} onChange={(event) => setScanText(event.target.value)} />
                    <button className="secondary-button" type="button" onClick={createManualScanItem}>
                      <Plus size={18} /> Create review item
                    </button>
                  </div>
                </div>
                {isScanning && <p className="info-message">OCR processing is running...</p>}
                {scanMessage && <p className="success-message">{scanMessage}</p>}
              </Panel>

              <Panel title="Scan review queue" icon={<SearchCheck />}>
                <div className="review-list">
                  {scanItems.filter((item) => item.campaignId === activeCampaign.id).length === 0 && (
                    <p>No scans are waiting for review.</p>
                  )}
                  {scanItems
                    .filter((item) => item.campaignId === activeCampaign.id)
                    .map((item) => (
                      <div className="review-card" key={item.id}>
                        <div>
                          <strong>{item.fileName}</strong>
                          <span className="status-pill">{item.status}</span>
                        </div>
                        <div className="form-grid compact">
                          {([
                            "name",
                            "email",
                            "phone",
                            "state",
                            "district",
                            "block",
                            "panchayat",
                            "address",
                            "postalCode",
                            "comment"
                          ] as const).map((field) => (
                          <Field key={field} label={signerFieldLabel(field)}>
                              <input
                                value={item.parsedSigner[field]}
                                onChange={(event) => updateScanParsedSigner(item.id, field, event.target.value)}
                              />
                            </Field>
                          ))}
                        </div>
                        <details>
                          <summary>Extracted text</summary>
                          <pre>{item.extractedText}</pre>
                        </details>
                        <div className="button-row">
                          <button className="primary-button" type="button" onClick={() => approveScan(item)}>
                            <CheckCircle2 size={18} /> Approve into signer list
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setScanItems((currentItems) =>
                                currentItems.map((currentItem) =>
                                  currentItem.id === item.id ? { ...currentItem, status: "Rejected" } : currentItem
                                )
                              )
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </Panel>
            </section>
          ) : (
            <NoCampaignPanel
              title="No campaign for scans"
              description="Create a campaign before importing hard-copy signatures or OCR scan batches."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "reports" && (
          activeCampaign ? (
            <section className="page-stack">
              <Panel title="Reports and exports" icon={<Download />}>
                <div className="button-row">
                  <button className="primary-button" type="button" onClick={() => exportPdf(activeCampaign, campaignSigners, authorityMatch?.authority)}>
                    <FileText size={18} /> Download PDF report
                  </button>
                  <button className="secondary-button" type="button" onClick={() => exportCsv(activeCampaign, campaignSigners)}>
                    <Download size={18} /> Download CSV
                  </button>
                </div>
                <div className="report-grid">
                  <ReportBlock title="Daily status" data={dailyTotals} />
                  <ReportBlock title="Weekly status" data={weeklyTotals} />
                  <ReportBlock title="State-wise count" data={stateTotals} />
                  <ReportBlock title="District-wise count" data={districtTotals} />
                  <ReportBlock title="Block-wise count" data={blockTotals} />
                  <ReportBlock title="Panchayat / ward count" data={panchayatTotals} />
                </div>
              </Panel>
              <Panel title="Signer register" icon={<Users />}>
                {campaignSigners.length === 0 ? (
                  <p>No signers have been collected for this campaign yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>State</th>
                          <th>District</th>
                          <th>Block</th>
                          <th>Panchayat / Ward</th>
                          <th>Source</th>
                          <th>Status</th>
                          <th>Signed at</th>
                          <th>Review</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignSigners.map((signer) => (
                          <tr key={signer.id}>
                            <td>
                              <strong>{signer.name}</strong>
                              <span>{signer.email}</span>
                            </td>
                            <td>{signer.phone}</td>
                            <td>{signer.state || "Not captured"}</td>
                            <td>{signer.district || "Not captured"}</td>
                            <td>{signer.block || "Not captured"}</td>
                            <td>{signer.panchayat || "Not captured"}</td>
                            <td>{signer.source}</td>
                            <td>
                              <select
                                value={signer.status}
                                onChange={(event) => updateSignerStatus(signer.id, event.target.value as Signer["status"])}
                              >
                                <option value="verified">verified</option>
                                <option value="pending">pending</option>
                                <option value="duplicate">duplicate</option>
                                <option value="rejected">rejected</option>
                              </select>
                            </td>
                            <td>{new Date(signer.signedAt).toLocaleString()}</td>
                            <td>{signer.reviewerNote ?? "Ready"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </section>
          ) : (
            <NoCampaignPanel
              title="Reports will appear after campaign setup"
              description="Create a campaign and collect signatures before downloading PDF or CSV reports."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "engagement" && (
          activeCampaign ? (
            <section className="page-stack">
              <Panel title="Social publishing and participant engagement" icon={<MessageCircle />}>
                <div className="engagement-grid">
                  <div className="engagement-card">
                    <Share2 size={24} />
                    <h3>Publish campaign to social networks</h3>
                    <p>Share the same campaign URL. The campaign is published as a slug under your main domain.</p>
                    <div className="button-row">
                      <a
                        className="secondary-link-button"
                        href={whatsAppLink("", `${activeCampaign.socialShareText} ${activeCampaign.shareUrl}`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp share
                      </a>
                      <a
                        className="secondary-link-button"
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(activeCampaign.shareUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Facebook
                      </a>
                      <a
                        className="secondary-link-button"
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${activeCampaign.socialShareText} ${activeCampaign.shareUrl}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        X / Twitter
                      </a>
                    </div>
                  </div>
                  <div className="engagement-card">
                    <MessageCircle size={24} />
                    <h3>Participant report message</h3>
                    <p>Send a current progress update to keep supporters engaged after signup.</p>
                    <textarea
                      rows={5}
                      value={broadcastMessage || campaignReportMessage(activeCampaign)}
                      onChange={(event) => setBroadcastMessage(event.target.value)}
                    />
                    <div className="button-row">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void copyText(broadcastMessage || campaignReportMessage(activeCampaign))}
                      >
                        Copy update
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setBroadcastMessage(campaignReportMessage(activeCampaign))}
                      >
                        Refresh report
                      </button>
                    </div>
                    {copiedMessage && <p className="success-message">{copiedMessage}</p>}
                  </div>
                </div>
              </Panel>

              <Panel title="Send message to participants" icon={<Users />}>
                {campaignSigners.length === 0 ? (
                  <p>No participants yet. Once people sign, WhatsApp and SMS actions appear here.</p>
                ) : (
                  <div className="participant-message-list">
                    {campaignSigners.map((signer) => {
                      const message = broadcastMessage || campaignReportMessage(activeCampaign);
                      return (
                        <div className="participant-message-card" key={signer.id}>
                          <div>
                            <strong>{signer.name}</strong>
                            <span>{signer.phone}</span>
                            <small>{[signer.panchayat, signer.block, signer.district, signer.state].filter(Boolean).join(", ")}</small>
                          </div>
                          <div className="button-row">
                            <a
                              className="secondary-link-button"
                              href={whatsAppLink(signer.phone, message)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                            <a className="secondary-link-button" href={smsLink(signer.phone, message)}>
                              SMS
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="info-message">
                  Production bulk delivery should connect WhatsApp Business API and an Indian SMS provider such as
                  MSG91, Gupshup, Twilio, or Airtel IQ.
                </p>
              </Panel>
            </section>
          ) : (
            <NoCampaignPanel
              title="Engagement tools need a campaign"
              description="Create and publish a campaign before sending WhatsApp, SMS, or social updates."
              onCreateCampaign={createCampaign}
            />
          )
        )}

        {activeTab === "saas" && (
          <section className="page-stack">
            <Panel title="Customer organization subscription" icon={<Building2 />}>
              <form className="form-grid">
                <Field label="Organization name">
                  <input
                    placeholder="Organization or customer name"
                    value={organization.name}
                    onChange={(event) => setOrganization({ ...organization, name: event.target.value })}
                  />
                </Field>
                <Field label="Owner email">
                  <input
                    type="email"
                    placeholder="owner@example.org"
                    value={organization.ownerEmail}
                    onChange={(event) => setOrganization({ ...organization, ownerEmail: event.target.value })}
                  />
                </Field>
                <Field label="Billing email">
                  <input
                    type="email"
                    placeholder="billing@example.org"
                    value={organization.billingEmail}
                    onChange={(event) => setOrganization({ ...organization, billingEmail: event.target.value })}
                  />
                </Field>
                <Field label="Subscription plan">
                  <select
                    value={organization.plan}
                    onChange={(event) => selectSubscriptionPlan(event.target.value as BillingPlan)}
                  >
                    {subscriptionPlans.map((plan) => (
                      <option key={plan.name}>{plan.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Subscription status">
                  <select
                    value={organization.subscriptionStatus}
                    onChange={(event) =>
                      setOrganization({
                        ...organization,
                        subscriptionStatus: event.target.value as Organization["subscriptionStatus"]
                      })
                    }
                  >
                    <option>Trial</option>
                    <option>Active</option>
                    <option>Past due</option>
                    <option>Cancelled</option>
                  </select>
                </Field>
                <Field label="Trial ends">
                  <input
                    type="date"
                    value={organization.trialEndsAt}
                    onChange={(event) => setOrganization({ ...organization, trialEndsAt: event.target.value })}
                  />
                </Field>
                <Field label="Team seats">
                  <input
                    type="number"
                    min="1"
                    value={organization.seats}
                    onChange={(event) => setOrganization({ ...organization, seats: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Monthly signature limit">
                  <input
                    type="number"
                    min="0"
                    value={organization.monthlySignatureLimit}
                    onChange={(event) =>
                      setOrganization({ ...organization, monthlySignatureLimit: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Monthly scan limit">
                  <input
                    type="number"
                    min="0"
                    value={organization.monthlyScanLimit}
                    onChange={(event) => setOrganization({ ...organization, monthlyScanLimit: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Custom domain">
                  <input
                    placeholder="campaigns.customer.in"
                    value={organization.customDomain}
                    onChange={(event) => setOrganization({ ...organization, customDomain: event.target.value })}
                  />
                </Field>
                <Field label="Payment reference">
                  <input
                    placeholder="Stripe/customer reference"
                    value={organization.paymentReference}
                    onChange={(event) => setOrganization({ ...organization, paymentReference: event.target.value })}
                  />
                </Field>
                <label className="check-row wide">
                  <input
                    type="checkbox"
                    checked={organization.customBranding}
                    onChange={(event) => setOrganization({ ...organization, customBranding: event.target.checked })}
                  />
                  Enable custom branding for this organization
                </label>
              </form>
            </Panel>

            <div className="plan-grid">
              {subscriptionPlans.map((plan) => (
                <PlanCard
                  key={plan.name}
                  title={plan.name}
                  price={plan.price}
                  features={[
                    `${plan.campaignLimit} campaign${plan.campaignLimit === 1 ? "" : "s"}`,
                    `${plan.monthlySignatureLimit.toLocaleString()} signatures/month`,
                    `${plan.monthlyScanLimit.toLocaleString()} scans/month`,
                    ...plan.features
                  ]}
                  highlighted={organization.plan === plan.name}
                  actionLabel={organization.plan === plan.name ? "Selected" : `Select ${plan.name}`}
                  onSelect={() => selectSubscriptionPlan(plan.name)}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === "ideas" && (
          <section className="page-stack">
            <Panel title="Suggested next features" icon={<Sparkles />}>
              <div className="idea-grid">
                {suggestedFeatures.map((feature) => (
                  <div className="idea-card" key={feature.title}>
                    <span className="status-pill">{feature.tier}</span>
                    <h3>{feature.title}</h3>
                    <p>{feature.benefit}</p>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Production readiness checklist" icon={<ShieldCheck />}>
              <ul className="checklist">
                <li>Connect a backend database such as Postgres before real customer use.</li>
                <li>Add secure login, roles, tenant isolation, and audit logs for SaaS customers.</li>
                <li>Use a payment processor such as Stripe for subscriptions and invoices.</li>
                <li>Review local laws for consent, privacy, scanned signatures, and official submissions.</li>
                <li>Add server-side OCR processing for large PDF batches and handwritten forms.</li>
              </ul>
            </Panel>
          </section>
        )}
      </main>
    </div>
  );
}

function NavButton({
  icon,
  label,
  tab,
  activeTab,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  tab: Tab;
  activeTab: Tab;
  onClick: (tab: Tab) => void;
}) {
  return (
    <button className={activeTab === tab ? "active" : ""} type="button" onClick={() => onClick(tab)}>
      {icon}
      {label}
    </button>
  );
}

function Hero({
  campaign,
  metrics,
  authority
}: {
  campaign: Campaign;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authority?: AuthorityRule;
}) {
  return (
    <div className="hero">
      <div>
        <span className="eyebrow">{campaign.status} campaign</span>
        <h1>{campaign.title}</h1>
        <p>{campaign.description}</p>
        <div className="button-row">
          <span className="status-pill">{campaign.category}</span>
          <span className="status-pill">{campaign.location}</span>
          {authority && <span className="status-pill">{authority.name}</span>}
        </div>
      </div>
      <div className="hero-progress">
        <strong>{metrics.progress}%</strong>
        <span>{metrics.verified.toLocaleString()} verified signatures</span>
        <div className="progress">
          <div style={{ width: `${metrics.progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? "wide field" : "field"}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function IndiaLocationFields({
  idPrefix,
  values,
  onChange,
  locationOverrides
}: {
  idPrefix: string;
  values: LocationWithPin;
  onChange: (values: LocationWithPin) => void;
  locationOverrides: LocationOverrides;
}) {
  const districtOptions = getDistrictOptions(values.state, locationOverrides);
  const blockOptions = getBlockOptions(values.state, values.district, locationOverrides);
  const panchayatOptions = getPanchayatOptions(values.state, values.district, values.block, locationOverrides);
  const pinOptions = getPinOptions(values);

  function updateLocation(nextValues: LocationWithPin) {
    const matchedPin = findPinCode(nextValues);
    onChange({ ...nextValues, postalCode: matchedPin ?? nextValues.postalCode });
  }

  function selectState(state: string) {
    const districts = getDistrictOptions(state, locationOverrides);
    const district = districts[0] ?? "";
    const blocks = getBlockOptions(state, district, locationOverrides);
    const block = blocks[0] ?? "";
    const panchayats = getPanchayatOptions(state, district, block, locationOverrides);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ state, district, block, panchayat, postalCode: "" });
  }

  function selectDistrict(district: string) {
    const blocks = getBlockOptions(values.state, district, locationOverrides);
    const block = blocks[0] ?? "";
    const panchayats = getPanchayatOptions(values.state, district, block, locationOverrides);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ ...values, district, block, panchayat, postalCode: "" });
  }

  function selectBlock(block: string) {
    const panchayats = getPanchayatOptions(values.state, values.district, block, locationOverrides);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ ...values, block, panchayat, postalCode: "" });
  }

  function updatePin(postalCode: string) {
    const normalizedPin = postalCode.replace(/\D/g, "").slice(0, 6);
    const matchedLocation = findLocationByPin(normalizedPin);
    onChange(matchedLocation ? { ...matchedLocation } : { ...values, postalCode: normalizedPin });
  }

  return (
    <>
      <Field label="State / Union Territory">
        <select
          value={values.state}
          onChange={(event) => selectState(event.target.value)}
        >
          <option value="">Select state</option>
          {indianStatesAndUnionTerritories.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </Field>
      <Field label="District">
        <select
          value={values.district}
          onChange={(event) => selectDistrict(event.target.value)}
          disabled={!values.state || districtOptions.length === 0}
        >
          <option value="">{districtOptions.length ? "Select district" : "Select state first"}</option>
          {districtOptions.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Block / Tehsil / Taluk">
        <select
          value={values.block}
          onChange={(event) => selectBlock(event.target.value)}
          disabled={!values.district || blockOptions.length === 0}
        >
          <option value="">{blockOptions.length ? "Select block / ward group" : "Select district first"}</option>
          {blockOptions.map((block) => (
            <option key={block} value={block}>
              {block}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Gram Panchayat / Ward">
        <select
          value={values.panchayat}
          onChange={(event) => updateLocation({ ...values, panchayat: event.target.value })}
          disabled={!values.block || panchayatOptions.length === 0}
        >
          <option value="">{panchayatOptions.length ? "Select panchayat / ward" : "Select block first"}</option>
          {panchayatOptions.map((panchayat) => (
            <option key={panchayat} value={panchayat}>
              {panchayat}
            </option>
          ))}
        </select>
      </Field>
      <Field label="PIN code">
        <input
          inputMode="numeric"
          list={`${idPrefix}-pins`}
          maxLength={6}
          placeholder="Auto-filled or enter 6-digit PIN"
          value={values.postalCode}
          onChange={(event) => updatePin(event.target.value)}
        />
        <datalist id={`${idPrefix}-pins`}>
          {pinOptions.map((pinCode) => (
            <option key={pinCode} value={pinCode} />
          ))}
        </datalist>
      </Field>
    </>
  );
}

function signerFieldLabel(field: string) {
  const labels: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    state: "State",
    district: "District",
    block: "Block / Tehsil / Taluk",
    panchayat: "Gram Panchayat / Ward",
    address: "Street address / house details",
    postalCode: "PIN code",
    comment: "Comment"
  };

  return labels[field] ?? field;
}

function getCampaignBaseUrl(organization: Organization) {
  if (organization.customDomain.trim()) {
    return `https://${organization.customDomain.trim().replace(/^https?:\/\//, "")}`;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "https://voiceup.in";
}

function renderCampaignMessage(
  template: string,
  campaign: Campaign,
  metrics: ReturnType<typeof getCampaignMetrics>
) {
  return template
    .split("{{campaign}}").join(campaign.title)
    .split("{{url}}").join(campaign.shareUrl)
    .split("{{verified}}").join(metrics.verified.toLocaleString())
    .split("{{total}}").join(metrics.total.toLocaleString())
    .split("{{goal}}").join(campaign.goal.toLocaleString())
    .split("{{progress}}").join(`${metrics.progress}%`);
}

function whatsAppLink(phone: string, message: string) {
  const normalizedPhone = phone.replace(/\D/g, "");
  const baseUrl = normalizedPhone ? `https://wa.me/${normalizedPhone}` : "https://wa.me/";
  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

function smsLink(phone: string, message: string) {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  return `sms:${normalizedPhone}?&body=${encodeURIComponent(message)}`;
}

function BarList({ data, emptyLabel }: { data: Record<string, number>; emptyLabel: string }) {
  const max = Math.max(...Object.values(data), 1);
  const entries = Object.entries(data).sort(([first], [second]) => first.localeCompare(second));
  if (entries.length === 0) return <p>{emptyLabel}</p>;
  return (
    <div className="bar-list">
      {entries.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <span>{label}</span>
          <div>
            <i style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ReportBlock({ title, data }: { title: string; data: Record<string, number> }) {
  return (
    <div className="report-block">
      <h3>{title}</h3>
      <BarList data={data} emptyLabel="No report data yet." />
    </div>
  );
}

function PlanCard({
  title,
  price,
  features,
  highlighted,
  actionLabel,
  onSelect
}: {
  title: string;
  price: string;
  features: string[];
  highlighted?: boolean;
  actionLabel?: string;
  onSelect?: () => void;
}) {
  return (
    <div className={highlighted ? "plan-card highlighted" : "plan-card"}>
      <h3>{title}</h3>
      <strong>{price}</strong>
      <ul>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {onSelect && (
        <button className={actionLabel === "Selected" ? "primary-button" : "secondary-button"} type="button" onClick={onSelect}>
          {actionLabel ?? "Select plan"}
        </button>
      )}
    </div>
  );
}

function EmptyWorkspace({
  organization,
  onCreateCampaign,
  onOpenSubscription
}: {
  organization: Organization;
  onCreateCampaign: () => void;
  onOpenSubscription: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="marketing-banner">
        <span>Voice Up</span>
        <strong>Voice Up to make your campaign successful</strong>
        <small>Launch, promote, collect support, report progress, and keep every participant engaged.</small>
      </div>
      <span className="eyebrow">Clean workspace</span>
      <h1>Start with your Indian organization and first public campaign.</h1>
      <p>
        No demo campaigns, fake signers, or sample authority records are loaded. Configure the NGO, RWA, association,
        union, or campaign agency, choose an INR subscription, then create the first campaign.
      </p>
      <div className="onboarding-grid">
        <div>
          <strong>1. Configure organization</strong>
          <span>{organization.name || "Organization details are not set yet."}</span>
        </div>
        <div>
          <strong>2. Select subscription</strong>
          <span>
            {organization.plan} plan, {organization.subscriptionStatus.toLowerCase()} status
          </span>
        </div>
        <div>
          <strong>3. Create campaign</strong>
          <span>Set goal, public page, authority rules, PIN code routing, and required signer fields.</span>
        </div>
      </div>
      <div className="button-row">
        <button className="primary-button" type="button" onClick={onCreateCampaign}>
          <Plus size={18} /> Create first campaign
        </button>
        <button className="secondary-button" type="button" onClick={onOpenSubscription}>
          <WalletCards size={18} /> Configure subscription
        </button>
      </div>
    </div>
  );
}

function NoCampaignPanel({
  title,
  description,
  onCreateCampaign
}: {
  title: string;
  description: string;
  onCreateCampaign: () => void;
}) {
  return (
    <div className="empty-state compact-empty">
      <span className="eyebrow">No campaign data</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="primary-button" type="button" onClick={onCreateCampaign}>
        <Plus size={18} /> Create campaign
      </button>
    </div>
  );
}

function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = window.localStorage.getItem(key);
    if (!stored) return initialValue;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

const blankScanTemplate = `Name:
Email:
Phone:
State:
District:
Block:
Gram Panchayat:
Address:
PIN Code:
Comment:`;

export default App;
