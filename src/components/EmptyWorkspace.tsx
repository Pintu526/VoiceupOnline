import { Plus, WalletCards } from "lucide-react";
import type { Organization } from "../types";

interface EmptyWorkspaceProps {
  organization: Organization;
  onCreateCampaign: () => void;
  onOpenSubscription: () => void;
}

export function EmptyWorkspace({
  organization,
  onCreateCampaign,
  onOpenSubscription
}: EmptyWorkspaceProps) {
  return (
    <div className="empty-state">
      <div className="marketing-banner">
        <span>Voice Up</span>
        <strong>Voice Up to make your campaign successful</strong>
        <small>
          Launch, promote, collect support, report progress, and keep every participant engaged.
        </small>
      </div>
      <span className="eyebrow">Clean workspace</span>
      <h1>Start with your Indian organization and first public campaign.</h1>
      <p>
        No demo campaigns, fake signers, or sample authority records are loaded. Configure the NGO,
        RWA, association, union, or campaign agency, choose an INR subscription, then create the
        first campaign.
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
          <span>
            Set goal, public page, authority rules, PIN code routing, and required signer fields.
          </span>
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
