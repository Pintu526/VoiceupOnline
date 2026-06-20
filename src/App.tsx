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
  WalletCards
} from "lucide-react";
import Tesseract from "tesseract.js";
import { initialAuthorities, initialCampaigns, initialOrganization, initialSigners, suggestedFeatures } from "./data";
import {
  createId,
  createScanReviewItem,
  detectDuplicate,
  exportCsv,
  exportPdf,
  getCampaignMetrics,
  getCampaignSigners,
  groupSignersByDay,
  groupSignersByWeek,
  makePublicSigner,
  matchAuthority
} from "./lib";
import type { AuthorityRule, BillingPlan, Campaign, CampaignCategory, Organization, ScanReviewItem, Signer } from "./types";

type Tab = "dashboard" | "campaigns" | "public" | "scans" | "reports" | "saas" | "ideas";

const categories: CampaignCategory[] = ["Civic", "Environment", "Education", "Health", "Transport", "Housing", "Other"];
const plans: BillingPlan[] = ["Starter", "Professional", "Enterprise"];

const blankSigner = {
  name: "",
  email: "",
  phone: "",
  address: "",
  postalCode: "",
  comment: ""
};

function App() {
  const [campaigns, setCampaigns] = usePersistentState<Campaign[]>("voiceup-campaigns", initialCampaigns);
  const [signers, setSigners] = usePersistentState<Signer[]>("voiceup-signers", initialSigners);
  const [authorities, setAuthorities] = usePersistentState<AuthorityRule[]>("voiceup-authorities", initialAuthorities);
  const [organization, setOrganization] = usePersistentState<Organization>("voiceup-organization", initialOrganization);
  const [scanItems, setScanItems] = usePersistentState<ScanReviewItem[]>("voiceup-scan-items", []);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [activeCampaignId, setActiveCampaignId] = useState(initialCampaigns[0].id);
  const [campaignDraft, setCampaignDraft] = useState<Campaign>(campaigns[0]);
  const [publicForm, setPublicForm] = useState(blankSigner);
  const [publicMessage, setPublicMessage] = useState("");
  const [scanText, setScanText] = useState(sampleScanText);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  const activeCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === activeCampaignId) ?? campaigns[0],
    [activeCampaignId, campaigns]
  );
  const campaignSigners = useMemo(
    () => getCampaignSigners(activeCampaign.id, signers),
    [activeCampaign.id, signers]
  );
  const metrics = useMemo(() => getCampaignMetrics(activeCampaign, signers), [activeCampaign, signers]);
  const authorityMatch = useMemo(() => matchAuthority(activeCampaign, authorities), [activeCampaign, authorities]);
  const dailyTotals = useMemo(() => groupSignersByDay(campaignSigners), [campaignSigners]);
  const weeklyTotals = useMemo(() => groupSignersByWeek(campaignSigners), [campaignSigners]);

  useEffect(() => {
    setCampaignDraft(activeCampaign);
  }, [activeCampaign]);

  function saveCampaign(event: FormEvent) {
    event.preventDefault();
    setCampaigns((currentCampaigns) =>
      currentCampaigns.map((campaign) => (campaign.id === campaignDraft.id ? campaignDraft : campaign))
    );
  }

  function createCampaign() {
    const campaign: Campaign = {
      id: createId("cmp"),
      title: "New Campaign",
      slug: `new-campaign-${Date.now()}`,
      category: "Civic",
      description: "Describe the issue, requested action, and why people should support it.",
      location: "Your city or district",
      postalCode: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      goal: 1000,
      status: "Draft",
      consentText:
        "I consent to this organization storing my details and using them only for this campaign submission.",
      requiredFields: ["name", "email", "phone", "address", "postalCode"],
      shareUrl: "https://voiceup.example/c/new-campaign",
      qrLabel: "VOICEUP-NEW-CAMPAIGN"
    };
    setCampaigns((currentCampaigns) => [...currentCampaigns, campaign]);
    setActiveCampaignId(campaign.id);
    setCampaignDraft(campaign);
    setActiveTab("campaigns");
  }

  function publishCampaign() {
    const publishedCampaign = {
      ...campaignDraft,
      status: "Published" as const,
      shareUrl: `https://${organization.customDomain || "voiceup.example"}/c/${campaignDraft.slug}`
    };
    setCampaignDraft(publishedCampaign);
    setCampaigns((currentCampaigns) =>
      currentCampaigns.map((campaign) => (campaign.id === publishedCampaign.id ? publishedCampaign : campaign))
    );
  }

  function submitPublicSignature(event: FormEvent) {
    event.preventDefault();
    if (!publicForm.name || !publicForm.phone) {
      setPublicMessage("Name and phone are required to sign this campaign.");
      return;
    }
    const signer = makePublicSigner(activeCampaign.id, publicForm, campaignSigners);
    setSigners((currentSigners) => [signer, ...currentSigners]);
    setPublicForm(blankSigner);
    setPublicMessage(
      signer.status === "duplicate"
        ? "Thanks. This looks like a duplicate, so it was sent to review."
        : "Thank you. Your signature has been recorded."
    );
  }

  async function uploadScan(file: File) {
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Online</strong>
            <span>Campaign SaaS</span>
          </div>
        </div>
        <nav className="nav">
          <NavButton icon={<BarChart3 />} label="Dashboard" tab="dashboard" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Megaphone />} label="Campaign admin" tab="campaigns" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<Globe2 />} label="Public signing" tab="public" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FileScan />} label="Scan hard copies" tab="scans" activeTab={activeTab} onClick={setActiveTab} />
          <NavButton icon={<FileText />} label="Reports" tab="reports" activeTab={activeTab} onClick={setActiveTab} />
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
            <select value={activeCampaignId} onChange={(event) => setActiveCampaignId(event.target.value)}>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.title}
                </option>
              ))}
            </select>
          </div>
          <button className="secondary-button" type="button" onClick={createCampaign}>
            <Plus size={18} /> New campaign
          </button>
        </header>

        {activeTab === "dashboard" && (
          <section className="page-stack">
            <Hero campaign={activeCampaign} metrics={metrics} authority={authorityMatch?.authority} />
            <div className="metric-grid">
              <MetricCard icon={<Users />} label="Total signers" value={metrics.total} detail={`${metrics.verified} verified`} />
              <MetricCard icon={<Globe2 />} label="Online signatures" value={metrics.online} detail="Collected from public page" />
              <MetricCard icon={<FileScan />} label="Scanned records" value={metrics.scanned} detail={`${metrics.pending} awaiting review`} />
              <MetricCard icon={<SearchCheck />} label="Duplicates" value={metrics.duplicates} detail="Flagged automatically" />
            </div>

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
                    <small>{authorityMatch.score}% routing confidence by category, location, and postal code.</small>
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
                <Field label="Postal code">
                  <input
                    value={campaignDraft.postalCode}
                    onChange={(event) => setCampaignDraft({ ...campaignDraft, postalCode: event.target.value })}
                  />
                </Field>
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
                <Field label="QR label">
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
                <div className="wide required-fields">
                  <span className="label">Required signer details</span>
                  {(["name", "email", "phone", "address", "postalCode"] as Campaign["requiredFields"]).map((field) => (
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
                      {field}
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
          <section className="public-layout">
            <div className="campaign-page">
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
                <input
                  placeholder="Address"
                  value={publicForm.address}
                  onChange={(event) => setPublicForm({ ...publicForm, address: event.target.value })}
                />
                <input
                  placeholder="Postal code"
                  value={publicForm.postalCode}
                  onChange={(event) => setPublicForm({ ...publicForm, postalCode: event.target.value })}
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
              </form>
            </Panel>
          </section>
        )}

        {activeTab === "scans" && (
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
                        {(["name", "email", "phone", "address", "postalCode", "comment"] as const).map((field) => (
                          <Field key={field} label={field}>
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
        )}

        {activeTab === "reports" && (
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
              </div>
            </Panel>
            <Panel title="Signer register" icon={<Users />}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
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
            </Panel>
          </section>
        )}

        {activeTab === "saas" && (
          <section className="page-stack">
            <Panel title="SaaS organization settings" icon={<Building2 />}>
              <form className="form-grid">
                <Field label="Organization name">
                  <input
                    value={organization.name}
                    onChange={(event) => setOrganization({ ...organization, name: event.target.value })}
                  />
                </Field>
                <Field label="Owner email">
                  <input
                    type="email"
                    value={organization.ownerEmail}
                    onChange={(event) => setOrganization({ ...organization, ownerEmail: event.target.value })}
                  />
                </Field>
                <Field label="Subscription plan">
                  <select
                    value={organization.plan}
                    onChange={(event) => setOrganization({ ...organization, plan: event.target.value as BillingPlan })}
                  >
                    {plans.map((plan) => (
                      <option key={plan}>{plan}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Trial ends">
                  <input
                    type="date"
                    value={organization.trialEndsAt}
                    onChange={(event) => setOrganization({ ...organization, trialEndsAt: event.target.value })}
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
                    value={organization.customDomain}
                    onChange={(event) => setOrganization({ ...organization, customDomain: event.target.value })}
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
              <PlanCard
                title="Starter"
                price="$29/month"
                features={["1 campaign", "Online signatures", "CSV export", "Basic dashboard"]}
              />
              <PlanCard
                title="Professional"
                price="$99/month"
                features={["Unlimited campaigns", "OCR scan review", "PDF reports", "Authority routing"]}
                highlighted
              />
              <PlanCard
                title="Enterprise"
                price="Custom"
                features={["White label", "Custom domain", "Audit logs", "API and integrations"]}
              />
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
  highlighted
}: {
  title: string;
  price: string;
  features: string[];
  highlighted?: boolean;
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

const sampleScanText = `Name: Meera Patel
Email: meera.patel@example.com
Phone: +91 90000 12005
Address: 15 River Road, North Ward
Postal Code: 56001
Comment: Please fix the water supply issue.`;

export default App;
