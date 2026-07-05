import { CheckCircle2, ClipboardList, FileScan, Plus, QrCode, SearchCheck, Upload, UsersRound } from "lucide-react";
import type { Campaign, ScanReviewItem, Signer } from "../../types";
import { Panel } from "../../ui/Panel";
import { Field } from "../../ui/Field";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { signerFieldLabel } from "../../utils/campaign";

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
  onCreateCampaign: () => void;
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
  onApproveScan,
  onCreateCampaign
}: ScansTabProps) {
  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title="No campaign for scans"
        description="Create a campaign before importing hard-copy signatures or OCR scan batches."
        onCreateCampaign={onCreateCampaign}
      />
    );
  }

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

  return (
    <section className="page-stack">
      <Panel title="Offline Field Operations" icon={<ClipboardList />}>
        <div className="field-ops-grid">
          {[
            ["Paper sheet upload queue", campaignScanItems.length, "Real OCR/review items"],
            ["Manual supporter entry", reviewQueueItems.length, "Ready for approval"],
            ["Batch review and approval", reviewQueueItems.length, "Use existing review queue"],
            ["Duplicate detection", duplicateOrRejectedSigners.length, "Real signer status flags"],
            ["Volunteer attribution", "Provider ready", "Future field team ownership"],
            ["District tracking", districtCount, "Real signer location data"],
            ["Block tracking", blockCount, "Real signer location data"],
            ["Panchayat tracking", panchayatCount, "Real signer location data"],
            ["Import summary", importedSupporters.length, "Imported scan supporters"]
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
            <strong>QR code handout section</strong>
            <p>Use the campaign public link QR on posters and field sheets. Printable handout generation is provider-ready.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Upload paper sheet" icon={<Upload />}>
        <div className="scan-grid">
          <label className="drop-zone">
            <FileScan size={34} />
            <strong>Upload scanned image</strong>
            <span>PNG, JPG, WEBP, or scanned image files work best for OCR.</span>
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
            <span className="label">Manual OCR correction or paste</span>
            <textarea
              rows={8}
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
            />
          </div>
        </div>
        {isScanning && <p className="info-message">OCR processing is running...</p>}
        {scanMessage && <p className="success-message">{scanMessage}</p>}
      </Panel>

      <Panel title="Manual entry" icon={<Plus />}>
        <div className="form-stack">
          <p className="helper-text">
            Paste typed supporter details or corrected OCR text, then create a review item before approval.
          </p>
          <textarea
            rows={6}
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
          />
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onCreateManualScanItem}>
              <Plus size={18} /> Create review item
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="OCR/review queue" icon={<SearchCheck />}>
        <div className="review-list">
          {reviewQueueItems.length === 0 && <p>No field collection items are waiting for review.</p>}
          {reviewQueueItems.map((item) => (
            <div className="review-card" key={item.id}>
              <div>
                <strong>{item.fileName}</strong>
                <span className="status-pill" data-status={item.status}>{item.status}</span>
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
                  <Field key={field} label={signerFieldLabel(field)}>
                    <input
                      value={item.parsedSigner[field]}
                      onChange={(e) => onUpdateScanParsedSigner(item.id, field, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <details>
                <summary>Extracted text</summary>
                <pre>{item.extractedText}</pre>
              </details>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onApproveScan(item)}
                >
                  <CheckCircle2 size={18} /> Approve into signer list
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
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Imported supporters" icon={<UsersRound />}>
        <div className="activity-list">
          {importedSupporters.length === 0 && <p>No imported supporters yet.</p>}
          {importedSupporters.slice(0, 12).map((signer) => (
            <div className="activity-card" key={signer.id}>
              <div>
                <strong>{signer.name || "Unnamed supporter"}</strong>
                <span>{[signer.phone, signer.district, signer.state].filter(Boolean).join(" · ")}</span>
              </div>
              <span className="status-pill" data-status={signer.status}>{signer.status}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Duplicates/rejected" icon={<ClipboardList />}>
        <div className="activity-list">
          {duplicateOrRejectedSigners.length === 0 && rejectedScanItems.length === 0 && (
            <p>No duplicate or rejected field entries.</p>
          )}
          {duplicateOrRejectedSigners.slice(0, 8).map((signer) => (
            <div className="activity-card" key={signer.id}>
              <div>
                <strong>{signer.name || "Unnamed supporter"}</strong>
                <span>{signer.reviewerNote || "Needs follow-up before counting as verified."}</span>
              </div>
              <span className="status-pill" data-status={signer.status}>{signer.status}</span>
            </div>
          ))}
          {rejectedScanItems.slice(0, 8).map((item) => (
            <div className="activity-card" key={item.id}>
              <div>
                <strong>{item.fileName}</strong>
                <span>Rejected review item</span>
              </div>
              <span className="status-pill" data-status="rejected">Rejected</span>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
