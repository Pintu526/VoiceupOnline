import { BarChart3, CheckCircle2, Gift, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import type { MerchantDashboardModel } from "../types";
import type { RedemptionRecord } from "../../redemption";
import type { RewardRuntimeAction } from "../../rewards/rewardRuntimeService";
import { useTranslation } from "../../../i18n/useTranslation";

interface MerchantDashboardProps {
  model: MerchantDashboardModel;
  pendingRedemptions: RedemptionRecord[];
  onAction: (action: RewardRuntimeAction) => void;
}

export function MerchantDashboard({ model, pendingRedemptions, onAction }: MerchantDashboardProps) {
  const { t } = useTranslation();
  return (
    <div className="merchant-dashboard-stack">
      <div className="merchant-metric-grid">
        <article className="merchant-metric-card"><Gift size={18} /><strong>{model.issued.toLocaleString()}</strong><span>{t("growth.merchant.rewardsIssued")}</span></article>
        <article className="merchant-metric-card"><CheckCircle2 size={18} /><strong>{model.redeemed.toLocaleString()}</strong><span>{t("growth.merchant.rewardsRedeemed")}</span></article>
        <article className="merchant-metric-card"><ShieldCheck size={18} /><strong>{model.pending.toLocaleString()}</strong><span>{t("growth.merchant.pendingActions")}</span></article>
        <article className="merchant-metric-card"><BarChart3 size={18} /><strong>{model.redemptionRate}%</strong><span>{t("growth.rewards.redemptionRate")}</span></article>
      </div>

      <div className="merchant-two-column">
        <article className="merchant-panel">
          <strong>{t("growth.merchant.pendingRedemptions")}</strong>
          <div className="merchant-list">
            {pendingRedemptions.map((redemption) => (
              <div className="merchant-list-row" key={redemption.id}>
                <div>
                  <strong>{redemption.rewardId}</strong>
                  <small>{redemption.supporterId} • {redemption.pointsCost.toLocaleString()} {t("growth.common.points")}</small>
                </div>
                <div className="merchant-inline-actions">
                  <button type="button" className="secondary-button" onClick={() => onAction({ type: "approve", redemptionId: redemption.id, campaignId: redemption.campaignId, supporterId: redemption.supporterId })}>{t("growth.merchant.approve")}</button>
                  <button type="button" className="secondary-button" onClick={() => onAction({ type: "reject", redemptionId: redemption.id, campaignId: redemption.campaignId, supporterId: redemption.supporterId })}><XCircle size={14} /> {t("growth.merchant.reject")}</button>
                  <button type="button" className="secondary-button" onClick={() => onAction({ type: "refund", redemptionId: redemption.id, campaignId: redemption.campaignId, supporterId: redemption.supporterId })}><RotateCcw size={14} /> {t("growth.merchant.refund")}</button>
                </div>
              </div>
            ))}
            {pendingRedemptions.length === 0 && <p className="helper-text">{t("growth.merchant.noPending")}</p>}
          </div>
        </article>

        <article className="merchant-panel">
          <strong>{t("growth.merchant.topCampaigns")}</strong>
          <div className="merchant-list">
            {model.topCampaigns.map((item) => (
              <div className="merchant-list-row" key={item.campaignId}>
                <div>
                  <strong>{item.campaignLabel}</strong>
                  <small>{item.issued.toLocaleString()} {t("growth.merchant.issued")} • {item.redeemed.toLocaleString()} {t("growth.merchant.redeemed")}</small>
                </div>
              </div>
            ))}
            {model.topCampaigns.length === 0 && <p className="helper-text">{t("growth.merchant.campaignsEmpty")}</p>}
          </div>
          <strong>{t("growth.merchant.topSupporters")}</strong>
          <div className="merchant-list">
            {model.topSupporters.map((item) => (
              <div className="merchant-list-row" key={item.supporterId}>
                <div>
                  <strong>{item.supporterLabel}</strong>
                  <small>{item.redeemedCount.toLocaleString()} {t("growth.merchant.redeemed")} • {item.pointsBurned.toLocaleString()} {t("growth.merchant.pointsBurned")}</small>
                </div>
              </div>
            ))}
            {model.topSupporters.length === 0 && <p className="helper-text">{t("growth.merchant.supportersEmpty")}</p>}
          </div>
        </article>
      </div>
    </div>
  );
}

export default MerchantDashboard;
