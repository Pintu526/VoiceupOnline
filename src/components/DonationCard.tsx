import type { Campaign } from "../types";

interface DonationCardProps {
  campaign: Campaign;
  compact?: boolean;
}

export function DonationCard({ campaign, compact = false }: DonationCardProps) {
  const upiLink = campaign.donationUpiId
    ? `upi://pay?pa=${encodeURIComponent(campaign.donationUpiId)}&pn=${encodeURIComponent(campaign.title)}&cu=INR`
    : "";

  return (
    <div className={compact ? "donation-card compact-donation" : "donation-card"}>
      <span className="eyebrow">Support the campaign</span>
      <strong>{campaign.donationCaption || "Voluntary contribution"}</strong>
      <div className="button-row">
        {campaign.donationAllowOneTime && <span className="status-pill">One-time</span>}
        {campaign.donationAllowRecurring && <span className="status-pill">Recurring pledge</span>}
      </div>
      {campaign.donationQrImage && (
        <img className="donation-qr" alt="Donation UPI QR" src={campaign.donationQrImage} />
      )}
      {campaign.donationUpiId && (
        <a className="secondary-link-button" href={upiLink}>
          Pay via UPI: {campaign.donationUpiId}
        </a>
      )}
      {campaign.donationPaymentDetails && <p>{campaign.donationPaymentDetails}</p>}
    </div>
  );
}
