import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import type { AuditLogEntry } from "../../types";
import { Panel } from "../../ui/Panel";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getActionTone(action: AuditLogEntry["action"]) {
  if (action.includes("deleted") || action.includes("archived")) return "warning";
  if (action.includes("published") || action.includes("created") || action.includes("saved")) return "success";
  return "neutral";
}

function getActionLabel(action: AuditLogEntry["action"]) {
  return action
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface ActivityTabProps {
  auditLogs: AuditLogEntry[];
}

export function ActivityTab({ auditLogs }: ActivityTabProps) {
  const sortedLogs = [...auditLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const safetyEvents = sortedLogs.filter(
    (entry) => entry.action.includes("deleted") || entry.action.includes("archived")
  ).length;
  const campaignEvents = sortedLogs.filter((entry) => entry.action.startsWith("campaign.")).length;
  const locationEvents = sortedLogs.filter((entry) => entry.action.startsWith("location.")).length;

  return (
    <section className="page-stack">
      <Panel title="Admin activity and audit log" icon={<ShieldCheck />}>
        <div className="audit-summary-grid">
          <div className="audit-summary-card">
            <Clock3 size={20} />
            <span>Total events</span>
            <strong>{sortedLogs.length.toLocaleString()}</strong>
          </div>
          <div className="audit-summary-card">
            <CheckCircle2 size={20} />
            <span>Campaign events</span>
            <strong>{campaignEvents.toLocaleString()}</strong>
          </div>
          <div className="audit-summary-card">
            <ShieldCheck size={20} />
            <span>Location events</span>
            <strong>{locationEvents.toLocaleString()}</strong>
          </div>
          <div className="audit-summary-card">
            <AlertTriangle size={20} />
            <span>Safety events</span>
            <strong>{safetyEvents.toLocaleString()}</strong>
          </div>
        </div>

        {sortedLogs.length === 0 ? (
          <div className="empty-state compact-empty">
            <span className="eyebrow">Audit ready</span>
            <h2>No admin activity has been recorded yet.</h2>
            <p>
              Campaign saves, publishes, archive actions, integration updates, and location changes will appear here
              after admins use the workspace.
            </p>
          </div>
        ) : (
          <div className="activity-list">
            {sortedLogs.map((entry) => (
              <div className={`activity-card ${getActionTone(entry.action)}`} key={entry.id}>
                <div>
                  <strong>{entry.description}</strong>
                  <span>{getActionLabel(entry.action)}</span>
                  <div className="audit-chip-row">
                    <span>{entry.actor}</span>
                    {entry.campaignId && <span>Campaign {entry.campaignId}</span>}
                    {entry.metadata &&
                      Object.entries(entry.metadata).slice(0, 3).map(([key, value]) => (
                        <span key={key}>{key}: {String(value)}</span>
                      ))}
                  </div>
                </div>
                <small>
                  <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString("en-IN")}>
                    {relativeTime(entry.createdAt)}
                  </time>
                </small>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
