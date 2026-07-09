import { CheckCircle2, Plus, Sparkles, WalletCards } from "lucide-react";
import type { Organization } from "../types";

interface EmptyWorkspaceProps {
  organization: Organization;
  onCreateCampaign: () => void;
  onOpenSubscription: () => void;
  createCampaignBlockReason?: string;
  onUpgradePlan: () => void;
}

export function EmptyWorkspace({
  organization,
  onCreateCampaign,
  onOpenSubscription,
  createCampaignBlockReason = "",
  onUpgradePlan
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
      <h1>Your workspace is ready for its first campaign.</h1>
      <p>
        Use Quick Start above to configure the organization, choose the right campaign shape, route
        authorities, and publish only when you are ready. Nothing is auto-published.
      </p>
      <div className="onboarding-grid">
        <div>
          <CheckCircle2 size={18} />
          <strong>1. Configure organization</strong>
          <span>{organization.name || "Add organization details and location governance."}</span>
        </div>
        <div>
          <Sparkles size={18} />
          <strong>2. Select subscription</strong>
          <span>
            {organization.plan} plan, {organization.subscriptionStatus.toLowerCase()} status
          </span>
        </div>
        <div>
          <Plus size={18} />
          <strong>3. Create campaign</strong>
          <span>
            Create and publish your campaign in 60 seconds, then edit details when needed.
          </span>
        </div>
      </div>
      <div className="button-row">
        {createCampaignBlockReason ? (
          <button className="primary-button" type="button" onClick={onUpgradePlan}>
            <WalletCards size={18} /> Upgrade Plan
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onCreateCampaign}>
            <Plus size={18} /> Create campaign
          </button>
        )}
        <button className="secondary-button" type="button" onClick={onOpenSubscription}>
          <WalletCards size={18} /> View upgrade options
        </button>
      </div>
    </div>
  );
}
