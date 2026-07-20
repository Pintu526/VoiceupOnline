import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  FileScan,
  FileText,
  Plus,
  QrCode,
  RotateCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UsersRound
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Campaign, ConfirmationQueueItem, ScanCaptureMetadata, ScanReviewItem, Signer } from "../../types";
import {
  createScanApprovalLock,
  type ScanApprovalCounts,
  type ScanApprovalLock
} from "../../scanApproval";
import {
  confirmationTemplatePreviews,
  smsConfirmationAdapter,
  whatsappConfirmationAdapter
} from "../../confirmationQueue";
import { compressScanImage, validateScanImageFile } from "../../mobileScanCapture";
import { parseSignerFromText } from "../../lib";
import { Panel } from "../../ui/Panel";
import { Field } from "../../ui/Field";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { useTranslation } from "../../i18n/useTranslation";
import { getPublicCampaignUrlForOrigin } from "../../utils/links";
import { createDocumentDiagnosticId, logDocumentIntelligenceStage } from "../../documentIntelligence";

interface ScansTabProps {
  activeCampaign: Campaign | undefined;
  scanItems: ScanReviewItem[];
  campaignSigners: Signer[];
  setScanItems: React.Dispatch<React.SetStateAction<ScanReviewItem[]>>;
  confirmationQueue: ConfirmationQueueItem[];
  scanText: string;
  setScanText: React.Dispatch<React.SetStateAction<string>>;
  isScanning: boolean;
  scanMessage: string;
  secureFieldUploadAvailable: boolean;
  secureFieldUploadMessage: string;
  onUploadScan: (file: File, metadata?: ScanCaptureMetadata) => Promise<boolean>;
  onOpenPrivateScan: (scan: ScanReviewItem) => Promise<string>;
  onCreateManualScanItem: () => void;
  onUpdateScanParsedSigner: (
    scanId: string,
    field: keyof ScanReviewItem["parsedSigner"],
    value: string
  ) => void;
  onApproveScan: (scan: ScanReviewItem | ScanReviewItem[]) => Promise<ScanApprovalCounts>;
}

const guidedReviewFields = [
  ["name", "name"],
  ["phone", "mobile"],
  ["address", "village"],
  ["district", "district"],
  ["state", "state"]
] as const;

type GuidedReviewField = (typeof guidedReviewFields)[number][0];

function getFieldConfidence(field: GuidedReviewField, value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return { level: "missing", score: 0 } as const;
  if (field === "phone") {
    const digits = trimmedValue.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    return /^\d{10}$/.test(digits)
      ? { level: "high", score: 94 } as const
      : { level: "low", score: 42 } as const;
  }
  if (field === "name" && trimmedValue.length < 3) {
    return { level: "low", score: 48 } as const;
  }
  return { level: "high", score: field === "name" ? 92 : 88 } as const;
}

