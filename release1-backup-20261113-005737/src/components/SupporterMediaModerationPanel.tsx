import { useCallback, useEffect, useState } from "react";
import { getSupporterAuthClient } from "../supporterAuth.ts";

type Item = { id: string; mediaType: "photo" | "video"; caption: string;
  moderationStatus: string; createdAt: string; url: string | null };

export function SupporterMediaModerationPanel({ workspaceId, campaignId, campaignSlug }:
  { workspaceId: string; campaignId: string; campaignSlug: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const client = getSupporterAuthClient() as unknown as { functions: {
      invoke(name: string, options: { body: Record<string, unknown> }): Promise<{
        data: { items?: Item[]; error?: string } | null; error: { message?: string } | null }> } };
    const { data, error: failure } = await client.functions.invoke("voiceup-supporter-media", { body });
    if (failure || !data || data.error) throw new Error(data?.error ?? failure?.message ?? "moderation_unavailable");
    return data;
  }, []);
  const refresh = useCallback(async () => {
    const data = await invoke({ action: "moderation_list", workspaceId, campaignId, campaignSlug });
    setItems(data.items ?? []);
  }, [invoke, workspaceId, campaignId, campaignSlug]);
  useEffect(() => { let alive = true; setBusy(true); refresh().catch(e => {
    if (alive) setError(String(e));
  }).finally(() => { if (alive) setBusy(false); }); return () => { alive = false; }; }, [refresh]);
  async function decide(id: string, decision: "approved" | "rejected") {
    if (!window.confirm(`Confirm ${decision === "approved" ? "approval" : "rejection"} of this submission?`)) return;
    setBusy(true); setError("");
    try {
      await invoke({ action: "moderation_decide", workspaceId, campaignId, campaignSlug,
        mediaId: id, decision, reason: "" });
      await refresh();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <section aria-label="Campaign media moderation">
    <h2>Pending campaign media</h2>
    {error && <p role="alert">{error}</p>}
    {busy && <p>Processing…</p>}
    {!busy && items.length === 0 && <p>No pending submissions.</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 320px))", gap: 16 }}>
      {items.map(item => <article key={item.id} className="account-panel">
        {item.url && (item.mediaType === "photo" ?
          <img src={item.url} alt={item.caption || "Submitted photo"} style={{ width: "100%", height: 180, objectFit: "cover" }} /> :
          <video src={item.url} controls preload="metadata" style={{ width: "100%" }} />)}
        <p>{item.caption}</p><p>Status: {item.moderationStatus}</p>
        <button type="button" disabled={busy} onClick={() => void decide(item.id, "approved")}>Approve</button>{" "}
        <button type="button" disabled={busy} onClick={() => void decide(item.id, "rejected")}>Reject</button>
      </article>)}
    </div>
  </section>;
}
