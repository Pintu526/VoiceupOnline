import type { ReactNode } from "react";

export type BusinessOsApplicationStatus =
  | "LIVE"
  | "COMING SOON"
  | "IN PROGRESS"
  | "PLANNING"
  | "BETA"
  | "UNDER MAINTENANCE";

interface ApplicationStatusCardProps {
  id?: string;
  icon: ReactNode;
  name: string;
  description: string;
  status: BusinessOsApplicationStatus;
  statusDisplay?: string;
  statusLabel: string;
  launchLabel?: string;
  enabled: boolean;
  onLaunch?: () => void;
  eta?: string;
}

const statusClassName: Record<BusinessOsApplicationStatus, string> = {
  LIVE: "live",
  "COMING SOON": "coming-soon",
  "IN PROGRESS": "in-progress",
  PLANNING: "planning",
  BETA: "beta",
  "UNDER MAINTENANCE": "under-maintenance"
};

export function ApplicationStatusCard({
  id,
  icon,
  name,
  description,
  status,
  statusDisplay,
  statusLabel,
  launchLabel,
  enabled,
  onLaunch,
  eta
}: ApplicationStatusCardProps) {
  const canLaunch = enabled && status === "LIVE" && typeof onLaunch === "function";
  const statusClass = statusClassName[status] ?? "planning";

  return (
    <article id={id} className="business-os-app-row" aria-label={name}>
      <div className="business-os-app-summary">
        <span className="business-os-app-icon" aria-hidden="true">{icon}</span>
        <div className="business-os-app-copy">
          <strong>{name}</strong>
          <p>{description}</p>
        </div>
      </div>

      <div className="business-os-app-meta">
        <span className="business-os-app-meta-label">{statusLabel}</span>
        <span className={`business-os-app-status business-os-app-status--${statusClass}`}>
          {statusDisplay ?? status}
        </span>
        {eta && <small>{eta}</small>}
      </div>

      {canLaunch && launchLabel && (
        <button
          type="button"
          className="secondary-button business-os-app-launch"
          onClick={onLaunch}
        >
          {launchLabel}
        </button>
      )}
    </article>
  );
}
