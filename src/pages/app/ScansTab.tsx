import { CheckCircle2, FileScan, Plus, SearchCheck, Upload } from "lucide-react";
import type { Campaign, ScanReviewItem } from "../../types";
import { Panel } from "../../ui/Panel";
import { Field } from "../../ui/Field";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { signerFieldLabel } from "../../utils/campaign";

interface ScansTabProps {
  activeCampaign: Campaign | undefined;
  scanItems: ScanReviewItem[];
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

  return (
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
            <button className="secondary-button" type="button" onClick={onCreateManualScanItem}>
              <Plus size={18} /> Create review item
            </button>
          </div>
        </div>
        {isScanning && <p className="info-message">OCR processing is running...</p>}
        {scanMessage && <p className="success-message">{scanMessage}</p>}
      </Panel>

      <Panel title="Scan review queue" icon={<SearchCheck />}>
        <div className="review-list">
          {campaignScanItems.length === 0 && <p>No scans are waiting for review.</p>}
          {campaignScanItems.map((item) => (
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
    </section>
  );
}
