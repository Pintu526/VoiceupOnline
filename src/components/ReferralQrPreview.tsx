import { QrCode } from "lucide-react";
import { createQrCells } from "../utils/referrals";

interface ReferralQrPreviewProps {
  value: string;
  label: string;
  caption?: string;
  compact?: boolean;
}

export function ReferralQrPreview({ value, label, caption, compact = false }: ReferralQrPreviewProps) {
  const size = compact ? 13 : 17;
  const cells = createQrCells(value || label, size);

  return (
    <div className={compact ? "referral-qr-preview compact" : "referral-qr-preview"}>
      <div
        className="referral-qr-grid"
        aria-label={`${label} QR preview. QR rendering is provider-ready.`}
        role="img"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {cells.map((active, index) => (
          <span className={active ? "active" : ""} key={`${value}-${index}`} />
        ))}
      </div>
      <div>
        <strong><QrCode size={16} /> {label}</strong>
        {caption && <small>{caption}</small>}
        <span className="status-pill">QR provider-ready</span>
      </div>
    </div>
  );
}
