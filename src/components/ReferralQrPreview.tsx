import { QrCode } from "lucide-react";
import { QrCodeGraphic } from "./QrCodeGraphic";
import { isValidQrDestination } from "../utils/qr";
import { useTranslation } from "../i18n";

interface ReferralQrPreviewProps {
  value: string;
  label: string;
  caption?: string;
  compact?: boolean;
}

export function ReferralQrPreview({ value, label, caption, compact = false }: ReferralQrPreviewProps) {
  const { t } = useTranslation();
  return (
    <div className={compact ? "referral-qr-preview compact" : "referral-qr-preview"}>
      <QrCodeGraphic value={value} label={`${label} QR code`} />
      <div>
        <strong><QrCode size={16} /> {label}</strong>
        {caption && <small>{caption}</small>}
        {isValidQrDestination(value) && <span className="status-pill">{t("campaignAdmin.links.qrReady")}</span>}
      </div>
    </div>
  );
}
