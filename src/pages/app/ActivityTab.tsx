import { ShieldCheck } from "lucide-react";
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

interface ActivityTabProps {
  auditLogs: AuditLogEntry[];
}

export function ActivityTab({ auditLogs }: ActivityTabProps) {
  return (
    <section className="page-stack">
      <Panel title="Admin activity and audit log" icon={<ShieldCheck />}>
        {auditLogs.length === 0 ? (
          <p>No admin activity has been recorded yet.</p>
        ) : (
          <div className="activity-list">
            {auditLogs.map((entry) => (
              <div className="activity-card" key={entry.id}>
                <div>
                  <strong>{entry.description}</strong>
                  <span>{entry.action}</span>
                </div>
                <small>
                  {entry.actor} · <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString("en-IN")}>{relativeTime(entry.createdAt)}</time>
                </small>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
