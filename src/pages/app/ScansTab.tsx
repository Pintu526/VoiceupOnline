import {
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileScan,
  FileText,
  Plus,
  QrCode,
  SearchCheck,
  Upload,
  UsersRound
} from "lucide-react";
import type { Campaign, ScanReviewItem, Signer } from "../../types";
import { Panel } from "../../ui/Panel";
import { Field } from "../../ui/Field";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { useTranslation } from "../../i18n/useTranslation";

interface ScansTabProps {
  activeCampaign: Campaign | undefined;
  scanItems: ScanReviewItem[];
  campaignSigners: Signer[];
  setScanItems: React.Dispatch<React.SetStateAction<ScanReviewItem[]>>;
  scanText: string;
  setScanText: React.Dispatch<React.SetStateAction<string>>;
  isScanning: boolean;
  scanMessage: string;
  onUploadScan: (file: File) => void;
  onCreateManualScanItem: () => void;
  onUpdateScanParsedSigner: (
    scanId: string,
    field: keyof ScanReviewItem["parsedSigner"],
    value: string
  ) => void;
  onApproveScan: (scan: ScanReviewItem) => void;
}

export function ScansTab({
  activeCampaign,
  scanItems,
  campaignSigners,
  setScanItems,
  scanText,
  setScanText,
  isScanning,
  scanMessage,
  onUploadScan,
  onCreateManualScanItem,
  onUpdateScanParsedSigner,
  onApproveScan
}: ScansTabProps) {
  const { t } = useTranslation();
  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title={t("scans.noCampaign.title")}
        description={t("scans.noCampaign.description")}
      />
    );
  }

  const activeCampaignId = activeCampaign.id;
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

  function batchUpdateReviewItems(status: ScanReviewItem["status"]) {
    setScanItems((current) =>
      current.map((item) =>
        item.campaignId === activeCampaignId && item.status === "Needs review"
          ? { ...item, status }
          : item
      )
    );
  }

  function batchApproveReviewItems() {
    reviewQueueItems.forEach((item) => onApproveScan(item));
  }

  return (
    <section className="page-stack">
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
                if (file) onUploadScan(file);
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
        <div className="scan-grid">
          <label className="drop-zone">
            <FileScan size={34} />
            <strong>{t("scans.upload.image")}</strong>
            <span>{t("scans.upload.imageHelp")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadScan(file);
              }}
            />
          </label>
          <div>
            <span className="label">{t("scans.upload.manualCorrection")}</span>
            <textarea
              rows={8}
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
            />
          </div>
        </div>
        {isScanning && <p className="info-message">{t("scans.upload.processing")}</p>}
        {scanMessage && <p className="success-message">{scanMessage}</p>}
      </Panel>

      <Panel title={t("scans.manual.title")} icon={<Plus />}>
        <div className="form-stack">
          <p className="helper-text">
            {t("scans.manual.description")}
          </p>
          <textarea
            rows={6}
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
          />
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
              disabled={reviewQueueItems.length === 0}
              onClick={batchApproveReviewItems}
            >
              {t("scans.review.batchApprove")}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={reviewQueueItems.length === 0}
              onClick={() => batchUpdateReviewItems("Rejected")}
            >
              {t("scans.review.batchReject")}
            </button>
          </div>
        </div>
        {reviewQueueItems.length > 0 && (
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
        <div className="review-list">
          {reviewQueueItems.length === 0 && <p>{t("scans.review.empty")}</p>}
          {reviewQueueItems.map((item) => (
            <div className="review-card" key={item.id}>
              <div>
                <strong>{item.fileName}</strong>
                <span className="status-pill" data-status={item.status}>{t(`scans.status.${item.status.replace(/\s/g, "").toLowerCase()}`)}</span>
              </div>
              <div className="form-grid compact">
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
                    "postalCode",
                    "comment"
                  ] as const
                ).map((field) => (
                  <Field key={field} label={t(`scans.fields.${field}`)}>
                    <input
                      value={item.parsedSigner[field]}
                      onChange={(e) => onUpdateScanParsedSigner(item.id, field, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <details>
                <summary>{t("scans.review.extractedText")}</summary>
                <pre>{item.extractedText}</pre>
              </details>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onApproveScan(item)}
                >
                  <CheckCircle2 size={18} /> {t("scans.review.approveSigner")}
                </button>
                <button
                  className="secondary-button"
                  type="button"
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
    </section>
  );
}
