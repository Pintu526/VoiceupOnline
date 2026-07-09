import { BarChart3, CheckCircle2, Gift, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import type { MerchantDashboardModel } from "../types";
import type { RedemptionRecord } from "../../redemption";
import type { RewardRuntimeAction } from "../../rewards/rewardRuntimeService";

interface MerchantDashboardProps {
  model: MerchantDashboardModel;
  pendingRedemptions: RedemptionRecord[];
  onAction: (action: RewardRuntimeAction) => void;
}

export function MerchantDashboard({ model, pendingRedemptions, onAction }: MerchantDashboardProps) {
  return (
    <div className="merchant-dashboard-stack">
      <div className="merchant-metric-grid">
        <article className="merchant-metric-card"><Gift size={18} /><strong>{model.issued.toLocaleString()}</strong><span>Rewards issued</span></article>
        <article className="merchant-metric-card"><CheckCircle2 size={18} /><strong>{model.redeemed.toLocaleString()}</strong><span>Rewards redeemed</span></article>
        <article className="merchant-metric-card"><ShieldCheck size={18} /><strong>{model.pending.toLocaleString()}</strong><span>Pending actions</span></article>
        <article className="merchant-metric-card"><BarChart3 size={18} /><strong>{model.redemptionRate}%</strong><span>Redemption rate</span></article>
      </div>

      <div className="merchant-two-column">
        <article className="merchant-panel">
          <strong>Pending redemptions</strong>
          <div className="merchant-list">
            {pendingRedemptions.map((redemption) => (
              <div className="merchant-list-row" key={redemption.id}>
                <div>
                  <strong>{redemption.rewardId}</strong>
                  <small>{redemption.supporterId} • {redemption.pointsCost.toLocaleString()} pts</small>
                </div>
                <div className="merchant-inline-actions">
                  <button type="button" className="secondary-button" onClick={() => onAction({ type: "approve", redemptionId: redemption.id, campaignId: redemption.campaignId, supporterId: redemption.supporterId })}>Approve</button>
                  <button type="button" className="secondary-button" onClick={() => onAction({ type: "reject", redemptionId: redemption.id, campaignId: redemption.campaignId, supporterId: redemption.supporterId })}><XCircle size={14} /> Reject</button>
                  <button type="button" className="secondary-button" onClick={() => onAction({ type: "refund", redemptionId: redemption.id, campaignId: redemption.campaignId, supporterId: redemption.supporterId })}><RotateCcw size={14} /> Refund</button>
                </div>
              </div>
            ))}
            {pendingRedemptions.length === 0 && <p className="helper-text">No pending reward reservations.</p>}
          </div>
        </article>

        <article className="merchant-panel">
          <strong>Top campaigns</strong>
          <div className="merchant-list">
            {model.topCampaigns.map((item) => (
              <div className="merchant-list-row" key={item.campaignId}>
                <div>
                  <strong>{item.campaignLabel}</strong>
                  <small>{item.issued.toLocaleString()} issued • {item.redeemed.toLocaleString()} redeemed</small>
                </div>
              </div>
            ))}
            {model.topCampaigns.length === 0 && <p className="helper-text">Campaign performance appears after reward activity.</p>}
          </div>
          <strong>Top supporters</strong>
          <div className="merchant-list">
            {model.topSupporters.map((item) => (
              <div className="merchant-list-row" key={item.supporterId}>
                <div>
                  <strong>{item.supporterLabel}</strong>
                  <small>{item.redeemedCount.toLocaleString()} redeemed • {item.pointsBurned.toLocaleString()} pts burned</small>
                </div>
              </div>
            ))}
            {model.topSupporters.length === 0 && <p className="helper-text">Supporter redemption leaders appear after completions.</p>}
          </div>
        </article>
      </div>
    </div>
  );
}

export default MerchantDashboard;