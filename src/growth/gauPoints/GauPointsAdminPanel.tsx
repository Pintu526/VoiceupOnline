import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchGauPointsConfiguration,
  saveDisabledGauPointsConfiguration,
  type GauPointsCampaignConfiguration
} from "./remote";

interface Props {
  client: SupabaseClient;
  workspaceId: string;
  campaignId: string;
  enabled: boolean;
}

type EditableConfiguration = Pick<GauPointsCampaignConfiguration,
  "verifiedSigningPoints" | "verifiedRegistrationReferralPoints" | "branchFactor" |
  "maximumRound" | "roundContributionPercentage">;

export function GauPointsAdminPanel({ client, workspaceId, campaignId, enabled }: Props) {
  const [configuration, setConfiguration] = useState<GauPointsCampaignConfiguration | null>(null);
  const [draft, setDraft] = useState<EditableConfiguration | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setConfiguration(null);
    setDraft(null);
    setMessage("");
    if (!enabled) return () => { active = false; };
    void fetchGauPointsConfiguration(client, workspaceId, campaignId)
      .then((value) => {
        if (!active) return;
        setConfiguration(value);
        setDraft({
          verifiedSigningPoints: value.verifiedSigningPoints,
          verifiedRegistrationReferralPoints: value.verifiedRegistrationReferralPoints,
          branchFactor: value.branchFactor,
          maximumRound: value.maximumRound,
          roundContributionPercentage: value.roundContributionPercentage
        });
      })
      .catch(() => { if (active) setMessage("GauPoints configuration is unavailable for this campaign."); });
    return () => { active = false; };
  }, [client, workspaceId, campaignId, enabled]);

  if (!enabled) return null;

  function update(key: keyof EditableConfiguration, value: string) {
    const parsed = Number(value);
    setDraft((current) => current ? { ...current, [key]: parsed } : current);
  }

  async function save() {
    if (!draft || configuration?.enabled) return;
    setSaving(true);
    setMessage("");
    try {
      const next = await saveDisabledGauPointsConfiguration(client, workspaceId, campaignId, draft);
      setConfiguration(next);
      setMessage("Disabled GauPoints configuration saved. No points are being issued.");
    } catch {
      setMessage("GauPoints configuration could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="gaupoints-panel" aria-labelledby="gaupoints-admin-title">
      <h2 id="gaupoints-admin-title">GauPoints campaign controls</h2>
      <p>
        Status: <strong>{configuration?.enabled ? "Issuance enabled" : "Issuance disabled"}</strong>.
        GauPoints are noncash and cannot be redeemed.
      </p>
      {configuration?.enabled && (
        <p role="alert">This activated configuration is read-only here. Service-level approval is required for activation changes.</p>
      )}
      {draft && (
        <div className="form-grid two-column">
          <label>Verified signing points
            <input type="number" min="0" step="1" value={draft.verifiedSigningPoints}
              disabled={configuration?.enabled || saving}
              onChange={(event) => update("verifiedSigningPoints", event.target.value)} />
          </label>
          <label>Verified referral points
            <input type="number" min="0" step="1" value={draft.verifiedRegistrationReferralPoints}
              disabled={configuration?.enabled || saving}
              onChange={(event) => update("verifiedRegistrationReferralPoints", event.target.value)} />
          </label>
          <label>Branch factor
            <input type="number" min="2" max="10" step="1" value={draft.branchFactor}
              disabled={configuration?.enabled || saving}
              onChange={(event) => update("branchFactor", event.target.value)} />
          </label>
          <label>Maximum round
            <input type="number" min="1" max="12" step="1" value={draft.maximumRound}
              disabled={configuration?.enabled || saving}
              onChange={(event) => update("maximumRound", event.target.value)} />
          </label>
          <label>Round contribution percentage
            <input type="number" min="0" max="100" step="1" value={draft.roundContributionPercentage}
              disabled={configuration?.enabled || saving}
              onChange={(event) => update("roundContributionPercentage", event.target.value)} />
          </label>
        </div>
      )}
      <div className="account-card-actions">
        <button type="button" className="primary-button" disabled={!draft || configuration?.enabled || saving}
          onClick={() => void save()}>
          {saving ? "Saving…" : "Save disabled configuration"}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