export function ScansTab({
  activeCampaign,
  scanItems,
  campaignSigners,
  setScanItems,
  confirmationQueue,
  scanText,
  setScanText,
  isScanning,
  scanMessage,
  secureFieldUploadAvailable,
  secureFieldUploadMessage,
  onUploadScan,
  onOpenPrivateScan,
  onCreateManualScanItem,
  onUpdateScanParsedSigner,
  onApproveScan
}: ScansTabProps) {
  const { t } = useTranslation();
  const approvalLockRef = useRef<ScanApprovalLock>(createScanApprovalLock());
  const [approvingScanItemIds, setApprovingScanItemIds] = useState<Set<string>>(new Set());
  const [isBatchApproving, setIsBatchApproving] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [approvalMessageIsError, setApprovalMessageIsError] = useState(false);
  const [selectedCaptureFile, setSelectedCaptureFile] = useState<File | null>(null);
  const [capturePreviewUrl, setCapturePreviewUrl] = useState("");
  const [captureRotation, setCaptureRotation] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureError, setCaptureError] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [sourceBatchId, setSourceBatchId] = useState(() => `batch-${new Date().toISOString().slice(0, 10)}`);
  const [collectorId, setCollectorId] = useState("");
  const [collectorName, setCollectorName] = useState("");
  const [paperConsentRecorded, setPaperConsentRecorded] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [noOngoingCommunications, setNoOngoingCommunications] = useState(false);
  const [consentPurpose, setConsentPurpose] = useState("Paper support confirmation");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [privateEvidenceUrl, setPrivateEvidenceUrl] = useState("");
  const [privateEvidenceError, setPrivateEvidenceError] = useState("");
  const [showCaptureNext, setShowCaptureNext] = useState(false);
  const [fieldCollectionStep, setFieldCollectionStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardApprovalSuccess, setWizardApprovalSuccess] = useState(false);
  const [ocrDiagnosticId, setOcrDiagnosticId] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (capturePreviewUrl) URL.revokeObjectURL(capturePreviewUrl);
  }, [capturePreviewUrl]);
  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title={t("scans.noCampaign.title")}
        description={t("scans.noCampaign.description")}
      />
    );
  }

  const activeCampaignId = activeCampaign.id;
  const confirmationPreviewUrl = `${getPublicCampaignUrlForOrigin(activeCampaign.slug, {
    explicitOrigin: "https://voiceup.live"
  })}?confirm=<opaque-one-time-token>`;
  const campaignScanItems = scanItems.filter((item) => item.campaignId === activeCampaign.id);
  const reviewQueueItems = campaignScanItems.filter((item) => item.status === "Needs review");
  const importedSupporters = campaignSigners.filter((signer) => signer.source === "scan");
  const duplicateOrRejectedSigners = campaignSigners.filter(
    (signer) => signer.status === "duplicate" || signer.status === "rejected"
  );
  const rejectedScanItems = campaignScanItems.filter((item) => item.status === "Rejected");
  const districtCount = new Set(campaignSigners.map((signer) => signer.district).filter(Boolean)).size;
  const blockCount = new Set(campaignSigners.map((signer) => signer.block).filter(Boolean)).size;
  const panchayatCount = new Set(campaignSigners.map((signer) => signer.panchayat).filter(Boolean)).size;
  const duplicateReviewItems = reviewQueueItems.filter((item) =>
    campaignSigners.some((signer) => {
      const samePhone = item.parsedSigner.phone && signer.phone && item.parsedSigner.phone === signer.phone;
      const sameNameLocation =
        item.parsedSigner.name &&
        signer.name &&
        item.parsedSigner.name.trim().toLowerCase() === signer.name.trim().toLowerCase() &&
        [item.parsedSigner.state, item.parsedSigner.district, item.parsedSigner.block, item.parsedSigner.panchayat]
          .join("|")
          .toLowerCase() ===
          [signer.state, signer.district, signer.block, signer.panchayat].join("|").toLowerCase();
      return samePhone || sameNameLocation;
    })
  );
  const missingPhoneReviewItems = reviewQueueItems.filter((item) => !item.parsedSigner.phone.trim());
  const approvedScanItems = campaignScanItems.filter((item) => item.status === "Approved");
  const currentReviewItem = reviewQueueItems[Math.min(reviewIndex, Math.max(0, reviewQueueItems.length - 1))];
  const campaignConfirmationQueue = confirmationQueue.filter((item) => item.campaignId === activeCampaign.id);
  const manualReviewSigner = parseSignerFromText(scanText);
  const firstIncompleteField = currentReviewItem
    ? guidedReviewFields.find(([field]) =>
        getFieldConfidence(field, currentReviewItem.parsedSigner[field]).level !== "high"
      )?.[0]
    : undefined;

  function updateManualReviewField(label: string, value: string) {
    setScanText((current) => {
      const fieldLine = new RegExp(`^${label}:.*$`, "mi");
      if (fieldLine.test(current)) {
        return current.replace(fieldLine, `${label}: ${value}`);
      }
      return `${current.trimEnd()}\n${label}: ${value}`;
    });
  }

  function selectCaptureFile(file: File) {
    const nextDiagnosticId = createDocumentDiagnosticId(file.name);
    logDocumentIntelligenceStage(nextDiagnosticId, "1. Image received", {
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      lastModified: file.lastModified
    });
    const validationError = validateScanImageFile(file);
    if (validationError) {
      setCaptureError(
        validationError === "file_too_large"
          ? t("scans.capture.fileTooLarge")
          : t("scans.capture.unsupportedFile")
      );
      return;
    }
    setCaptureError("");
    setOcrDiagnosticId(nextDiagnosticId);
    setSelectedCaptureFile(file);
    setCapturePreviewUrl(URL.createObjectURL(file));
    setCaptureRotation(0);
    setCaptureProgress(10);
    setCapturedAt(new Date().toISOString());
    setWizardApprovalSuccess(false);
    setFieldCollectionStep(1);
  }

  function clearCapture() {
    setSelectedCaptureFile(null);
    setCapturePreviewUrl("");
    setCaptureRotation(0);
    setCaptureProgress(0);
    setCaptureError("");
    setOcrDiagnosticId("");
  }

  async function uploadSelectedCapture() {
    if (!selectedCaptureFile) return;
    if (!secureFieldUploadAvailable) {
      setCaptureError(secureFieldUploadMessage);
      return;
    }
    setCaptureError("");
    setCaptureProgress(25);
    const activeDiagnosticId = ocrDiagnosticId || createDocumentDiagnosticId(selectedCaptureFile.name);
    let preprocessingCompleted = false;
    try {
      const preparedFile = await compressScanImage(selectedCaptureFile, captureRotation);
      preprocessingCompleted = true;
      logDocumentIntelligenceStage(activeDiagnosticId, "2. Image preprocessing completed", {
        succeeded: true,
        inputFileName: selectedCaptureFile.name,
        inputType: selectedCaptureFile.type,
        inputSizeBytes: selectedCaptureFile.size,
        outputFileName: preparedFile.name,
        outputType: preparedFile.type,
        outputSizeBytes: preparedFile.size,
        rotationDegrees: captureRotation,
        transformed: preparedFile !== selectedCaptureFile
      });
      setCaptureProgress(55);
      const consentCapturedAt =
        paperConsentRecorded || smsConsent || whatsappConsent ? new Date().toISOString() : undefined;
      const uploaded = await onUploadScan(preparedFile, {
        ocrDiagnosticId: activeDiagnosticId,
        sourceBatchId,
        collectorId,
        collectorName,
        capturedAt: capturedAt || new Date().toISOString(),
        paperConsentRecorded,
        smsConsent: noOngoingCommunications ? false : smsConsent,
        whatsappConsent: noOngoingCommunications ? false : whatsappConsent,
        noOngoingCommunications,
        consentPurpose,
        consentCapturedAt,
        consentCapturedBy: collectorName || collectorId
      });
      if (!uploaded) {
        setCaptureProgress(0);
        setCaptureError(t("scans.capture.uploadFailed"));
        return;
      }
      setCaptureProgress(100);
      clearCapture();
      setReviewIndex(0);
      setFieldCollectionStep(2);
    } catch (preprocessingOrUploadError) {
      if (!preprocessingCompleted) {
        logDocumentIntelligenceStage(activeDiagnosticId, "2. Image preprocessing completed", {
          succeeded: false,
          error: preprocessingOrUploadError instanceof Error
            ? preprocessingOrUploadError.message
            : "Unknown image preprocessing error"
        });
      }
      setCaptureProgress(0);
      setCaptureError(t("scans.capture.uploadFailed"));
    }
  }

  function updateScanMetadata(scanId: string, updates: Partial<ScanReviewItem>) {
    setScanItems((current) =>
      current.map((item) => item.id === scanId ? { ...item, ...updates } : item)
    );
  }

  async function openPrivateEvidence(item: ScanReviewItem) {
    setPrivateEvidenceError("");
    try {
      setPrivateEvidenceUrl(await onOpenPrivateScan(item));
    } catch {
      setPrivateEvidenceUrl("");
      setPrivateEvidenceError(t("scans.capture.privateOpenFailed"));
    }
  }

  function batchUpdateReviewItems(status: ScanReviewItem["status"]) {
    setScanItems((current) =>
      current.map((item) =>
        item.campaignId === activeCampaignId && item.status === "Needs review"
          ? { ...item, status }
          : item
      )
    );
  }

  function formatApprovalCounts(counts: ScanApprovalCounts) {
    return [
      `${t("scans.review.approvedCount")}: ${counts.approved}`,
      `${t("scans.review.alreadyApprovedCount")}: ${counts.skippedAlreadyApproved}`,
      `${t("scans.review.skippedDuplicateCount")}: ${counts.skippedDuplicate}`,
      `Validation failed: ${counts.validationFailed}`,
      `Consent missing: ${counts.consentMissing}`,
      `Stale/conflict: ${counts.staleConflict}`,
      `${t("scans.review.failedCount")}: ${counts.failed}`
    ].join(" · ");
  }

  async function approveReviewItem(item: ScanReviewItem): Promise<ScanApprovalCounts | null> {
    if (!approvalLockRef.current.startSingle(item.id)) return null;
    setApprovingScanItemIds((current) => new Set(current).add(item.id));
    setApprovalMessageIsError(false);
    setApprovalMessage(t("scans.review.processing"));
    try {
      await Promise.resolve();
      const counts = await onApproveScan(item);
      setShowCaptureNext(counts.approved > 0);
      setApprovalMessageIsError(
        counts.failed > 0
          || counts.validationFailed > 0
          || counts.consentMissing > 0
          || counts.staleConflict > 0
          || counts.skippedDuplicate > 0
      );
      setApprovalMessage(
        counts.operatorMessage || formatApprovalCounts(counts)
      );
      return counts;
    } catch {
      setApprovalMessageIsError(true);
      setApprovalMessage(t("scans.review.approvalFailed"));
      return null;
    } finally {
      approvalLockRef.current.finishSingle(item.id);
      setApprovingScanItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function approveWizardReviewItem(item: ScanReviewItem) {
    const counts = await approveReviewItem(item);
    if (!counts || counts.approved !== 1) return;
    setReviewIndex((current) => Math.min(current, Math.max(0, reviewQueueItems.length - 2)));
    setWizardApprovalSuccess(true);
  }

  async function batchApproveReviewItems() {
    const scanItemIds = reviewQueueItems.map((item) => item.id);
    if (!approvalLockRef.current.startBatch(scanItemIds)) return;
    setIsBatchApproving(true);
    setApprovingScanItemIds(new Set(scanItemIds));
    setApprovalMessageIsError(false);
    setApprovalMessage(t("scans.review.batchProcessing"));
    try {
      await Promise.resolve();
      const counts = await onApproveScan(reviewQueueItems);
      setApprovalMessageIsError(
        counts.failed > 0
          || counts.validationFailed > 0
          || counts.consentMissing > 0
          || counts.staleConflict > 0
          || counts.skippedDuplicate > 0
      );
      setApprovalMessage(formatApprovalCounts(counts));
    } catch {
      setApprovalMessageIsError(true);
      setApprovalMessage(t("scans.review.approvalFailed"));
    } finally {
      approvalLockRef.current.finishBatch();
      setApprovingScanItemIds(new Set());
      setIsBatchApproving(false);
    }
  }

  return (
    <section className="page-stack">
      <Panel title={t("scans.workflow.title")} icon={<FileScan />}>
        <div className="field-collection-wizard">
          <div className="field-collection-stepper" aria-label={t("scans.workflow.progressLabel")}>
            {([
              [1, "captureUpload"],
              [2, "aiReview"],
              [3, "humanVerify"],
              [4, "approve"]
            ] as const).map(([step, label]) => (
              <button
                className={fieldCollectionStep === step ? "is-active" : fieldCollectionStep > step ? "is-complete" : ""}
                type="button"
                key={step}
                disabled={step > 1 && !currentReviewItem && !wizardApprovalSuccess}
                onClick={() => {
                  setWizardApprovalSuccess(false);
                  setFieldCollectionStep(step);
                }}
              >
                <span>{fieldCollectionStep > step ? "✓" : step}</span>
                {t(`scans.workflow.steps.${label}`)}
              </button>
            ))}
          </div>

          {fieldCollectionStep === 1 && (
            <div className="field-collection-step-card">
              <div className="field-collection-step-heading">
                <Camera size={24} />
                <div>
                  <span>{t("scans.workflow.stepLabel")} 1</span>
                  <h3>{t("scans.workflow.steps.captureUpload")}</h3>
                </div>
              </div>
              <div className="mobile-capture-actions">
                <label className="primary-button mobile-file-button">
                  <Camera size={20} /> {t("scans.capture.takePhoto")}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) selectCaptureFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                <label className="secondary-button mobile-file-button">
                  <FileScan size={20} /> {t("scans.capture.chooseImage")}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) selectCaptureFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {capturePreviewUrl && (
                <div className="mobile-capture-preview">
                  <img
                    src={capturePreviewUrl}
                    alt={t("scans.capture.previewAlt")}
                    style={{ transform: `rotate(${captureRotation}deg)` }}
                  />
                  <div className="button-row">
                    <button className="secondary-button" type="button" onClick={() => setCaptureRotation((value) => (value + 90) % 360)}>
                      <RotateCw size={18} /> {t("scans.capture.rotate")}
                    </button>
                    <button className="secondary-button" type="button" onClick={() => { clearCapture(); cameraInputRef.current?.click(); }}>
                      {t("scans.capture.retake")}
                    </button>
                  </div>
                </div>
              )}
              <label className="field-collection-paper-consent">
                <input type="checkbox" checked={paperConsentRecorded} onChange={(event) => setPaperConsentRecorded(event.target.checked)} />
                {t("scans.capture.paperConsent")}
              </label>
              {selectedCaptureFile && (
                <button className="primary-button mobile-upload-button" type="button" disabled={isScanning || !secureFieldUploadAvailable} onClick={() => void uploadSelectedCapture()}>
                  <ShieldCheck size={19} /> {isScanning ? t("scans.capture.uploading") : t("scans.capture.secureUpload")}
                </button>
              )}
              {(isScanning || captureProgress > 0) && <progress className="scan-upload-progress" max={100} value={isScanning ? Math.max(captureProgress, 60) : captureProgress} />}
              {captureError && <p className="error-message">{captureError}</p>}
              {scanMessage && scanMessage !== secureFieldUploadMessage && <p className="info-message">{scanMessage}</p>}
            </div>
          )}

          {fieldCollectionStep === 2 && (
            <div className="field-collection-step-card">
              <div className="field-collection-step-heading">
                <Sparkles size={24} />
                <div>
                  <span>{t("scans.workflow.stepLabel")} 2</span>
                  <h3>{t("scans.workflow.steps.aiReview")}</h3>
                </div>
              </div>
              {!currentReviewItem ? (
                <p className="helper-text">{t("scans.review.empty")}</p>
              ) : (
                <>
                  <div className="field-collection-ai-fields">
                    {guidedReviewFields.map(([field, label]) => {
                      const confidence = getFieldConfidence(field, currentReviewItem.parsedSigner[field]);
                      return (
                        <div className="field-collection-ai-field" key={field}>
                          <span>{t(`scans.fields.${label}`)}</span>
                          <strong>{currentReviewItem.parsedSigner[field] || t("scans.workflow.notDetected")}</strong>
                          <small data-confidence={confidence.level}>
                            {confidence.score}% {t(`scans.workflow.confidence.${confidence.level}`)}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  <button className="primary-button field-collection-next-button" type="button" onClick={() => setFieldCollectionStep(3)}>
                    {t("scans.workflow.verifyFields")} <ChevronRight size={19} />
                  </button>
                </>
              )}
            </div>
          )}

          {fieldCollectionStep === 3 && (
            <div className="field-collection-step-card">
              <div className="field-collection-step-heading">
                <UserCheck size={24} />
                <div>
                  <span>{t("scans.workflow.stepLabel")} 3</span>
                  <h3>{t("scans.workflow.steps.humanVerify")}</h3>
                </div>
              </div>
              {!currentReviewItem ? (
                <p className="helper-text">{t("scans.review.empty")}</p>
              ) : (
                <>
                  <div className="form-grid compact field-collection-verify-fields">
                    {guidedReviewFields.map(([field, label]) => {
                      const confidence = getFieldConfidence(field, currentReviewItem.parsedSigner[field]);
                      return (
                        <div className={`field-collection-verify-field ${confidence.level !== "high" ? "needs-attention" : ""}`} key={field}>
                          <Field label={t(`scans.fields.${label}`)}>
                            <input
                              autoFocus={field === firstIncompleteField}
                              value={currentReviewItem.parsedSigner[field]}
                              onChange={(event) => onUpdateScanParsedSigner(currentReviewItem.id, field, event.target.value)}
                            />
                          </Field>
                          <small data-confidence={confidence.level}>
                            {confidence.score}% {t(`scans.workflow.confidence.${confidence.level}`)}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="field-collection-wizard-actions">
                    <button className="secondary-button" type="button" onClick={() => setFieldCollectionStep(2)}>
                      <ChevronLeft size={19} /> {t("scans.workflow.back")}
                    </button>
                    <button className="primary-button" type="button" onClick={() => setFieldCollectionStep(4)}>
                      {t("scans.workflow.continueToApprove")} <ChevronRight size={19} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {fieldCollectionStep === 4 && (
            <div className="field-collection-step-card field-collection-approve-step">
              {wizardApprovalSuccess ? (
                <div className="field-collection-success-card" role="status">
                  <CheckCircle2 size={40} />
                  <strong>{t("scans.workflow.supporterAdded")}</strong>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setWizardApprovalSuccess(false);
                      setFieldCollectionStep(currentReviewItem ? 2 : 1);
                    }}
                  >
                    {t("scans.workflow.nextReview")} <ChevronRight size={19} />
                  </button>
                </div>
              ) : !currentReviewItem ? (
                <p className="helper-text">{t("scans.review.empty")}</p>
              ) : (
                <>
                  <div className="field-collection-step-heading">
                    <CheckCircle2 size={24} />
                    <div>
                      <span>{t("scans.workflow.stepLabel")} 4</span>
                      <h3>{t("scans.workflow.steps.approve")}</h3>
                    </div>
                  </div>
                  <button
                    className="field-collection-approve-button"
                    type="button"
                    disabled={isBatchApproving || approvingScanItemIds.has(currentReviewItem.id)}
                    aria-busy={approvingScanItemIds.has(currentReviewItem.id)}
                    onClick={() => void approveWizardReviewItem(currentReviewItem)}
                  >
                    <CheckCircle2 size={26} />
                    {approvingScanItemIds.has(currentReviewItem.id) ? t("scans.review.processing") : t("scans.workflow.approveSupporter")}
                  </button>
                  {approvalMessage && approvalMessageIsError && <p className="error-message">{approvalMessage}</p>}
                  <button className="secondary-button" type="button" onClick={() => setFieldCollectionStep(3)}>
                    <ChevronLeft size={19} /> {t("scans.workflow.back")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </Panel>

      <details className="field-collection-advanced">
        <summary>{t("scans.workflow.advanced")}</summary>
        <div className="page-stack">
      <Panel title={t("scans.import.title")} icon={<FileScan />}>
        <div className="paper-import-hero">
          <div>
            <span className="eyebrow">Voiceup v0.6</span>
            <h2>{t("scans.import.headline")}</h2>
            <p>{t("scans.import.description")}</p>
          </div>
          <div className="import-summary-card">
            <span>{t("scans.import.summary")}</span>
            <strong>{campaignScanItems.length.toLocaleString()} {t("scans.common.rows")}</strong>
            <small>
              {approvedScanItems.length} {t("scans.status.approved")} - {duplicateReviewItems.length} {t("scans.status.duplicates")} - {rejectedScanItems.length} {t("scans.status.rejected")} - {missingPhoneReviewItems.length} {t("scans.status.missingPhone")}
            </small>
          </div>
        </div>
        <div className="paper-import-grid">
          <label className="paper-import-option real">
            <FileScan size={28} />
            <strong>{t("scans.import.imageUpload")}</strong>
            <span>{t("scans.import.imageHelp")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) selectCaptureFile(file);
              }}
            />
          </label>
          <label className="paper-import-option available-after-setup">
            <FileText size={28} />
            <strong>{t("scans.import.pdfUpload")}</strong>
            <span>{t("scans.import.documentSetup")}</span>
            <input type="file" accept="application/pdf" disabled />
          </label>
          <label className="paper-import-option available-after-setup">
            <FileSpreadsheet size={28} />
            <strong>{t("scans.import.spreadsheetImport")}</strong>
            <span>{t("scans.import.spreadsheetSetup")}</span>
            <input type="file" accept=".csv,.xls,.xlsx" disabled />
          </label>
        </div>
        <div className="paper-import-fields">
          {[
            t("scans.fields.name"),
            t("scans.fields.phone"),
            t("scans.fields.email"),
            t("scans.fields.state"),
            t("scans.fields.district"),
            t("scans.fields.block"),
            t("scans.fields.panchayatWard"),
            t("scans.fields.village"),
            t("scans.fields.note"),
            t("scans.fields.source"),
            t("scans.fields.volunteer")
          ].map((field) => (
            <span key={field}>{field}</span>
          ))}
        </div>
        <p className="helper-text">{t("scans.import.optionalFields")}</p>
      </Panel>

      <Panel title={t("scans.operations.title")} icon={<ClipboardList />}>
        <div className="field-ops-grid">
          {[
            [t("scans.operations.uploadQueue"), campaignScanItems.length, t("scans.operations.realReviewItems")],
            [t("scans.operations.manualEntry"), reviewQueueItems.length, t("scans.operations.readyApproval")],
            [t("scans.operations.batchApproval"), reviewQueueItems.length, t("scans.operations.existingQueue")],
            [t("scans.operations.duplicateDetection"), duplicateOrRejectedSigners.length, t("scans.operations.realStatusFlags")],
            [t("scans.operations.volunteerAttribution"), t("scans.status.setupNeeded"), t("scans.operations.futureOwnership")],
            [t("scans.operations.districtTracking"), districtCount, t("scans.operations.realLocationData")],
            [t("scans.operations.blockTracking"), blockCount, t("scans.operations.realLocationData")],
            [t("scans.operations.panchayatTracking"), panchayatCount, t("scans.operations.realLocationData")],
            [t("scans.import.summary"), importedSupporters.length, t("scans.operations.importedSupporters")]
          ].map(([label, value, detail]) => (
            <div className="field-ops-card" key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
        <div className="qr-handout-card">
          <QrCode size={42} />
          <div>
            <strong>{t("scans.operations.qrHandout")}</strong>
            <p>{t("scans.operations.qrHelp")}</p>
          </div>
        </div>
      </Panel>

      <Panel title={t("scans.upload.title")} icon={<Upload />}>
        <div className="mobile-capture-stack">
          <div className="mobile-capture-actions">
            <label className="primary-button mobile-file-button">
              <Camera size={20} /> {t("scans.capture.takePhoto")}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) selectCaptureFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="secondary-button mobile-file-button">
              <FileScan size={20} /> {t("scans.capture.chooseImage")}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) selectCaptureFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {capturePreviewUrl && (
            <div className="mobile-capture-preview">
              <img
                src={capturePreviewUrl}
                alt={t("scans.capture.previewAlt")}
                style={{ transform: `rotate(${captureRotation}deg)` }}
              />
              <div className="button-row">
                <button className="secondary-button" type="button" onClick={() => setCaptureRotation((value) => (value + 90) % 360)}>
                  <RotateCw size={18} /> {t("scans.capture.rotate")}
                </button>
                <button className="secondary-button" type="button" onClick={() => { clearCapture(); cameraInputRef.current?.click(); }}>
                  {t("scans.capture.retake")}
                </button>
              </div>
            </div>
          )}

          <div className="form-grid compact mobile-capture-metadata">
            <Field label={t("scans.capture.batchId")}>
              <input value={sourceBatchId} onChange={(event) => setSourceBatchId(event.target.value)} />
            </Field>
            <Field label={t("scans.capture.collectorId")}>
              <input value={collectorId} onChange={(event) => setCollectorId(event.target.value)} />
            </Field>
            <Field label={t("scans.capture.collectorName")}>
              <input value={collectorName} onChange={(event) => setCollectorName(event.target.value)} />
            </Field>
            <Field label={t("scans.capture.consentPurpose")}>
              <input value={consentPurpose} onChange={(event) => setConsentPurpose(event.target.value)} />
            </Field>
          </div>

          <div className="scan-consent-card">
            <strong>{t("scans.capture.consentTitle")}</strong>
            <label><input type="checkbox" checked={paperConsentRecorded} onChange={(event) => setPaperConsentRecorded(event.target.checked)} /> {t("scans.capture.paperConsent")}</label>
            <label><input type="checkbox" checked={smsConsent} disabled={noOngoingCommunications} onChange={(event) => setSmsConsent(event.target.checked)} /> {t("scans.capture.smsConsent")}</label>
            <label><input type="checkbox" checked={whatsappConsent} disabled={noOngoingCommunications} onChange={(event) => setWhatsappConsent(event.target.checked)} /> {t("scans.capture.whatsappConsent")}</label>
            <label><input type="checkbox" checked={noOngoingCommunications} onChange={(event) => {
              setNoOngoingCommunications(event.target.checked);
              if (event.target.checked) { setSmsConsent(false); setWhatsappConsent(false); }
            }} /> {t("scans.capture.noOngoing")}</label>
          </div>

          {selectedCaptureFile && (
            <button className="primary-button mobile-upload-button" type="button" disabled={isScanning || !secureFieldUploadAvailable} onClick={() => void uploadSelectedCapture()}>
              <ShieldCheck size={19} /> {isScanning ? t("scans.capture.uploading") : t("scans.capture.secureUpload")}
            </button>
          )}
          {secureFieldUploadMessage && (
            <p className={secureFieldUploadAvailable ? "success-message" : "error-message"}>
              {secureFieldUploadAvailable ? "Secure field-upload access is active." : secureFieldUploadMessage}
            </p>
          )}
          {(isScanning || captureProgress > 0) && <progress className="scan-upload-progress" max={100} value={isScanning ? Math.max(captureProgress, 60) : captureProgress} />}
          {captureError && <p className="error-message">{captureError}</p>}
          {scanMessage && scanMessage !== secureFieldUploadMessage && (
            <p className={scanMessage.toLowerCase().includes("failed") || scanMessage.toLowerCase().includes("unavailable") ? "error-message" : "info-message"}>{scanMessage}</p>
          )}
        </div>
      </Panel>

      <Panel title={t("scans.manual.title")} icon={<Plus />}>
        <div className="form-stack">
          <p className="helper-text">
            {t("scans.manual.description")}
          </p>
          <div className="form-grid compact scan-review-primary-fields">
            {(
              [
                ["name", "Name", "name"],
                ["phone", "Phone", "mobile"],
                ["address", "Address", "village"],
                ["district", "District", "district"],
                ["state", "State", "state"]
              ] as const
            ).map(([field, sourceLabel, displayLabel]) => (
              <Field key={field} label={t(`scans.fields.${displayLabel}`)}>
                <input
                  value={manualReviewSigner[field]}
                  onChange={(event) => updateManualReviewField(sourceLabel, event.target.value)}
                />
              </Field>
            ))}
          </div>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onCreateManualScanItem}>
              <Plus size={18} /> {t("scans.manual.createReview")}
            </button>
          </div>
        </div>
      </Panel>

      <Panel title={t("scans.review.title")} icon={<SearchCheck />}>
        <div className="batch-review-toolbar">
          <div>
            <span className="eyebrow">{t("scans.review.batchReview")}</span>
            <strong>{reviewQueueItems.length.toLocaleString()} {t("scans.review.rowsWaiting")}</strong>
          </div>
          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              disabled={
                reviewQueueItems.length === 0 ||
                isBatchApproving ||
                approvalLockRef.current.hasSingleLocks()
              }
              onClick={batchApproveReviewItems}
            >
              {isBatchApproving ? t("scans.review.batchProcessing") : t("scans.review.batchApprove")}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={reviewQueueItems.length === 0 || approvingScanItemIds.size > 0}
              onClick={() => batchUpdateReviewItems("Rejected")}
            >
              {t("scans.review.batchReject")}
            </button>
          </div>
        </div>
        {approvalMessage && (
          <p className={approvalMessageIsError ? "error-message" : "info-message"}>
            {approvalMessage}
          </p>
        )}
        {showCaptureNext && (
          <button className="secondary-button capture-next-button" type="button" onClick={() => { setShowCaptureNext(false); cameraInputRef.current?.click(); }}>
            <Camera size={18} /> {t("scans.capture.captureNext")}
          </button>
        )}
        {false && reviewQueueItems.length > 0 && (
          <div className="manual-correction-table table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("scans.fields.name")}</th>
                  <th>{t("scans.fields.phone")}</th>
                  <th>{t("scans.fields.email")}</th>
                  <th>{t("scans.fields.state")}</th>
                  <th>{t("scans.fields.district")}</th>
                  <th>{t("scans.fields.block")}</th>
                  <th>{t("scans.fields.panchayatWard")}</th>
                  <th>{t("scans.fields.village")}</th>
                  <th>{t("scans.fields.note")}</th>
                  <th>{t("scans.fields.source")}</th>
                  <th>{t("scans.fields.volunteer")}</th>
                  <th>{t("scans.fields.duplicate")}</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueueItems.map((item) => {
                  const isDuplicate = duplicateReviewItems.some((duplicate) => duplicate.id === item.id);
                  return (
                    <tr key={item.id}>
                      {(["name", "phone", "email", "state", "district", "block", "panchayat"] as const).map((field) => (
                        <td key={field}>
                          <input
                            value={item.parsedSigner[field]}
                            onChange={(event) => onUpdateScanParsedSigner(item.id, field, event.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <input
                          value={item.parsedSigner.address}
                          onChange={(event) => onUpdateScanParsedSigner(item.id, "address", event.target.value)}
                          placeholder={t("scans.fields.villagePlaceholder")}
                        />
                      </td>
                      <td>
                        <input
                          value={item.parsedSigner.comment}
                          onChange={(event) => onUpdateScanParsedSigner(item.id, "comment", event.target.value)}
                        />
                      </td>
                      <td>{t("scans.status.paper")}</td>
                      <td>{t("scans.status.setupNeeded")}</td>
                      <td>{isDuplicate ? t("scans.status.possibleDuplicate") : item.parsedSigner.phone ? t("scans.status.clear") : t("scans.status.missingPhone")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {currentReviewItem && (
          <div className="single-review-navigator">
            <button className="secondary-button" type="button" disabled={reviewIndex <= 0} onClick={() => setReviewIndex((value) => Math.max(0, value - 1))}>
              <ChevronLeft size={18} /> {t("scans.review.previous")}
            </button>
            <strong>{Math.min(reviewIndex + 1, reviewQueueItems.length)} / {reviewQueueItems.length}</strong>
            <button className="secondary-button" type="button" disabled={reviewIndex >= reviewQueueItems.length - 1} onClick={() => setReviewIndex((value) => Math.min(reviewQueueItems.length - 1, value + 1))}>
              {t("scans.review.next")} <ChevronRight size={18} />
            </button>
          </div>
        )}
        <div className="review-list">
          {reviewQueueItems.length === 0 && <p>{t("scans.review.empty")}</p>}
          {(currentReviewItem ? [currentReviewItem] : []).map((item) => (
            <div className="review-card" key={item.id}>
              <div>
                <strong>{item.fileName}</strong>
                <span className="status-pill" data-status={item.status}>{t(`scans.status.${item.status.replace(/\s/g, "").toLowerCase()}`)}</span>
              </div>
              <div className="scan-review-form-heading">
                <strong>{t("scans.review.supporterDetails")}</strong>
                <span>{t("scans.review.supporterDetailsHelp")}</span>
              </div>
              <div className="form-grid compact scan-review-primary-fields">
                {(
                  [
                    ["name", "name"],
                    ["phone", "mobile"],
                    ["address", "village"],
                    ["district", "district"],
                    ["state", "state"]
                  ] as const
                ).map(([field, label]) => (
                  <Field key={field} label={t(`scans.fields.${label}`)}>
                    <input
                      value={item.parsedSigner[field]}
                      onChange={(e) => onUpdateScanParsedSigner(item.id, field, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <details className="scan-review-secondary-fields">
                <summary>{t("scans.review.additionalFields")}</summary>
                <div className="form-grid compact">
                  {(["email", "block", "panchayat", "postalCode", "comment"] as const).map((field) => (
                    <Field key={field} label={t(`scans.fields.${field}`)}>
                      <input
                        value={item.parsedSigner[field]}
                        onChange={(e) => onUpdateScanParsedSigner(item.id, field, e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </details>
              <div className="form-grid compact mobile-capture-metadata">
                <Field label={t("scans.capture.batchId")}>
                  <input value={item.sourceBatchId ?? ""} onChange={(event) => updateScanMetadata(item.id, { sourceBatchId: event.target.value })} />
                </Field>
                <Field label={t("scans.capture.collectorId")}>
                  <input value={item.collectorId ?? ""} onChange={(event) => updateScanMetadata(item.id, { collectorId: event.target.value })} />
                </Field>
                <Field label={t("scans.capture.collectorName")}>
                  <input value={item.collectorName ?? ""} onChange={(event) => updateScanMetadata(item.id, { collectorName: event.target.value })} />
                </Field>
                <Field label={t("scans.capture.consentPurpose")}>
                  <input value={item.consentPurpose ?? ""} onChange={(event) => updateScanMetadata(item.id, { consentPurpose: event.target.value })} />
                </Field>
              </div>
              <div className="scan-consent-card">
                <strong>{t("scans.capture.consentTitle")}</strong>
                <label><input type="checkbox" checked={item.paperConsentRecorded ?? false} onChange={(event) => updateScanMetadata(item.id, {
                  paperConsentRecorded: event.target.checked,
                  consentCapturedAt: event.target.checked ? new Date().toISOString() : item.consentCapturedAt,
                  consentCapturedBy: item.collectorName || item.collectorId
                })} /> {t("scans.capture.paperConsent")}</label>
                <label><input type="checkbox" checked={item.smsConsent ?? false} disabled={item.noOngoingCommunications ?? false} onChange={(event) => updateScanMetadata(item.id, {
                  smsConsent: event.target.checked,
                  consentCapturedAt: event.target.checked ? new Date().toISOString() : item.consentCapturedAt,
                  consentCapturedBy: item.collectorName || item.collectorId
                })} /> {t("scans.capture.smsConsent")}</label>
                <label><input type="checkbox" checked={item.whatsappConsent ?? false} disabled={item.noOngoingCommunications ?? false} onChange={(event) => updateScanMetadata(item.id, {
                  whatsappConsent: event.target.checked,
                  consentCapturedAt: event.target.checked ? new Date().toISOString() : item.consentCapturedAt,
                  consentCapturedBy: item.collectorName || item.collectorId
                })} /> {t("scans.capture.whatsappConsent")}</label>
                <label><input type="checkbox" checked={item.noOngoingCommunications ?? false} onChange={(event) => updateScanMetadata(item.id, {
                  noOngoingCommunications: event.target.checked,
                  smsConsent: event.target.checked ? false : item.smsConsent,
                  whatsappConsent: event.target.checked ? false : item.whatsappConsent
                })} /> {t("scans.capture.noOngoing")}</label>
              </div>
              {item.filePath && (
                <div className="private-evidence-card">
                  <button className="secondary-button" type="button" disabled={!secureFieldUploadAvailable} onClick={() => void openPrivateEvidence(item)}>
                    <ShieldCheck size={18} /> {t("scans.capture.openPrivateEvidence")}
                  </button>
                  {privateEvidenceUrl && <img src={privateEvidenceUrl} alt={t("scans.capture.privateEvidenceAlt")} />}
                  {privateEvidenceError && <p className="error-message">{privateEvidenceError}</p>}
                </div>
              )}
              <details className="scan-review-ocr-text">
                <summary>{t("scans.review.viewOcrText")}</summary>
                <pre>{item.extractedText}</pre>
              </details>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  disabled={isBatchApproving || approvingScanItemIds.has(item.id)}
                  aria-busy={approvingScanItemIds.has(item.id)}
                  onClick={() => void approveReviewItem(item)}
                >
                  <CheckCircle2 size={18} /> {approvingScanItemIds.has(item.id)
                    ? t("scans.review.processing")
                    : t("scans.review.approveSigner")}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBatchApproving || approvingScanItemIds.has(item.id)}
                  onClick={() =>
                    setScanItems((current) =>
                      current.map((s) =>
                        s.id === item.id ? { ...s, status: "Rejected" } : s
                      )
                    )
                  }
                >
                  {t("scans.review.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t("scans.confirmation.title")} icon={<ShieldCheck />}>
        <div className="confirmation-preview-grid">
          <div className="confirmation-preview-card">
            <span>{t("scans.confirmation.senderIdentity")}</span>
            <strong>VoiceUp</strong>
            <small>{t("scans.confirmation.providersDisabled")}</small>
          </div>
          <div className="confirmation-preview-card">
            <span>{t("scans.confirmation.campaignName")}</span>
            <strong>{activeCampaign.title}</strong>
            <small>{confirmationPreviewUrl}</small>
          </div>
          <div className="confirmation-preview-card">
            <span>{t("scans.confirmation.queue")}</span>
            <strong>{campaignConfirmationQueue.length}</strong>
            <small>{t("scans.confirmation.localOnly")}</small>
          </div>
          <div className="confirmation-preview-card">
            <span>{t("scans.confirmation.estimatedCost")}</span>
            <strong>{t("scans.confirmation.costPlaceholder")}</strong>
            <small>SMS: {smsConfirmationAdapter.enabled ? t("scans.confirmation.enabled") : t("scans.confirmation.disabled")} · WhatsApp: {whatsappConfirmationAdapter.enabled ? t("scans.confirmation.enabled") : t("scans.confirmation.disabled")}</small>
          </div>
        </div>
        <div className="confirmation-template-list">
          {Object.entries(confirmationTemplatePreviews).map(([language, template]) => (
            <article key={language}>
              <strong>{language.toUpperCase()}</strong>
              <p>{template.replace("{campaignName}", activeCampaign.title).replace("{confirmationUrl}", confirmationPreviewUrl)}</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title={t("scans.imported.title")} icon={<UsersRound />}>
        <div className="activity-list">
          {importedSupporters.length === 0 && <p>{t("scans.imported.empty")}</p>}
          {importedSupporters.slice(0, 12).map((signer) => (
            <div className="activity-card" key={signer.id}>
              <div>
                <strong>{signer.name || t("supporters.common.unnamed")}</strong>
                <span>{[signer.phone, signer.district, signer.state].filter(Boolean).join(" · ")}</span>
              </div>
              <span className="status-pill" data-status={signer.status}>{t(`scans.status.${signer.status.replace(/\s/g, "").toLowerCase()}`)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t("scans.rejected.title")} icon={<ClipboardList />}>
        <div className="activity-list">
          {duplicateOrRejectedSigners.length === 0 && rejectedScanItems.length === 0 && (
            <p>{t("scans.rejected.empty")}</p>
          )}
          {duplicateOrRejectedSigners.slice(0, 8).map((signer) => (
            <div className="activity-card" key={signer.id}>
              <div>
                <strong>{signer.name || t("supporters.common.unnamed")}</strong>
                <span>{signer.reviewerNote || t("scans.rejected.needsFollowup")}</span>
              </div>
              <span className="status-pill" data-status={signer.status}>{t(`scans.status.${signer.status.replace(/\s/g, "").toLowerCase()}`)}</span>
            </div>
          ))}
          {rejectedScanItems.slice(0, 8).map((item) => (
            <div className="activity-card" key={item.id}>
              <div>
                <strong>{item.fileName}</strong>
                <span>{t("scans.rejected.reviewItem")}</span>
              </div>
              <span className="status-pill" data-status="rejected">{t("scans.status.rejected")}</span>
            </div>
          ))}
        </div>
      </Panel>
        </div>
      </details>
    </section>
  );
}
