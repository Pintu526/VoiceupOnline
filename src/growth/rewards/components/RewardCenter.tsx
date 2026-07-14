import { useDeferredValue, useMemo, useState } from "react";
import { CheckCircle2, Copy, Gift, Heart, Search, Sparkles, Ticket, Trophy, WalletCards } from "lucide-react";
import type { RewardCenterModel } from "../types";
import type { RewardRuntimeAction } from "../rewardRuntimeService";
import { StatusBadge } from "../../ui";
import { useTranslation } from "../../../i18n/useTranslation";

interface RewardCenterProps {
  model: RewardCenterModel;
  campaignId: string;
  supporterId: string;
  onAction: (action: RewardRuntimeAction) => void;
}

function statusTone(eligible: boolean) {
  return eligible ? "good" as const : "warning" as const;
}

export function RewardCenter({ model, campaignId, supporterId, onAction }: RewardCenterProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const filteredCatalog = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return model.catalog;
    return model.catalog.filter((reward) => {
      const merchantName = reward.merchant?.name ?? "";
      return `${reward.label} ${reward.description} ${merchantName} ${reward.categories.join(" ")}`.toLowerCase().includes(query);
    });
  }, [deferredSearch, model.catalog]);

  return (
    <div className="reward-center-stack">
      <article className="reward-center-hero">
        <div>
          <span className="eyebrow">{t("growth.rewards.center")}</span>
          <h3>{t("growth.rewards.centerHeadline")}</h3>
          <p>{t("growth.rewards.centerDescription")}</p>
        </div>
        <div className="reward-wallet-summary">
          <WalletCards size={22} />
          <strong>{model.wallet.balance.currentBalance.toLocaleString()}</strong>
          <small>{t("growth.rewards.spendableBalance")}</small>
        </div>
      </article>

      <div className="reward-toolbar">
        <label className="reward-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("growth.rewards.searchPlaceholder")} />
        </label>
        <div className="reward-pills">
          <span><Sparkles size={14} /> {t("growth.rewards.trending")} {model.trending.length}</span>
          <span><Gift size={14} /> {t("growth.rewards.recommended")} {model.recommended.length}</span>
          <span><Heart size={14} /> {t("growth.rewards.wishlist")} {model.wishlist.length}</span>
        </div>
      </div>

      <div className="reward-carousel-grid">
        {filteredCatalog.map((reward) => (
          <article className="reward-card" key={reward.id}>
            <div className="reward-card-head">
              <strong>{reward.label}</strong>
              <StatusBadge label={reward.eligible ? t("growth.rewards.eligible") : reward.reason ?? t("growth.rewards.locked")} tone={statusTone(reward.eligible)} />
            </div>
            <p>{reward.description}</p>
            <div className="reward-card-meta">
              <span>{reward.pointsRequired.toLocaleString()} {t("growth.common.points")}</span>
              <span>{reward.remainingQuantity === Number.POSITIVE_INFINITY ? t("growth.rewards.unlimited") : `${reward.remainingQuantity} ${t("growth.rewards.left")}`}</span>
              <span>{reward.merchant?.name ?? t("growth.rewards.campaignReward")}</span>
            </div>
            <div className="reward-card-meta">
              {reward.categories.map((category) => <small key={category}>{category}</small>)}
            </div>
            <div className="reward-card-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!reward.eligible}
                onClick={() =>
                  onAction({
                    type: "reserve",
                    rewardId: reward.id,
                    campaignId,
                    supporterId,
                    dedupeKey: `${campaignId}:${supporterId}:${reward.id}:reserve:${new Date().toISOString().slice(0, 16)}`
                  })
                }
              >
                {t("growth.rewards.reserve")}
              </button>
              <button type="button" className="secondary-button" onClick={() => onAction({ type: "wishlist", rewardId: reward.id, campaignId, supporterId })}>
                <Heart size={14} /> {t(reward.wishlisted ? "growth.rewards.unsave" : "growth.rewards.wishlist")}
              </button>
            </div>
          </article>
        ))}
        {filteredCatalog.length === 0 && (
          <article className="reward-empty-state">
            <strong>{t("growth.rewards.noMatch")}</strong>
            <p>{t("growth.rewards.catalogHelp")}</p>
          </article>
        )}
      </div>

      <div className="reward-two-column">
        <article className="reward-panel">
          <div className="reward-panel-head">
            <Ticket size={18} />
            <strong>{t("growth.rewards.myCoupons")}</strong>
          </div>
          <div className="reward-list">
            {model.myCoupons.map((coupon) => (
              <div className="reward-list-row" key={coupon.id}>
                <div>
                  <strong>{coupon.verificationId}</strong>
                  <small>{coupon.barcodePlaceholder}</small>
                </div>
                <button type="button" className="secondary-button"><Copy size={14} /> {t("common.copy")}</button>
              </div>
            ))}
            {model.myCoupons.length === 0 && <p className="helper-text">{t("growth.rewards.couponsEmpty")}</p>}
          </div>
        </article>

        <article className="reward-panel">
          <div className="reward-panel-head">
            <Trophy size={18} />
            <strong>{t("growth.rewards.myRedemptions")}</strong>
          </div>
          <div className="reward-list">
            {model.myRedemptions.map((redemption) => (
              <div className="reward-list-row" key={redemption.id}>
                <div>
                  <strong>{redemption.rewardId}</strong>
                  <small>{t(`growth.rewards.status.${redemption.status}`)}</small>
                </div>
                <div className="reward-inline-actions">
                  {(redemption.status === "reserved" || redemption.status === "approved") && (
                    <button type="button" className="secondary-button" onClick={() => onAction({ type: "cancel", redemptionId: redemption.id, campaignId, supporterId })}>{t("common.cancel")}</button>
                  )}
                  {redemption.status === "approved" && (
                    <button type="button" className="primary-button" onClick={() => onAction({ type: "redeem", redemptionId: redemption.id, campaignId, supporterId })}>{t("growth.rewards.redeem")}</button>
                  )}
                  {redemption.status === "redeemed" && (
                    <button type="button" className="secondary-button" onClick={() => onAction({ type: "complete", redemptionId: redemption.id, campaignId, supporterId })}><CheckCircle2 size={14} /> {t("growth.rewards.complete")}</button>
                  )}
                </div>
              </div>
            ))}
            {model.myRedemptions.length === 0 && <p className="helper-text">{t("growth.rewards.redemptionsEmpty")}</p>}
          </div>
        </article>
      </div>
    </div>
  );
}

export default RewardCenter;
